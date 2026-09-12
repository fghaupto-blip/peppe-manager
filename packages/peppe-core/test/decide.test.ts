import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { decide } from '../src/decide.ts';
import { normalizeCheckin, invertScale, toCheckinRow } from '../src/scales.ts';
import { resolveMoment } from '../src/moment.ts';
import type { Checkin, PeppeInput } from '../src/types.ts';

const T = (iso: string) => new Date(iso);

function baseInput(overrides: Partial<PeppeInput> = {}): PeppeInput {
  return {
    now: T('2026-09-12T15:00:00-03:00'),
    goal: { primaryGoal: 'Maratón de Santiago', goalDate: T('2027-04-04T08:00:00-03:00'), goalTarget: 'sub 3:10', primarySport: 'running' },
    prefs: {
      timezone: 'America/Santiago',
      wakeTime: '06:00',
      breakfastTime: '07:30',
      lunchTime: '13:30',
      dinnerTime: '20:30',
      sleepTime: '22:30',
      mealPromptLeadMinutes: 20,
    },
    storedScores: null,
    checkin: null,
    nutrition: [],
    lastActivity: null,
    nextPlanned: null,
    dailyMetric: null,
    glucose: null,
    integrations: [],
    readinessHistory: [],
    evidenceCount: 0,
    ...overrides,
  };
}

function checkin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    energy: 7,
    hunger: 4,
    legsLoad: 3,
    soreness: 2,
    stress: 3,
    pain: false,
    notes: null,
    checkedAt: T('2026-09-12T14:30:00-03:00'),
    scaleVersion: 'v1',
    ...overrides,
  };
}

describe('escala de piernas (regresión del bug web/móvil)', () => {
  test('invertScale conserva los extremos', () => {
    assert.equal(invertScale(1), 10);
    assert.equal(invertScale(10), 1);
    assert.equal(invertScale(4), 7);
    assert.equal(invertScale(null), null);
  });

  test('una fila histórica sin scale_version descarta la señal de piernas', () => {
    const normalized = normalizeCheckin({
      energy: 7, hunger: 4, legs: 9, soreness: 2, stress: 3, pain: false,
      notes: null, checked_at: '2026-09-12T14:30:00-03:00',
    });
    assert.equal(normalized!.scaleVersion, 'unknown');
    assert.equal(normalized!.legsLoad, null, 'un 9 ambiguo no debe interpretarse como fresco ni como cargado');
  });

  test('una fila con legs_load ya poblada se usa tal cual', () => {
    const normalized = normalizeCheckin({
      energy: 7, hunger: 4, legs: 9, legs_load: 9, soreness: 2, stress: 3, pain: false,
      notes: null, checked_at: '2026-09-12T14:30:00-03:00',
    });
    assert.equal(normalized!.scaleVersion, 'v1');
    assert.equal(normalized!.legsLoad, 9);
  });

  test('piernas muy cargadas (9) activan atención, no estado favorable', () => {
    const d = decide(baseInput({ checkin: checkin({ legsLoad: 9 }) }));
    assert.equal(d.state, 'attention');
    assert.ok(d.why.some((r) => r.detail.includes('piernas cargadas 9')));
  });

  test('piernas frescas (2) no activan atención', () => {
    const d = decide(baseInput({ checkin: checkin({ legsLoad: 2 }), storedScores: { readiness: 78, fuel: 70, recovery: 75, load: 40, scoreDate: '2026-09-12' } }));
    assert.notEqual(d.state, 'attention');
  });

  test('toCheckinRow escribe ambas columnas y marca la versión de escala', () => {
    const row = toCheckinRow({ athleteId: 'a1', energy: 7, hunger: 4, legsLoad: 8, soreness: 3, stress: 2, pain: false, notes: null });
    assert.equal(row.legs, 8);
    assert.equal(row.legs_load, 8);
    assert.equal(row.scale_version, 'v1');
  });
});

describe('resolución del momento', () => {
  test('post entrenamiento gana sobre cualquier otra ventana', () => {
    const input = baseInput({
      now: T('2026-09-12T13:35:00-03:00'), // dentro de la ventana de almuerzo
      lastActivity: {
        id: 1, provider: 'strava', title: 'Fondo largo', sport: 'running',
        startedAt: T('2026-09-12T11:00:00-03:00'), durationSeconds: 5400, movingSeconds: 5400,
        distanceM: 20000, avgHr: 148, avgPower: null, trainingLoad: 180, tss: 110, rpe: 6,
      },
    });
    assert.equal(resolveMoment(input).key, 'post_training');
  });

  test('pre entrenamiento cuando la sesión está a menos de 3 horas', () => {
    const input = baseInput({
      now: T('2026-09-12T16:00:00-03:00'),
      nextPlanned: {
        id: 'p1', scheduledAt: T('2026-09-12T18:00:00-03:00'), title: '8x1000', sport: 'running',
        distanceTargetKm: 14, durationTargetMinutes: 75, intensity: 'umbral', notes: null, source: 'manual',
      },
    });
    assert.equal(resolveMoment(input).key, 'pre_training');
  });

  test('sin eventos cercanos en media tarde, Peppe se queda callado', () => {
    assert.equal(resolveMoment(baseInput({ now: T('2026-09-12T16:00:00-03:00') })).key, 'wait');
  });
});

