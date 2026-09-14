import type { PeppeInput, QuestionId } from './types.ts';
import { DEFAULT_THRESHOLDS, type Thresholds } from './thresholds.ts';
import { activityEnd, latestMeal, minutesBetween } from './moment.ts';

/**
 * VENCIMIENTO POR SEÑAL
 *
 * El problema que resuelve: antes un check-in valía entero durante 4 horas y
 * después no valía nada. Eso es falso en las dos direcciones.
 *
 *   El dolor que reportaste a las 8 sigue importando a las 20.
 *   La energía de las 8 no dice nada a las 20.
 *   Las piernas cambian con el entrenamiento, no con el reloj.
 *   El hambre muere en cuanto comes, sin importar la hora.
 *
 * Cada señal vence a su ritmo, y algunas se invalidan por un evento antes de
 * cumplir su plazo. Esto es lo que evita repreguntar lo mismo cinco veces al
 * día, que es la queja de fondo del diseño anterior.
 */

export type SignalId = Extract<QuestionId, 'energy' | 'hunger' | 'legs' | 'soreness' | 'pain'>;

export type SignalState = {
  signal: SignalId;
  /** Hay un valor y sigue vigente. */
  fresh: boolean;
  /** Minutos desde que se registró, o null si nunca se registró. */
  ageMinutes: number | null;
  /** Por qué venció, cuando venció. */
  expiredBecause: 'nunca_registrado' | 'plazo_cumplido' | 'entrenamiento_posterior' | 'comida_posterior' | 'escala_no_confiable' | null;
};

function rawValue(input: PeppeInput, signal: SignalId): number | boolean | null {
  const c = input.checkin;
  if (!c) return null;
  switch (signal) {
    case 'energy': return c.energy;
    case 'hunger': return c.hunger;
    case 'legs': return c.legsLoad;
    case 'soreness': return c.soreness;
    case 'pain': return c.pain;
  }
}

export function signalState(input: PeppeInput, signal: SignalId, t: Thresholds = DEFAULT_THRESHOLDS): SignalState {
  const c = input.checkin;
  const value = rawValue(input, signal);

  if (c == null || value == null) {
    // Caso especial: piernas puede estar en null porque la fila histórica no
    // declara su escala, no porque no se haya preguntado. Vale distinguirlo.
    const because = signal === 'legs' && c?.scaleVersion === 'unknown' ? 'escala_no_confiable' : 'nunca_registrado';
    return { signal, fresh: false, ageMinutes: null, expiredBecause: because };
  }

  const age = minutesBetween(input.now, c.checkedAt);
  const ttl = t.freshness[signal];

  if (age > ttl) {
    return { signal, fresh: false, ageMinutes: age, expiredBecause: 'plazo_cumplido' };
  }

  // Un entrenamiento terminado invalida lo que el entrenamiento cambia.
  if (signal === 'legs' || signal === 'energy' || signal === 'soreness') {
    const end = activityEnd(input);
    if (end && end.getTime() > c.checkedAt.getTime() && end.getTime() <= input.now.getTime()) {
      return { signal, fresh: false, ageMinutes: age, expiredBecause: 'entrenamiento_posterior' };
    }
  }

  // Comer invalida el hambre de inmediato. No hay que esperar el plazo.
  if (signal === 'hunger') {
    const meal = latestMeal(input);
    if (meal && meal.eatenAt.getTime() > c.checkedAt.getTime()) {
      return { signal, fresh: false, ageMinutes: age, expiredBecause: 'comida_posterior' };
    }
  }

  return { signal, fresh: true, ageMinutes: age, expiredBecause: null };
}

export function isSignalFresh(input: PeppeInput, signal: SignalId, t: Thresholds = DEFAULT_THRESHOLDS): boolean {
  return signalState(input, signal, t).fresh;
}

/** Cuadro completo. Útil para depurar y para mostrarle al atleta qué sabe Peppe. */
export function allSignalStates(input: PeppeInput, t: Thresholds = DEFAULT_THRESHOLDS): SignalState[] {
  return (['pain', 'legs', 'energy', 'soreness', 'hunger'] as SignalId[]).map((s) => signalState(input, s, t));
}
