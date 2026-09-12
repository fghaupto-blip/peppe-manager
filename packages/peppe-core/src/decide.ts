import type { Fact, Guardrail, MomentKey, PeppeDecision, PeppeInput, Reason, Scores, State } from './types.ts';
import { ENGINE_VERSION } from './types.ts';
import { DEFAULT_THRESHOLDS, type Thresholds } from './thresholds.ts';
import { activityEnd, latestMeal, minutesBetween, minutesUntilPlanned, nearMeal, resolveMoment } from './moment.ts';
import { compareToBaseline, resolveConfidence, resolveScores } from './scores.ts';
import { planQuestions } from './questions.ts';

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}

function formatDistance(meters: number | null | undefined): string | null {
  return meters ? `${(meters / 1000).toFixed(1)} km` : null;
}

function goalText(input: PeppeInput): string {
  const g = input.goal;
  if (!g?.primaryGoal) return 'Objetivo todavía no definido';
  return [g.primaryGoal, g.goalTarget].filter(Boolean).join(' · ');
}

function buildKnown(input: PeppeInput, scores: Scores, t: Thresholds): Fact[] {
  const facts: Fact[] = [{ label: 'Objetivo', value: goalText(input), source: 'Plan Peppe' }];

  if (input.nextPlanned) {
    const p = input.nextPlanned;
    const bits = [p.title, p.distanceTargetKm != null ? `${p.distanceTargetKm} km` : null, p.durationTargetMinutes != null ? `${p.durationTargetMinutes} min` : null].filter(Boolean);
    facts.push({ label: 'Próxima sesión', value: `${bits.join(' · ')} · ${formatClock(p.scheduledAt)}`, source: p.source === 'manual' ? 'Plan manual' : p.source });
  }

  if (input.lastActivity) {
    const a = input.lastActivity;
    const bits = [formatDistance(a.distanceM), formatDuration(a.movingSeconds ?? a.durationSeconds)].filter(Boolean);
    facts.push({ label: 'Último entrenamiento', value: bits.join(' · ') || a.title || 'Registrado', source: a.provider });
  }

  const m = input.dailyMetric;
  if (m?.sleepMinutes != null) {
    const h = Math.floor(m.sleepMinutes / 60);
    facts.push({ label: 'Sueño', value: `${h}h ${String(m.sleepMinutes % 60).padStart(2, '0')}m`, source: m.source || 'Dispositivo' });
  }
  if (m?.hrvMs != null || m?.restingHrBpm != null) {
    const bits = [m.hrvMs != null ? `HRV ${Math.round(m.hrvMs)} ms` : null, m.restingHrBpm != null ? `FC reposo ${Math.round(m.restingHrBpm)} bpm` : null].filter(Boolean);
    facts.push({ label: 'Recuperación objetiva', value: bits.join(' · '), source: m.source || 'Dispositivo' });
  }

  const g = input.glucose;
  if (g && minutesBetween(input.now, g.measuredAt) <= t.glucoseFreshnessMin) {
    facts.push({ label: 'Glucosa', value: `${Math.round(g.glucoseMgDl)} mg/dL`, source: g.source || 'Sensor' });
  }

  const meal = latestMeal(input);
  if (meal) facts.push({ label: 'Última comida', value: meal.description, source: meal.photoPath ? 'Peppe · foto' : 'Peppe' });

  if (scores.fuel != null) {
    facts.push({ label: 'Combustible estimado', value: `${scores.fuel}/100`, source: scores.source === 'stored' ? 'Peppe' : 'Estimación Peppe' });
  }

  return facts.slice(0, 8);
}

const MOMENT_COPY: Record<MomentKey, { label: string; title: string; description: string }> = {
  post_training: {
    label: 'POST ENTRENAMIENTO',
    title: 'Ya recibí tu sesión.',
    description: 'Las integraciones aportan lo realizado. Peppe sólo completa lo que ninguna app puede saber de tu cuerpo.',
  },
  pre_training: {
    label: 'PRE ENTRENAMIENTO',
    title: 'Se acerca tu entrenamiento.',
    description: 'Peppe cruza el plan con lo que comiste y tu estado antes de decidir si hace falta ajustar algo.',
  },
  meal: {
    label: 'MOMENTO DE ALIMENTACIÓN',
    title: 'Comer según lo que pasó y lo que viene.',
    description: 'La comida se interpreta dentro del entrenamiento, la recuperación y el objetivo. No como una pauta aislada.',
  },
  morning: {
    label: 'INICIO DEL DÍA',
    title: 'Buenos días. Primero, contexto.',
    description: 'Peppe revisa objetivo, plan, actividad y métricas antes de pedirte algo.',
  },
  prepare_next: {
    label: 'PREPARANDO LO QUE VIENE',
    title: 'Preparar la próxima sesión.',
    description: 'Todavía no es hora de entrenar. Este bloque sirve para proteger recuperación, combustible y sueño.',
  },
  evening: {
    label: 'CIERRE DEL DÍA',
    title: 'Preparar mañana sin sobrecargarte de preguntas.',
    description: 'Peppe conserva lo aprendido durante el día y sólo pide una señal si cambia la decisión de recuperación.',
  },
  wait: {
    label: 'PEPPE EN SEGUNDO PLANO',
    title: 'No hace falta que hagas nada ahora.',
    description: 'Tus fuentes siguen aportando contexto. Peppe vuelve cuando haya una decisión real.',
  },
};

