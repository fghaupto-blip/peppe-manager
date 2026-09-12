import type { MomentKey, PeppeInput, PlannedSession, Reason } from './types.ts';
import { DEFAULT_THRESHOLDS, type Thresholds } from './thresholds.ts';

export function minutesBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 60000;
}

export function activityEnd(input: PeppeInput): Date | null {
  const a = input.lastActivity;
  if (!a) return null;
  const seconds = a.movingSeconds ?? a.durationSeconds ?? 0;
  return new Date(a.startedAt.getTime() + seconds * 1000);
}

export function minutesUntilPlanned(next: PlannedSession | null, now: Date): number | null {
  return next ? minutesBetween(next.scheduledAt, now) : null;
}

/**
 * Hora local DEL ATLETA, no la del runtime.
 *
 * Los tres motores anteriores usaban `now.getHours()`, que devuelve la hora
 * del dispositivo o del servidor. Funcionaba de casualidad porque el usuario
 * estaba en Chile y todo corría en el navegador. Se rompe apenas algo se
 * renderiza en servidor (Vercel corre en UTC) o el atleta viaja. La columna
 * `user_preferences.timezone` existía desde el principio y nadie la leía.
 */
export function localParts(now: Date, timezone: string | null | undefined) {
  const tz = timezone || 'America/Santiago';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute, dayMinutes: hour * 60 + minute };
}

function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [rawH, rawM] = value.slice(0, 5).split(':');
  const h = Number(rawH);
  const m = Number(rawM);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export type MealWindow = { name: 'desayuno' | 'almuerzo' | 'cena'; deltaMinutes: number };

export function nearMeal(input: PeppeInput, t: Thresholds = DEFAULT_THRESHOLDS): MealWindow | null {
  const minute = localParts(input.now, input.prefs?.timezone).dayMinutes;
  const lead = input.prefs?.mealPromptLeadMinutes ?? t.mealLeadMinDefault;
  const candidates: Array<[MealWindow['name'], number | null]> = [
    ['desayuno', timeToMinutes(input.prefs?.breakfastTime)],
    ['almuerzo', timeToMinutes(input.prefs?.lunchTime)],
    ['cena', timeToMinutes(input.prefs?.dinnerTime)],
  ];
  for (const [name, target] of candidates) {
    if (target == null) continue;
    const delta = target - minute;
    if (delta <= lead && delta >= -t.mealTrailMin) return { name, deltaMinutes: delta };
  }
  return null;
}

export function latestMeal(input: PeppeInput) {
  const past = input.nutrition
    .filter((m) => m.eatenAt.getTime() <= input.now.getTime())
    .sort((a, b) => b.eatenAt.getTime() - a.eatenAt.getTime());
  return past[0] ?? null;
}

export function isCheckinFresh(input: PeppeInput, t: Thresholds = DEFAULT_THRESHOLDS): boolean {
  const checkin = input.checkin;
  if (!checkin) return false;
  const end = activityEnd(input);
  const postWindow = end != null && minutesBetween(input.now, end) >= 0 && minutesBetween(input.now, end) <= t.postTrainingWindowMin;
  // Después de entrenar, un check-in previo a la sesión ya no sirve.
  if (postWindow && end) return checkin.checkedAt.getTime() > end.getTime();
  return minutesBetween(input.now, checkin.checkedAt) <= t.checkinFreshnessMin;
}

export type MomentResult = { key: MomentKey; why: Reason[] };

/**
 * Orden de prioridad. Es deliberado y único: antes la web y el móvil
 * resolvían el momento con reglas distintas (el móvil ni siquiera tenía
 * concepto de "pre-entreno" ni de ventana de comida).
 */
export function resolveMoment(input: PeppeInput, t: Thresholds = DEFAULT_THRESHOLDS): MomentResult {
  const why: Reason[] = [];
  const now = input.now;
  const end = activityEnd(input);

  if (end) {
    const age = minutesBetween(now, end);
    if (age >= 0 && age <= t.postTrainingWindowMin) {
      why.push({ rule: 'moment.post_training', detail: `Sesión terminada hace ${Math.round(age)} min (ventana ${t.postTrainingWindowMin} min).` });
      return { key: 'post_training', why };
    }
  }

  const untilPlanned = minutesUntilPlanned(input.nextPlanned, now);
  if (untilPlanned != null && untilPlanned >= -t.preTrainingGraceMin && untilPlanned <= t.preTrainingWindowMin) {
    why.push({ rule: 'moment.pre_training', detail: `Sesión planificada en ${Math.round(untilPlanned)} min.` });
    return { key: 'pre_training', why };
  }

  const meal = nearMeal(input, t);
  if (meal) {
    why.push({ rule: 'moment.meal', detail: `Ventana de ${meal.name} (${Math.round(meal.deltaMinutes)} min respecto de la hora configurada).` });
    return { key: 'meal', why };
  }

  const local = localParts(now, input.prefs?.timezone);
  if (local.hour < t.morningBeforeHour) {
    why.push({ rule: 'moment.morning', detail: `Antes de las ${t.morningBeforeHour}:00.` });
    return { key: 'morning', why };
  }

  if (untilPlanned != null && untilPlanned > t.preTrainingWindowMin && untilPlanned <= 1080) {
    why.push({ rule: 'moment.prepare_next', detail: `Próxima sesión en ${Math.round(untilPlanned / 60)} h.` });
    return { key: 'prepare_next', why };
  }

  if (local.hour >= t.eveningFromHour) {
    why.push({ rule: 'moment.evening', detail: `Desde las ${t.eveningFromHour}:00.` });
    return { key: 'evening', why };
  }

  why.push({ rule: 'moment.wait', detail: 'No hay evento cercano que justifique interrumpir.' });
  return { key: 'wait', why };
}
