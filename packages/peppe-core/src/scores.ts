import type { Confidence, ConfidenceLevel, PeppeInput, Reason, Scores } from './types.ts';
import { DEFAULT_THRESHOLDS, type Thresholds } from './thresholds.ts';
import { activityEnd, isCheckinFresh, latestMeal, minutesBetween } from './moment.ts';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Deriva scores desde las respuestas subjetivas.
 * Antes esto vivía en app/peppe-enhancer-v2.tsx (scoreFromAnswers) con pesos
 * que no coincidían con nada más del sistema. Se conservan los pesos pero
 * ahora son visibles, testeables y ajustables desde un solo lugar.
 *
 * OJO: `legsLoad` es escala de costo (alto = cargado), así que entra invertida
 * donde antes entraba directa. Ese cambio de signo es precisamente el bug que
 * hacía que la web y el móvil llegaran a conclusiones opuestas.
 */
export function deriveScoresFromCheckin(input: PeppeInput): Scores | null {
  const c = input.checkin;
  if (!c) return null;
  const { energy, hunger, legsLoad, soreness } = c;
  if (energy == null && hunger == null && legsLoad == null && soreness == null) return null;

  // Convertimos a "frescura de piernas" sólo para el cálculo interno.
  const legsFresh = legsLoad == null ? null : 11 - legsLoad;
  const e = energy ?? 6;
  const lf = legsFresh ?? 6;
  const s = soreness ?? 3;
  const h = hunger ?? 5;

  return {
    readiness: clamp(10 * (0.42 * e + 0.32 * lf + 0.26 * (11 - s))),
    recovery: clamp(10 * (0.35 * e + 0.4 * lf + 0.25 * (11 - s))),
    fuel: clamp(10 * (0.48 * e + 0.52 * (11 - h))),
    load: clamp(10 * (0.55 * s + 0.45 * (11 - lf))),
    source: 'derived',
  };
}

/** Estimación de combustible disponible cuando no hay score guardado. */
export function estimateFuel(input: PeppeInput, t: Thresholds = DEFAULT_THRESHOLDS): { value: number; why: Reason[] } {
  const f = t.fuel;
  const why: Reason[] = [];
  let value: number = f.base;

  const meal = latestMeal(input);
  if (meal) {
    const age = minutesBetween(input.now, meal.eatenAt);
    if (age <= f.recentMealMin) {
      value += f.recentMealBonus;
      why.push({ rule: 'fuel.recent_meal', detail: `Comida hace ${Math.round(age)} min: +${f.recentMealBonus}.` });
    } else if (age > f.staleMealMin) {
      value -= f.staleMealPenalty;
      why.push({ rule: 'fuel.stale_meal', detail: `Última comida hace ${Math.round(age / 60)} h: -${f.staleMealPenalty}.` });
    }
  } else {
    value -= f.noMealPenalty;
    why.push({ rule: 'fuel.no_meal', detail: `Sin ingesta registrada: -${f.noMealPenalty}.` });
  }

  const hunger = input.checkin?.hunger;
  if (hunger != null && hunger > f.hungerPivot) {
    const penalty = (hunger - f.hungerPivot) * f.hungerPenaltyPerPoint;
    value -= penalty;
    why.push({ rule: 'fuel.hunger', detail: `Hambre ${hunger}/10: -${penalty}.` });
  }

  const energy = input.checkin?.energy;
  if (energy != null) {
    const adjust = (energy - f.energyPivot) * f.energyAdjustPerPoint;
    value += adjust;
    why.push({ rule: 'fuel.energy', detail: `Energía ${energy}/10: ${adjust >= 0 ? '+' : ''}${adjust}.` });
  }

  const end = activityEnd(input);
  if (end) {
    const age = minutesBetween(input.now, end);
    if (age >= 0 && age <= t.postTrainingWindowMin) {
      value -= f.postTrainingPenalty;
      why.push({ rule: 'fuel.post_training', detail: `Sesión hace ${Math.round(age)} min sin reposición confirmada: -${f.postTrainingPenalty}.` });
    }
  }

  return { value: clamp(value, f.min, f.max), why };
}