function resolveState(input: PeppeInput, scores: Scores, completeness: number, t: Thresholds): { state: State; why: Reason[] } {
  const why: Reason[] = [];
  const c = input.checkin;
  const a = t.attention;

  if (c?.pain) {
    why.push({ rule: 'state.pain', detail: 'Hay molestia reportada: prevalece sobre cualquier otra señal.' });
    return { state: 'attention', why };
  }

  const triggers: string[] = [];
  if (scores.readiness != null && scores.readiness < a.readinessBelow) triggers.push(`readiness ${scores.readiness} < ${a.readinessBelow}`);
  if (scores.recovery != null && scores.recovery < a.recoveryBelow) triggers.push(`recovery ${scores.recovery} < ${a.recoveryBelow}`);
  if (c?.energy != null && c.energy <= a.energyAtOrBelow) triggers.push(`energía ${c.energy} ≤ ${a.energyAtOrBelow}`);
  if (c?.legsLoad != null && c.legsLoad >= a.legsLoadAtOrAbove) triggers.push(`piernas cargadas ${c.legsLoad} ≥ ${a.legsLoadAtOrAbove}`);
  if (c?.soreness != null && c.soreness >= a.sorenessAtOrAbove) triggers.push(`molestia ${c.soreness} ≥ ${a.sorenessAtOrAbove}`);

  if (triggers.length) {
    why.push({ rule: 'state.attention', detail: triggers.join(' · ') });
    return { state: 'attention', why };
  }

  if (completeness < t.completeness.incompleteBelow) {
    why.push({ rule: 'state.incomplete', detail: `Completitud ${completeness} < ${t.completeness.incompleteBelow}.` });
    return { state: 'incomplete', why };
  }

  why.push({ rule: 'state.favorable', detail: 'Ninguna señal de alarma y contexto suficiente.' });
  return { state: 'favorable', why };
}

/**
 * MOTOR ÚNICO.
 *
 * Reemplaza a los tres motores que convivían en el repo:
 *   - lib/peppe-engine.ts            (buildPeppeDecision)
 *   - app/peppe-enhancer-v2.tsx      (buildGuidance)
 *   - mobile/lib/intelligence.ts     (buildPeppeSnapshot)
 *
 * Es una función pura: misma entrada, misma salida, siempre. No toca la red
 * ni la base de datos, así que se puede testear al 100%.
 */
