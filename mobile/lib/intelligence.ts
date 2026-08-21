import { supabase } from './supabase';

export type PeppeIntelligenceSnapshot = {
  state: 'favorable' | 'attention' | 'incomplete';
  completeness: number;
  confidence: number;
  headline: string;
  explanation: string;
  recommendationNow: string;
  nutritionRecommendation: string;
  recoveryRecommendation: string;
  trainingRecommendation: string;
  objectiveStatus: string;
  nextQuestion: string;
  goal: string | null;
  comparison: string;
  locationLabel: string | null;
  scores: {
    readiness: number | null;
    fuel: number | null;
    recovery: number | null;
    load: number | null;
  };
};

function n(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function dateKeyDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function buildPeppeSnapshot(athleteId: string, persist = true): Promise<PeppeIntelligenceSnapshot> {
  const now = Date.now();
  const since12h = new Date(now - 12 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const [profileRes, scoreRes, metricRes, checkinRes, nutritionRes, activityRes, contextRes, cycleRes, historyRes] = await Promise.all([
    supabase.from('athlete_profiles').select('primary_goal').eq('user_id', athleteId).maybeSingle(),
    supabase.from('scores').select('readiness,fuel,recovery,load,score_date').eq('athlete_id', athleteId).order('score_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('daily_metrics').select('sleep_minutes,hrv_ms,resting_hr_bpm,weight_kg,body_fat_pct,bmi,metric_date').eq('athlete_id', athleteId).order('metric_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('subjective_checkins').select('energy,hunger,legs,stress,soreness,pain,checked_at').eq('athlete_id', athleteId).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('nutrition_entries').select('id,eaten_at,carbs_g,protein_g,description').eq('athlete_id', athleteId).gte('eaten_at', since12h).order('eaten_at', { ascending: false }).limit(20),
    supabase.from('activities').select('sport,started_at,duration_seconds,distance_m,rpe').eq('athlete_id', athleteId).gte('started_at', since24h).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('context_snapshots').select('id,locality,region,country,timezone,captured_at').eq('athlete_id', athleteId).order('captured_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('training_cycles').select('name,goal,event_date,status').eq('athlete_id', athleteId).eq('status', 'active').order('start_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('scores').select('readiness,recovery,load,score_date').eq('athlete_id', athleteId).gte('score_date', dateKeyDaysAgo(28)).order('score_date', { ascending: true }),
  ]);

  const errors = [profileRes.error, scoreRes.error, metricRes.error, checkinRes.error, nutritionRes.error, activityRes.error, contextRes.error, cycleRes.error, historyRes.error].filter(Boolean);
  if (errors.length) throw errors[0];

  const score = scoreRes.data;
  const metric = metricRes.data;
  const checkin = checkinRes.data;
  const nutrition = nutritionRes.data ?? [];
  const activity = activityRes.data;
  const context = contextRes.data;
  const goal = cycleRes.data?.goal || profileRes.data?.primary_goal || null;

  const scores = {
    readiness: n(score?.readiness),
    fuel: n(score?.fuel),
    recovery: n(score?.recovery),
    load: n(score?.load),
  };

  let completeness = 0;
  if (goal) completeness += 10;
  if (metric && [metric.sleep_minutes, metric.hrv_ms, metric.resting_hr_bpm, metric.weight_kg].some((v) => v != null)) completeness += 20;
  if (score && [score.readiness, score.fuel, score.recovery, score.load].some((v) => v != null)) completeness += 20;
  if (checkin && [checkin.energy, checkin.hunger, checkin.legs, checkin.stress, checkin.soreness].some((v) => v != null)) completeness += 20;
  if (nutrition.length > 0) completeness += 15;
  if (context) completeness += 15;
  completeness = clamp(completeness);

  const history = (historyRes.data ?? [])
    .map((row) => ({ readiness: n(row.readiness), recovery: n(row.recovery), load: n(row.load) }))
    .filter((row) => row.readiness != null || row.recovery != null || row.load != null);

  const historyBonus = history.length >= 7 ? 5 : history.length >= 3 ? 2 : 0;
  const confidence = clamp(completeness + historyBonus);

  const energy = n(checkin?.energy);
  const hunger = n(checkin?.hunger);
  const legs = n(checkin?.legs);
  const soreness = n(checkin?.soreness);
  const pain = Boolean(checkin?.pain);

  let state: PeppeIntelligenceSnapshot['state'] = completeness < 60 ? 'incomplete' : 'favorable';
  if (pain || (scores.readiness != null && scores.readiness < 50) || (scores.recovery != null && scores.recovery < 50) || (energy != null && energy <= 4) || (legs != null && legs >= 8) || (soreness != null && soreness >= 8)) {
    state = 'attention';
  }

  const headline = state === 'attention'
    ? 'Hay señales que merecen atención antes de sumar más carga.'
    : state === 'incomplete'
      ? 'Ya tengo parte de tu foto; faltan pocos datos para cerrar la decisión.'
      : 'Estado favorable y contexto suficiente para orientar la próxima decisión.';

  const explanationParts: string[] = [];
  if (scores.readiness != null) explanationParts.push(`Readiness ${Math.round(scores.readiness)}/100`);
  if (scores.recovery != null) explanationParts.push(`Recovery ${Math.round(scores.recovery)}/100`);
  if (scores.load != null) explanationParts.push(`Load ${Math.round(scores.load)}/100`);
  if (energy != null) explanationParts.push(`energía ${Math.round(energy)}/10`);
  if (hunger != null) explanationParts.push(`hambre ${Math.round(hunger)}/10`);
  if (activity?.sport) explanationParts.push(`última sesión: ${activity.sport}`);
  const explanation = explanationParts.length
    ? `La lectura actual combina ${explanationParts.join(', ')}. Peppe prioriza tu baseline personal y la coherencia entre carga, recuperación, nutrición y sensaciones.`
    : 'Todavía no hay suficientes variables consolidadas. Peppe evita sobreinterpretar hasta completar el contexto necesario.';

  let nutritionRecommendation = 'Mantén una alimentación coherente con la demanda de tu próxima sesión y registra la ingesta para que Peppe pueda aprender de tu respuesta.';
  if (nutrition.length === 0) {
    nutritionRecommendation = 'No tengo una ingesta reciente confirmada. Antes de concluir sobre Fuel, registra o realiza tu próxima comida y prioriza una combinación de carbohidratos, proteína e hidratación acorde a la sesión.';
  } else if ((hunger != null && hunger >= 8) || (scores.fuel != null && scores.fuel < 60)) {
    nutritionRecommendation = 'Tu señal de hambre/Fuel sugiere baja disponibilidad. Prioriza combustible e hidratación antes de añadir actividad extra y vuelve a evaluar cómo respondes después de comer.';
  } else if (activity) {
    nutritionRecommendation = 'Tienes una sesión reciente registrada. Prioriza recuperación nutricional: carbohidratos para reponer energía, proteína suficiente y líquidos/electrolitos según la carga y el sudor.';
  }

  let recoveryRecommendation = 'Mantén tu rutina habitual de recuperación y protege el sueño de hoy; Peppe observará cómo responde tu baseline en la siguiente lectura.';
  if (pain) {
    recoveryRecommendation = 'Registra y observa la molestia. Peppe no la diagnostica: evita carga adicional no planificada y busca revisión de tu entrenador o un profesional si persiste, empeora o limita el movimiento.';
  } else if ((scores.recovery != null && scores.recovery < 60) || (energy != null && energy <= 4) || (legs != null && legs >= 8)) {
    recoveryRecommendation = 'La recuperación está comprometida o tus sensaciones muestran fatiga. Prioriza descanso, sueño, hidratación y movilidad suave; evita convertir recuperación en otra sesión exigente.';
  } else if (scores.load != null && scores.load >= 75) {
    recoveryRecommendation = 'La carga es alta aunque tu estado sea utilizable. La prioridad es absorber el entrenamiento: sueño consistente, hidratación y no sumar carga fuera del plan.';
  }

  let trainingRecommendation = 'Mantén el entrenamiento planificado por tu entrenador y evita añadir carga extra. Peppe usará tus respuestas post sesión para evaluar si el costo fue el esperado.';
  if (pain) {
    trainingRecommendation = 'No uses Peppe para decidir por sí solo una sesión con dolor. No añadas carga adicional y revisa la sesión planificada con tu entrenador; si la molestia persiste o empeora, corresponde evaluación profesional.';
  } else if ((scores.readiness != null && scores.readiness < 50) || (scores.recovery != null && scores.recovery < 50) || (energy != null && energy <= 4)) {
    trainingRecommendation = 'Tu estado actual no respalda sumar intensidad extra. Conserva como referencia el plan del entrenador, usa el calentamiento para reevaluar sensaciones y cualquier modificación del entrenamiento debe revisarse con él.';
  } else if (scores.load != null && scores.load >= 75 && scores.recovery != null && scores.recovery < 65) {
    trainingRecommendation = 'La carga reciente es alta respecto de tu recuperación. Cumple sólo la carga planificada y evita sesiones o deporte adicional no previsto.';
  }

  let recommendationNow = trainingRecommendation;
  if (nutrition.length === 0 || (hunger != null && hunger >= 8) || (scores.fuel != null && scores.fuel < 60)) recommendationNow = nutritionRecommendation;
  if (pain || (scores.recovery != null && scores.recovery < 50) || (energy != null && energy <= 4)) recommendationNow = recoveryRecommendation;

  let nextQuestion = 'Contexto suficiente. Peppe volverá a preguntar cuando un nuevo evento cambie la decisión.';
  if (!context) nextQuestion = '¿Quieres activar ubicación contextual para detectar viaje, zona horaria y entorno al abrir Peppe?';
  else if (!checkin) nextQuestion = '¿Cómo están ahora tu energía, hambre y piernas?';
  else if (nutrition.length === 0) nextQuestion = '¿Comiste en las últimas horas?';
  else if (!goal) nextQuestion = '¿Cuál es el objetivo principal que debe guiar tus decisiones de las próximas semanas?';

  let comparison = 'Aún necesito más historia para comparar este momento con tu propio patrón.';
  const readinessHistory = history.map((x) => x.readiness).filter((v): v is number => v != null);
  if (scores.readiness != null && readinessHistory.length >= 3) {
    const avg = readinessHistory.reduce((a, b) => a + b, 0) / readinessHistory.length;
    const delta = scores.readiness - avg;
    if (Math.abs(delta) < 3) comparison = `Tu Readiness está prácticamente en línea con tu promedio de los últimos 28 días (${Math.round(avg)}).`;
    else if (delta > 0) comparison = `Tu Readiness está ${Math.round(delta)} puntos sobre tu promedio reciente (${Math.round(avg)}).`;
    else comparison = `Tu Readiness está ${Math.abs(Math.round(delta))} puntos bajo tu promedio reciente (${Math.round(avg)}).`;
  }

  const objectiveStatus = goal
    ? state === 'favorable'
      ? `Trayectoria utilizable para ${goal}. La prioridad es sostener consistencia sin añadir carga fuera del plan.`
      : state === 'attention'
        ? `El objetivo sigue siendo ${goal}, pero hoy conviene proteger recuperación y evitar decisiones que aumenten innecesariamente el costo fisiológico.`
        : `Objetivo: ${goal}. Falta contexto para evaluar con suficiente confianza si el día está completamente alineado.`
    : 'Define un objetivo de mediano plazo para que Peppe pueda juzgar cada decisión dentro de una trayectoria, no como un día aislado.';

  const locationLabel = context
    ? [context.locality, context.region, context.country].filter(Boolean).join(', ') || context.timezone || null
    : null;

  const snapshot: PeppeIntelligenceSnapshot = {
    state,
    completeness,
    confidence,
    headline,
    explanation,
    recommendationNow,
    nutritionRecommendation,
    recoveryRecommendation,
    trainingRecommendation,
    objectiveStatus,
    nextQuestion,
    goal,
    comparison,
    locationLabel,
    scores,
  };

  if (persist) {
    await supabase.from('moment_snapshots').insert({
      athlete_id: athleteId,
      moment_type: 'app_open',
      state,
      completeness_score: completeness,
      confidence_score: confidence,
      headline,
      explanation,
      recommendation_now: recommendationNow,
      next_question: nextQuestion,
      context_snapshot_id: context?.id ?? null,
      algorithm_version: 'snapshot-v0.2',
      input_snapshot: {
        scores,
        metric_date: metric?.metric_date ?? null,
        subjective: checkin ?? null,
        nutrition_entries_12h: nutrition.length,
        last_activity: activity ?? null,
        goal,
        location: locationLabel,
        recommendations: {
          nutrition: nutritionRecommendation,
          recovery: recoveryRecommendation,
          training: trainingRecommendation,
          objective: objectiveStatus,
        },
      },
    });
  }

  return snapshot;
}