/** Combina score guardado, score derivado y estimación, en ese orden. */
export function resolveScores(input: PeppeInput, t: Thresholds = DEFAULT_THRESHOLDS): { scores: Scores; why: Reason[] } {
  const why: Reason[] = [];
  const stored = input.storedScores;
  const derived = deriveScoresFromCheckin(input);
  const fresh = isCheckinFresh(input, t);

  const hasStored = stored && [stored.readiness, stored.fuel, stored.recovery, stored.load].some((v) => v != null);

  // Un check-in vigente gana sobre un score guardado de otro día.
  if (derived && fresh) {
    why.push({ rule: 'scores.derived', detail: 'Check-in vigente: los scores se derivan de las respuestas de ahora.' });
    const fuel = derived.fuel ?? estimateFuel(input, t).value;
    return { scores: { ...derived, fuel }, why };
  }

  if (hasStored) {
    why.push({ rule: 'scores.stored', detail: `Scores del ${stored!.scoreDate} tomados de la base.` });
    const fuel = stored!.fuel ?? estimateFuel(input, t).value;
    return { scores: { ...stored!, fuel, source: 'stored' }, why };
  }

  const estimate = estimateFuel(input, t);
  why.push({ rule: 'scores.fuel_only', detail: 'Sin scores ni check-in vigente: sólo estimación de combustible.' });
  why.push(...estimate.why);
  return {
    scores: { readiness: null, recovery: null, load: null, fuel: estimate.value, source: 'none' },
    why,
  };
}

/** Cuánto contexto real tiene Peppe y cuánta confianza merece su lectura. */
export function resolveConfidence(input: PeppeInput, t: Thresholds = DEFAULT_THRESHOLDS): Confidence {
  const c = t.completeness;
  const missing: string[] = [];
  let completeness = 0;

  if (input.goal?.primaryGoal) completeness += c.goal;
  else missing.push('objetivo');

  const metric = input.dailyMetric;
  if (metric && [metric.sleepMinutes, metric.hrvMs, metric.restingHrBpm, metric.weightKg].some((v) => v != null)) completeness += c.dailyMetric;
  else missing.push('métricas del día');

  const s = input.storedScores;
  if (s && [s.readiness, s.fuel, s.recovery, s.load].some((v) => v != null)) completeness += c.scores;
  else missing.push('scores');

  const k = input.checkin;
  if (k && [k.energy, k.hunger, k.legsLoad, k.stress, k.soreness].some((v) => v != null)) completeness += c.checkin;
  else missing.push('señales subjetivas');

  if (input.nutrition.length > 0) completeness += c.nutrition;
  else missing.push('ingesta reciente');

  if (input.evidenceCount > 0 || input.integrations.some((i) => i.connected)) completeness += c.environment;
  else missing.push('fuentes conectadas');

  completeness = clamp(completeness);

  const samples = input.readinessHistory.length;
  const bonus = samples >= c.historyLongDays ? c.historyBonusLong : samples >= c.historyShortDays ? c.historyBonusShort : 0;
  const confidence = clamp(completeness + bonus);

  const complete = k != null && k.energy != null && k.hunger != null && k.legsLoad != null && k.soreness != null;
  const level: ConfidenceLevel = complete && input.nextPlanned && (metric || input.evidenceCount >= 2) ? 'alta' : complete ? 'media' : 'provisional';

  return { completeness, confidence, level, missing };
}

/** Compara el readiness de hoy contra el propio baseline de 28 días. */
export function compareToBaseline(input: PeppeInput, scores: Scores, t: Thresholds = DEFAULT_THRESHOLDS): string {
  const history = input.readinessHistory.filter((v) => Number.isFinite(v));
  if (scores.readiness == null || history.length < t.baselineMinSamples) {
    return 'Todavía falta historia propia para comparar este momento con tu patrón.';
  }
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  const delta = scores.readiness - avg;
  if (Math.abs(delta) < t.baselineDeltaMin) return `Tu readiness está en línea con tu promedio de los últimos 28 días (${Math.round(avg)}).`;
  if (delta > 0) return `Tu readiness está ${Math.round(delta)} puntos sobre tu promedio reciente (${Math.round(avg)}).`;
  return `Tu readiness está ${Math.abs(Math.round(delta))} puntos bajo tu promedio reciente (${Math.round(avg)}).`;
}