describe('guardarraíl de dolor', () => {
  const painInput = baseInput({ checkin: checkin({ pain: true, legsLoad: 3, energy: 8 }) });

  test('el dolor manda aunque todo lo demás esté bien', () => {
    const d = decide(painInput);
    assert.equal(d.state, 'attention');
    assert.ok(d.guardrails.includes('pain_lock'));
    assert.equal(d.recommendation.headline, 'La molestia pasa primero.');
  });

  test('nunca recomienda modificar la sesión por su cuenta', () => {
    const d = decide(painInput);
    assert.match(d.recommendation.training, /entrenador/);
    assert.ok(d.guardrails.includes('coach_owns_plan'));
  });
});

describe('preguntas adaptativas', () => {
  test('nunca pregunta más de 3 cosas', () => {
    const d = decide(baseInput({ goal: null, now: T('2026-09-12T08:00:00-03:00') }));
    assert.ok(d.questions.length <= 3, `preguntó ${d.questions.length}`);
  });

  test('no repregunta lo que un check-in vigente ya respondió', () => {
    const d = decide(baseInput({ now: T('2026-09-12T08:00:00-03:00'), checkin: checkin({ checkedAt: T('2026-09-12T07:45:00-03:00') }) }));
    assert.equal(d.questions.filter((q) => q.id === 'energy').length, 0);
  });

  test('post entrenamiento pide RPE si la sesión llegó sin esfuerzo percibido', () => {
    const d = decide(baseInput({
      now: T('2026-09-12T12:30:00-03:00'),
      lastActivity: {
        id: 1, provider: 'garmin', title: 'Series', sport: 'running',
        startedAt: T('2026-09-12T11:00:00-03:00'), durationSeconds: 3600, movingSeconds: 3600,
        distanceM: 13000, avgHr: 160, avgPower: null, trainingLoad: 200, tss: 120, rpe: null,
      },
    }));
    assert.ok(d.questions.some((q) => q.id === 'rpe'));
  });
});

describe('determinismo y trazabilidad', () => {
  test('la misma entrada produce exactamente la misma salida', () => {
    const input = baseInput({ checkin: checkin() });
    assert.deepEqual(decide(input), decide(input));
  });

  test('toda decisión explica por qué', () => {
    const d = decide(baseInput({ checkin: checkin() }));
    assert.ok(d.why.length > 0);
    assert.ok(d.why.every((r) => r.rule && r.detail));
  });

  test('marca la versión del motor', () => {
    assert.match(decide(baseInput()).engineVersion, /^peppe-core@/);
  });
});

describe('combustible y confianza', () => {
  test('sin ninguna comida registrada el combustible baja', () => {
    const withMeal = decide(baseInput({
      nutrition: [{ id: 1, eatenAt: T('2026-09-12T13:30:00-03:00'), description: 'Arroz con pollo', photoPath: null, carbsG: 90, proteinG: 40 }],
    }));
    const without = decide(baseInput());
    assert.ok(without.scores.fuel! < withMeal.scores.fuel!);
  });

  test('sin datos, la confianza es provisional y lista lo que falta', () => {
    const d = decide(baseInput({ goal: null }));
    assert.equal(d.confidence.level, 'provisional');
    assert.ok(d.confidence.missing.includes('objetivo'));
  });

  test('compara contra el baseline propio cuando hay histórico', () => {
    const d = decide(baseInput({
      storedScores: { readiness: 80, fuel: 70, recovery: 75, load: 40, scoreDate: '2026-09-12' },
      readinessHistory: [70, 68, 72, 71, 69, 70, 73],
    }));
    assert.match(d.comparison, /sobre tu promedio/);
  });
});

describe('zona horaria del atleta', () => {
  const instant = T('2026-09-12T16:00:00-03:00'); // 16:00 en Santiago, 21:00 en Madrid

  test('mismo instante, momentos distintos según dónde esté el atleta', () => {
    const santiago = baseInput({ now: instant });
    const madrid = baseInput({ now: instant, prefs: { ...santiago.prefs!, timezone: 'Europe/Madrid' } });
    // En Santiago son las 16:00: nada que decir. En Madrid son las 21:00,
    // media hora después de la cena configurada: ventana de alimentación.
    assert.equal(resolveMoment(santiago).key, 'wait');
    assert.equal(resolveMoment(madrid).key, 'meal');
  });

  test('no depende de la zona horaria del servidor', () => {
    const before = process.env.TZ;
    process.env.TZ = 'UTC';
    const utc = resolveMoment(baseInput({ now: instant })).key;
    process.env.TZ = 'America/Santiago';
    const scl = resolveMoment(baseInput({ now: instant })).key;
    process.env.TZ = before;
    assert.equal(utc, scl);
  });
});