export function decide(input: PeppeInput, t: Thresholds = DEFAULT_THRESHOLDS): PeppeDecision {
  const why: Reason[] = [];
  const guardrails: Guardrail[] = ['coach_owns_plan'];

  const moment = resolveMoment(input, t);
  why.push(...moment.why);

  const { scores, why: scoreWhy } = resolveScores(input, t);
  why.push(...scoreWhy);

  const confidence = resolveConfidence(input, t);
  const { state, why: stateWhy } = resolveState(input, scores, confidence.completeness, t);
  why.push(...stateWhy);

  if (input.checkin?.scaleVersion === 'unknown') {
    guardrails.push('stale_scale');
    why.push({ rule: 'guardrail.stale_scale', detail: 'El check-in viene de la escala antigua de piernas: esa señal se ignora.' });
  }

  const plan = planQuestions(input, moment, t);
  why.push(...plan.why);

  const pain = Boolean(input.checkin?.pain);
  if (pain) guardrails.push('pain_lock');

  const fuel = scores.fuel ?? 100;
  const untilPlanned = minutesUntilPlanned(input.nextPlanned, input.now);
  const planTitle = input.nextPlanned?.title ?? 'tu próxima sesión';
  const sleepTime = input.prefs?.sleepTime ?? '22:30';
  const mealWindow = nearMeal(input, t);
  const end = activityEnd(input);
  const postTraining = moment.key === 'post_training';

  // --- Recomendaciones por dominio ---------------------------------------

  let training: string;
  if (pain) {
    training = 'No uses Peppe para decidir solo una sesión con dolor. No agregues carga y revisa el plan con tu entrenador. Si la molestia persiste, empeora o limita el movimiento, corresponde evaluación profesional.';
  } else if (
    (scores.readiness != null && scores.readiness < t.attention.readinessBelow) ||
    (scores.recovery != null && scores.recovery < t.attention.recoveryBelow) ||
    (input.checkin?.energy != null && input.checkin.energy <= t.attention.energyAtOrBelow)
  ) {
    training = 'Tu estado no respalda sumar intensidad extra. Mantén el plan del entrenador como referencia, usa el calentamiento para reevaluar y cualquier cambio revísalo con él.';
  } else if (scores.load != null && scores.load >= t.loadHighAtOrAbove && scores.recovery != null && scores.recovery < 65) {
    training = 'La carga reciente es alta respecto de tu recuperación. Cumple sólo lo planificado y evita deporte adicional no previsto.';
  } else {
    training = 'Mantén el entrenamiento planificado y evita agregar carga extra. Peppe usará tus respuestas post sesión para evaluar si el costo fue el esperado.';
  }

  let nutrition: string;
  const mealName = mealWindow?.name ?? 'la próxima comida';
  if (postTraining) {
    nutrition = 'Proteína, carbohidrato y líquidos. La recuperación de la sesión reciente tiene prioridad sobre recortar combustible.';
  } else if (input.nutrition.length === 0) {
    nutrition = 'No hay ingesta reciente confirmada. Antes de sacar conclusiones sobre tu combustible, registra o realiza tu próxima comida.';
  } else if ((input.checkin?.hunger != null && input.checkin.hunger >= 8) || fuel < t.fuelLowMeal) {
    nutrition = `Tu señal de hambre y combustible sugiere baja disponibilidad. Prioriza carbohidrato e hidratación en ${mealName} antes de sumar actividad.`;
  } else {
    nutrition = `Proteína y vegetales como base en ${mealName}; ajusta el carbohidrato a la carga que viene.`;
  }

  let recovery: string;
  if (pain) {
    recovery = 'Nada de carga extra. Movilidad suave sólo si no aumenta la molestia. Registra si el dolor cambia con movimiento o reposo.';
  } else if (state === 'attention') {
    recovery = `Baja estímulos, hidrátate y apunta a dormir cerca de ${sleepTime}.`;
  } else if (scores.load != null && scores.load >= t.loadHighAtOrAbove) {
    recovery = `La carga es alta aunque el estado sea usable. La prioridad es absorber el entrenamiento: sueño consistente cerca de ${sleepTime} e hidratación.`;
  } else {
    recovery = `Actividad cotidiana normal, hidratación y sueño protegido cerca de ${sleepTime}.`;
  }

  // --- Titular y acciones -------------------------------------------------

  let headline: string;
  let body: string;
  let actions: string[];

  if (pain) {
    headline = 'La molestia pasa primero.';
    body = 'Peppe mantiene la carga en segundo plano hasta entender si esa molestia cambia o limita el movimiento.';
    actions = ['Evita sumar intensidad por iniciativa propia', 'Registra si el dolor cambia con movimiento o reposo', 'Prioriza la indicación de tu coach'];
  } else if (plan.questions.length) {
    headline = 'Me falta una señal humana antes de decidir.';
    body = 'Las integraciones ya entregaron el contexto objetivo. Estas respuestas son las únicas que pueden cambiar la indicación de este momento.';
    actions = ['Responde sólo lo que aparece', 'Peppe actualiza la recomendación inmediatamente después'];
  } else if (postTraining) {
    const low = fuel < t.fuelLowPost;
    headline = low ? 'Repón combustible ahora.' : 'Recuperación simple y suficiente.';
    body = low
      ? 'La sesión reciente redujo tu disponibilidad estimada. Conviene reponer carbohidratos, proteína y líquidos sin esperar a tener hambre extrema.'
      : 'La sesión quedó registrada y no aparecen señales que obliguen a intervenir más.';
    actions = low
      ? ['Comida post entrenamiento con carbohidratos y proteína', 'Rehidrata con líquidos y sodio según sudoración', 'Revisa las piernas más tarde si siguen cargadas']
      : ['Come según hambre y próxima sesión', 'Hidrátate', 'Evita agregar carga extra sin necesidad'];
  } else if (moment.key === 'pre_training') {
    const low = fuel < t.fuelLowPre;
    headline = low ? 'Llega con más combustible a la sesión.' : 'Puedes seguir el plan previsto.';
    body = low
      ? 'La combinación entre próxima sesión, última ingesta y señales actuales sugiere comer o beber antes de entrenar.'
      : 'Peppe tiene suficiente contexto y no detecta razón para cambiar la sesión planificada.';
    actions = low
      ? ['Prioriza carbohidrato fácil de digerir', 'Toma líquidos antes de salir', 'No experimentes con alimentos nuevos']
      : ['Mantén la sesión del plan', 'Hidratación habitual', 'Vuelve si cambian piernas, energía o dolor'];
  } else if (moment.key === 'meal') {
    const low = fuel < t.fuelLowMeal;
    headline = low ? 'Esta comida importa para tu objetivo de hoy.' : 'Come con contexto, no por obligación.';
    body = low
      ? 'Tu disponibilidad estimada está baja o tienes carga cercana. Esta comida debería ayudar a recuperar o preparar la siguiente sesión.'
      : 'No hay señal fuerte de déficit. Usa hambre, recuperación y el entrenamiento que viene para definir cantidad.';
    actions = low
      ? ['Incluye una fuente clara de carbohidrato', 'Asegura proteína suficiente', 'Agrega líquidos']
      : ['Proteína y vegetales como base', 'Carbohidrato proporcional a la carga próxima', 'Puedes aportar una foto para afinar la lectura'];
  } else if (moment.key === 'morning') {
    headline = 'El día ya tiene una dirección.';
    body = input.nextPlanned
      ? `Peppe organizará alimentación y recuperación alrededor de "${planTitle}".`
      : 'Peppe tiene tu objetivo, pero falta la próxima sesión en el plan.';
    actions = input.nextPlanned
      ? ['Mantén el plan del coach como referencia principal', 'Responde sólo si Peppe detecta una señal faltante']
      : ['Agrega la próxima sesión al plan', 'Mientras tanto Peppe usará la actividad reciente como contexto'];
  } else if (moment.key === 'prepare_next') {
    const low = fuel < t.fuelLowPre;
    headline = low ? 'Empieza a preparar la próxima sesión.' : 'Mantén recuperación y rutina.';
    body = input.nextPlanned
      ? `La próxima decisión importante es llegar bien a "${planTitle}". Peppe ajusta alimentación y descanso, no el plan del coach.`
      : 'No hay sesión próxima cargada, así que el foco es recuperación general.';
    actions = low
      ? ['No recortes carbohidratos antes de una sesión exigente', 'Hidrátate durante el día', 'Prioriza sueño']
      : ['Come normalmente', 'Mantén hidratación', 'Prioriza sueño'];
  } else if (moment.key === 'evening') {
    headline = 'Cierra el día preparando mañana.';
    body = input.nextPlanned
      ? `Mañana importa llegar recuperado para "${planTitle}".`
      : 'Sin una próxima sesión cargada, el cierre se concentra en recuperación general.';
    actions = ['Cena suficiente para la carga próxima', 'Hidrátate', `Apunta a dormir cerca de ${sleepTime}`];
  } else {
    headline = 'No necesito interrumpirte ahora.';
    body = 'Peppe ya tiene suficiente contexto. Vuelve cuando exista una decisión real: entrenar, comer, recuperar o responder a una señal del cuerpo.';
    actions = ['Sigue tu plan', 'Aporta una foto o sensación sólo si algo cambió'];
  }

  // --- Próximo momento ----------------------------------------------------

  let nextMoment: string;
  if (plan.questions.length) nextMoment = 'Decisión inmediata después de tu respuesta';
  else if (postTraining && input.nextPlanned) nextMoment = `Preparación para ${planTitle}`;
  else if (untilPlanned != null && untilPlanned > 0 && untilPlanned <= 180) nextMoment = `Ventana pre-entreno cerca de ${formatClock(input.nextPlanned!.scheduledAt)}`;
  else if (end && minutesBetween(input.now, end) < 0) nextMoment = 'Cuando termine tu sesión';
  else nextMoment = 'Cuando aparezca una comida, entrenamiento o cambio real de energía, hambre, piernas o dolor';

  const goal = input.goal?.primaryGoal;
  const objectiveStatus = goal
    ? state === 'favorable'
      ? `Trayectoria usable para ${goal}. La prioridad es sostener consistencia sin carga fuera del plan.`
      : state === 'attention'
        ? `El objetivo sigue siendo ${goal}, pero hoy conviene proteger recuperación.`
        : `Objetivo: ${goal}. Falta contexto para evaluar el día con suficiente confianza.`
    : 'Define un objetivo de mediano plazo para que Peppe juzgue cada decisión dentro de una trayectoria y no como un día aislado.';

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: input.now,
    moment: { key: moment.key, ...MOMENT_COPY[moment.key] },
    state,
    scores,
    confidence,
    questions: plan.questions,
    known: buildKnown(input, scores, t),
    recommendation: { headline, body, actions, training, nutrition, recovery },
    comparison: compareToBaseline(input, scores, t),
    objectiveStatus,
    nextMoment,
    why,
    guardrails,
  };
}
