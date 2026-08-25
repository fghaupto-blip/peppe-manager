export type Scores = { readiness: number | null; fuel: number | null; recovery: number | null; load: number | null };

export type Checkin = {
  energy: number | null;
  hunger: number | null;
  legs: number | null;
  stress: number | null;
  soreness: number | null;
  pain: boolean | null;
  notes?: string | null;
  checked_at: string;
};

export type NutritionEntry = {
  id: number;
  eaten_at: string;
  description: string;
  photo_path: string | null;
  carbs_g?: number | null;
  protein_g?: number | null;
};

export type TrainingSession = {
  id: number | string;
  title: string | null;
  sport: string | null;
  started_at: string;
  duration_seconds: number | null;
  moving_seconds?: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  avg_power: number | null;
  training_load?: number | null;
  tss?: number | null;
};

export type PlannedSession = {
  id: string;
  scheduled_at: string;
  title: string;
  sport: string | null;
  distance_target_km: number | null;
  duration_target_minutes: number | null;
  intensity: string | null;
  notes: string | null;
  source: string;
};

export type DailyMetric = {
  metric_date: string;
  sleep_minutes: number | null;
  hrv_ms: number | null;
  resting_hr_bpm: number | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  stress_score: number | null;
  body_battery: number | null;
  source: string | null;
};

export type GlucoseReading = {
  measured_at: string;
  glucose_mg_dl: number;
  trend: string | null;
  source: string | null;
};

export type GoalContext = {
  primary_goal: string | null;
  goal_date: string | null;
  goal_target: string | null;
  primary_sport: string | null;
};

export type Preferences = {
  timezone: string | null;
  wake_time: string | null;
  breakfast_time: string | null;
  lunch_time: string | null;
  dinner_time: string | null;
  sleep_time: string | null;
  meal_prompt_lead_minutes: number | null;
};

export type QuestionId = 'energy' | 'hunger' | 'legs' | 'soreness';

export type PeppeQuestion = {
  id: QuestionId;
  label: string;
  helper: string;
  why: string;
  lowLabel: string;
  highLabel: string;
};

export type KnownFact = {
  label: string;
  value: string;
  source: string;
};

export type PeppeDecision = {
  key: 'post_training' | 'pre_training' | 'meal' | 'morning' | 'prepare_next' | 'evening' | 'wait';
  momentLabel: string;
  momentTitle: string;
  momentDescription: string;
  decisionTitle: string;
  decisionReason: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  questions: PeppeQuestion[];
  known: KnownFact[];
  missingLabels: string[];
  recommendationTitle: string;
  recommendationBody: string;
  recommendationActions: string[];
  nextMoment: string;
  contextLine: string;
};

export type EngineInput = {
  now?: Date;
  goal: GoalContext | null;
  prefs: Preferences | null;
  scores: Scores;
  checkin: Checkin | null;
  nutrition: NutritionEntry[];
  latestTraining: TrainingSession | null;
  nextPlanned: PlannedSession | null;
  dailyMetric: DailyMetric | null;
  glucose: GlucoseReading | null;
  stravaConnected: boolean;
};

const SCALE_QUESTIONS: Record<QuestionId, PeppeQuestion> = {
  energy: {
    id: 'energy',
    label: '¿Cómo está tu energía ahora?',
    helper: 'Piensa en energía física y mental, no sólo en sueño.',
    why: 'Los dispositivos pueden estimar recuperación, pero no saben cómo te sientes en este momento.',
    lowLabel: 'Muy baja',
    highLabel: 'Excelente',
  },
  hunger: {
    id: 'hunger',
    label: '¿Cuánta hambre tienes ahora?',
    helper: 'La respuesta cambia cuánto y cuándo conviene comer.',
    why: 'La demanda del entrenamiento se puede estimar; el hambre sigue siendo una señal humana relevante.',
    lowLabel: 'Nada',
    highLabel: 'Muchísima',
  },
  legs: {
    id: 'legs',
    label: '¿Cómo están tus piernas?',
    helper: 'Usa la sensación global, no sólo un músculo específico.',
    why: 'Strava registra carga y ritmo, pero no puede saber cómo respondió tu musculatura.',
    lowLabel: 'Muy pesadas',
    highLabel: 'Muy frescas',
  },
  soreness: {
    id: 'soreness',
    label: '¿Qué nivel de molestia muscular tienes?',
    helper: 'Diferencia fatiga normal de una molestia que conviene vigilar.',
    why: 'Esta señal cambia la prioridad entre carga, recuperación y descanso.',
    lowLabel: 'Nada',
    highLabel: 'Muy alta',
  },
};

function minutesBetween(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / 60000;
}

function trainingEnd(session: TrainingSession | null) {
  if (!session) return null;
  const seconds = session.moving_seconds ?? session.duration_seconds ?? 0;
  return new Date(new Date(session.started_at).getTime() + seconds * 1000);
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}

function formatDistance(meters: number | null | undefined) {
  return meters ? `${(meters / 1000).toFixed(1)} km` : null;
}

function formatPlan(session: PlannedSession | null) {
  if (!session) return 'Plan aún no cargado';
  const parts = [session.title];
  if (session.distance_target_km != null) parts.push(`${session.distance_target_km} km`);
  if (session.duration_target_minutes != null) parts.push(`${session.duration_target_minutes} min`);
  return parts.join(' · ');
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function timeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const [h, m] = value.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function currentMinutes(now: Date) {
  return now.getHours() * 60 + now.getMinutes();
}

function nearMeal(now: Date, prefs: Preferences | null) {
  const minute = currentMinutes(now);
  const lead = prefs?.meal_prompt_lead_minutes ?? 20;
  const candidates = [
    ['desayuno', timeToMinutes(prefs?.breakfast_time)],
    ['almuerzo', timeToMinutes(prefs?.lunch_time)],
    ['cena', timeToMinutes(prefs?.dinner_time)],
  ] as const;
  for (const [name, target] of candidates) {
    if (target == null) continue;
    const delta = target - minute;
    if (delta <= lead && delta >= -45) return { name, delta };
  }
  return null;
}

function isFreshCheckin(checkin: Checkin | null, now: Date, after?: Date | null) {
  if (!checkin) return false;
  const checked = new Date(checkin.checked_at);
  if (after) return checked.getTime() > after.getTime();
  return minutesBetween(now, checked) <= 240;
}

function latestMeal(nutrition: NutritionEntry[], now: Date) {
  const recent = nutrition
    .map((entry) => ({ ...entry, date: new Date(entry.eaten_at) }))
    .filter((entry) => minutesBetween(now, entry.date) >= 0)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  return recent[0] ?? null;
}

function freshGlucose(glucose: GlucoseReading | null, now: Date) {
  if (!glucose) return null;
  const age = minutesBetween(now, new Date(glucose.measured_at));
  return age >= 0 && age <= 30 ? glucose : null;
}

function goalText(goal: GoalContext | null) {
  if (!goal?.primary_goal) return 'Objetivo todavía no definido';
  return [goal.primary_goal, goal.goal_target].filter(Boolean).join(' · ');
}

function plannedMinutes(next: PlannedSession | null, now: Date) {
  return next ? minutesBetween(new Date(next.scheduled_at), now) : null;
}

function fuelEstimate(scores: Scores, nutrition: NutritionEntry[], checkin: Checkin | null, latestTraining: TrainingSession | null, now: Date) {
  if (scores.fuel != null) return Math.round(scores.fuel);
  let value = 64;
  const meal = latestMeal(nutrition, now);
  if (meal) {
    const mealAge = minutesBetween(now, meal.date);
    if (mealAge <= 180) value += 12;
    else if (mealAge > 300) value -= 8;
  } else value -= 10;
  if (checkin?.hunger != null) value -= Math.max(0, checkin.hunger - 5) * 4;
  if (checkin?.energy != null) value += (checkin.energy - 6) * 2;
  const end = trainingEnd(latestTraining);
  if (end) {
    const age = minutesBetween(now, end);
    if (age >= 0 && age <= 240) value -= 14;
  }
  return Math.max(15, Math.min(95, Math.round(value)));
}

function buildKnown(input: EngineInput, now: Date, fuel: number) {
  const facts: KnownFact[] = [];
  facts.push({ label: 'Objetivo', value: goalText(input.goal), source: 'Plan Peppe' });

  if (input.nextPlanned) {
    const at = new Date(input.nextPlanned.scheduled_at);
    facts.push({ label: 'Próxima sesión', value: `${formatPlan(input.nextPlanned)} · ${formatClock(at)}`, source: input.nextPlanned.source === 'manual' ? 'Plan manual' : input.nextPlanned.source });
  }

  if (input.latestTraining) {
    const sessionBits = [formatDistance(input.latestTraining.distance_m), formatDuration(input.latestTraining.moving_seconds ?? input.latestTraining.duration_seconds)].filter(Boolean);
    facts.push({ label: 'Último entrenamiento', value: sessionBits.join(' · ') || input.latestTraining.title || 'Registrado', source: 'Strava' });
  }

  if (input.dailyMetric?.sleep_minutes != null) {
    const h = Math.floor(input.dailyMetric.sleep_minutes / 60);
    const m = input.dailyMetric.sleep_minutes % 60;
    facts.push({ label: 'Sueño', value: `${h}h ${String(m).padStart(2, '0')}m`, source: input.dailyMetric.source || 'Dispositivo' });
  }

  if (input.dailyMetric?.hrv_ms != null || input.dailyMetric?.resting_hr_bpm != null) {
    const bits = [input.dailyMetric.hrv_ms != null ? `HRV ${Math.round(input.dailyMetric.hrv_ms)} ms` : null, input.dailyMetric.resting_hr_bpm != null ? `FC reposo ${Math.round(input.dailyMetric.resting_hr_bpm)} bpm` : null].filter(Boolean);
    facts.push({ label: 'Recuperación objetiva', value: bits.join(' · '), source: input.dailyMetric.source || 'Dispositivo' });
  }

  const glucose = freshGlucose(input.glucose, now);
  if (glucose) facts.push({ label: 'Glucosa', value: `${Math.round(glucose.glucose_mg_dl)} mg/dL ${glucose.trend === 'stable' ? '→' : ''}`.trim(), source: glucose.source || 'Sensor' });

  const meal = latestMeal(input.nutrition, now);
  if (meal) facts.push({ label: 'Última comida', value: meal.description, source: meal.photo_path ? 'Peppe · foto' : 'Peppe' });

  facts.push({ label: 'Fuel estimado', value: `${fuel}/100`, source: input.scores.fuel != null ? 'Peppe' : 'Estimación Peppe' });
  return facts.slice(0, 8);
}

function questionIfMissing(id: QuestionId, checkin: Checkin | null, fresh: boolean) {
  if (!fresh || checkin?.[id] == null) return SCALE_QUESTIONS[id];
  return null;
}

function recommendationFor(
  key: PeppeDecision['key'],
  input: EngineInput,
  fuel: number,
  questions: PeppeQuestion[],
  now: Date,
): Pick<PeppeDecision, 'recommendationTitle' | 'recommendationBody' | 'recommendationActions' | 'tone' | 'nextMoment'> {
  const hasPain = Boolean(input.checkin?.pain);
  if (hasPain) return {
    recommendationTitle: 'La molestia pasa primero.',
    recommendationBody: 'Peppe mantendrá la carga en segundo plano hasta entender si esa molestia cambia o limita el movimiento.',
    recommendationActions: ['Evita sumar intensidad por iniciativa propia', 'Registra si el dolor cambia con movimiento o reposo', 'Prioriza recuperación y la indicación de tu coach'],
    tone: 'bad',
    nextMoment: 'Nueva lectura de la molestia antes de la próxima carga',
  };

  if (questions.length) return {
    recommendationTitle: 'Me falta una señal humana antes de decidir.',
    recommendationBody: 'Las aplicaciones ya entregaron el contexto objetivo. Estas respuestas son las únicas que pueden cambiar la indicación de este momento.',
    recommendationActions: ['Responde sólo lo que aparece', 'Peppe actualizará la recomendación inmediatamente después'],
    tone: 'neutral',
    nextMoment: 'Decisión inmediata después de tu respuesta',
  };

  const nextMinutes = plannedMinutes(input.nextPlanned, now);
  if (key === 'post_training') return {
    recommendationTitle: fuel < 60 ? 'Recupera combustible ahora.' : 'Recuperación simple y suficiente.',
    recommendationBody: fuel < 60
      ? 'La sesión reciente redujo tu disponibilidad estimada. Conviene recuperar carbohidratos, proteína y líquidos sin esperar a tener hambre extrema.'
      : 'La sesión ya quedó registrada y no aparecen señales que obliguen a intervenir más. Recupera, hidrátate y deja que Peppe vuelva a preguntar sólo si cambia el contexto.',
    recommendationActions: fuel < 60 ? ['Comida post entrenamiento con carbohidratos + proteína', 'Rehidrata con líquidos y sodio según sudoración', 'Revisa piernas más tarde si siguen cargadas'] : ['Come normalmente según hambre y próxima sesión', 'Hidrátate', 'Evita agregar carga extra sin necesidad'],
    tone: fuel < 60 ? 'warn' : 'good',
    nextMoment: input.nextPlanned ? `Preparación para ${input.nextPlanned.title}` : 'Próxima comida o cambio de sensación',
  };

  if (key === 'pre_training') return {
    recommendationTitle: fuel < 65 ? 'Llega con más combustible a la sesión.' : 'Puedes seguir el plan previsto.',
    recommendationBody: fuel < 65
      ? 'La combinación entre próxima sesión, última ingesta y señales actuales sugiere que conviene comer o beber antes de entrenar.'
      : 'Peppe ya tiene suficiente contexto y no detecta una razón para cambiar la sesión planificada.',
    recommendationActions: fuel < 65 ? ['Prioriza carbohidrato fácil de digerir', 'Toma líquidos antes de salir', 'No experimentes con alimentos nuevos'] : ['Mantén la sesión del plan', 'Hidratación habitual', 'Vuelve si cambian piernas, energía o dolor'],
    tone: fuel < 65 ? 'warn' : 'good',
    nextMoment: 'Post entrenamiento: Peppe importará Strava y preguntará sólo sensaciones',
  };

  if (key === 'meal') return {
    recommendationTitle: fuel < 60 ? 'Esta comida importa para tu objetivo de hoy.' : 'Come con contexto, no por obligación.',
    recommendationBody: fuel < 60
      ? 'Tu disponibilidad estimada está baja o tienes carga cercana. Esta comida debería ayudar a recuperar o preparar la siguiente sesión.'
      : 'No hay una señal fuerte de déficit. Usa hambre, recuperación y el entrenamiento que viene para definir cantidad.',
    recommendationActions: fuel < 60 ? ['Incluye una fuente clara de carbohidrato', 'Asegura proteína suficiente', 'Agrega líquidos'] : ['Proteína + vegetales como base', 'Carbohidrato proporcional a la carga próxima', 'Puedes aportar una foto para afinar la recomendación'],
    tone: fuel < 60 ? 'warn' : 'good',
    nextMoment: nextMinutes != null && nextMinutes < 720 ? 'Preparación del próximo entrenamiento' : 'Siguiente cambio de hambre, energía o actividad',
  };

  if (key === 'morning') return {
    recommendationTitle: 'El día ya tiene una dirección.',
    recommendationBody: input.nextPlanned
      ? `Peppe organizará alimentación y recuperación alrededor de “${input.nextPlanned.title}”. No necesitas completar un reporte largo si los datos objetivos ya están disponibles.`
      : 'Peppe tiene tu objetivo, pero falta una próxima sesión en el plan. Puedes agregarla una vez en Plan y rutina; después dejará de preguntarte por contexto de entrenamiento.',
    recommendationActions: input.nextPlanned ? ['Mantén el plan del coach como referencia principal', 'Responde sólo si Peppe detecta un dato subjetivo faltante'] : ['Agrega la próxima sesión desde el menú ☰', 'Mientras tanto, Peppe usará la actividad reciente como contexto'],
    tone: input.nextPlanned ? 'good' : 'neutral',
    nextMoment: input.nextPlanned ? `Antes de ${input.nextPlanned.title}` : 'Cuando exista una comida, entrenamiento o cambio relevante',
  };

  if (key === 'prepare_next') return {
    recommendationTitle: fuel < 65 ? 'Empieza a preparar la próxima sesión.' : 'Mantén recuperación y rutina.',
    recommendationBody: input.nextPlanned ? `La próxima decisión importante será llegar bien a “${input.nextPlanned.title}”. Peppe seguirá usando alimentación, descanso y sensaciones para ajustar sin cambiar el plan del coach.` : 'No hay sesión próxima cargada.',
    recommendationActions: fuel < 65 ? ['No recortes demasiado carbohidratos antes de una sesión exigente', 'Hidrátate durante el día', 'Prioriza sueño'] : ['Come normalmente', 'Mantén hidratación', 'Prioriza sueño'],
    tone: fuel < 65 ? 'warn' : 'good',
    nextMoment: input.nextPlanned ? `Ventana pre-entreno cerca de ${formatClock(new Date(input.nextPlanned.scheduled_at))}` : 'Próximo cambio de contexto',
  };

  if (key === 'evening') return {
    recommendationTitle: 'Cierra el día preparando mañana.',
    recommendationBody: input.nextPlanned ? `Mañana importa llegar recuperado para “${input.nextPlanned.title}”. Peppe no necesita más métricas si ya tiene sueño previsto, carga y sensaciones.` : 'Sin una próxima sesión cargada, el cierre se concentra en recuperación general.',
    recommendationActions: ['Cena suficiente para la carga próxima', 'Hidrátate', 'Prioriza el horario de sueño definido'],
    tone: 'good',
    nextMoment: 'Lectura de mañana sólo si falta algo que cambie el plan',
  };

  return {
    recommendationTitle: 'No necesito interrumpirte ahora.',
    recommendationBody: 'Peppe ya tiene suficiente contexto. Volverá a aparecer cuando exista una decisión real: entrenar, comer, recuperar o responder a una señal del cuerpo.',
    recommendationActions: ['Sigue tu plan', 'Aporta una foto o sensación sólo si algo cambió'],
    tone: 'good',
    nextMoment: 'Automático según plan, horario o nueva actividad',
  };
}

export function buildPeppeDecision(input: EngineInput): PeppeDecision {
  const now = input.now ?? new Date();
  const end = trainingEnd(input.latestTraining);
  const postTraining = end ? minutesBetween(now, end) >= 0 && minutesBetween(now, end) <= 240 : false;
  const nextMinutes = plannedMinutes(input.nextPlanned, now);
  const preTraining = nextMinutes != null && nextMinutes >= -20 && nextMinutes <= 180;
  const mealWindow = nearMeal(now, input.prefs);
  const checkinFresh = isFreshCheckin(input.checkin, now, postTraining ? end : null);
  const meal = latestMeal(input.nutrition, now);
  const fuel = fuelEstimate(input.scores, input.nutrition, input.checkin, input.latestTraining, now);

  let key: PeppeDecision['key'];
  if (postTraining) key = 'post_training';
  else if (preTraining) key = 'pre_training';
  else if (mealWindow) key = 'meal';
  else if (now.getHours() < 10) key = 'morning';
  else if (nextMinutes != null && nextMinutes > 180 && nextMinutes <= 1080) key = 'prepare_next';
  else if (now.getHours() >= 19) key = 'evening';
  else key = 'wait';

  const questions: PeppeQuestion[] = [];
  const add = (id: QuestionId) => {
    const question = questionIfMissing(id, input.checkin, checkinFresh);
    if (question && !questions.some((q) => q.id === id)) questions.push(question);
  };

  if (key === 'post_training') {
    add('legs');
    add('soreness');
    add('hunger');
  } else if (key === 'pre_training') {
    add('energy');
    add('legs');
    if (!meal || minutesBetween(now, meal.date) > 180 || fuel < 70) add('hunger');
  } else if (key === 'meal') {
    if (fuel < 75 || !meal || minutesBetween(now, meal.date) > 180) add('hunger');
    if (!checkinFresh && (input.scores.recovery ?? 100) < 70) add('energy');
  } else if (key === 'morning') {
    add('energy');
    add('legs');
  } else if (key === 'prepare_next') {
    if (fuel < 65) add('hunger');
    if (!checkinFresh) add('energy');
  } else if (key === 'evening') {
    add('legs');
    if ((input.scores.recovery ?? 100) < 70) add('soreness');
  }

  const limitedQuestions = questions.slice(0, 3);
  const known = buildKnown(input, now, fuel);

  const momentMap: Record<PeppeDecision['key'], Pick<PeppeDecision, 'momentLabel' | 'momentTitle' | 'momentDescription' | 'decisionTitle' | 'decisionReason'>> = {
    post_training: {
      momentLabel: 'POST ENTRENAMIENTO',
      momentTitle: 'Ya recibí tu sesión.',
      momentDescription: 'Strava aporta lo realizado. Ahora Peppe sólo completa lo que ninguna app puede saber de tu cuerpo.',
      decisionTitle: 'Decidir cómo recuperar sin repetir preguntas.',
      decisionReason: 'La prioridad es recuperar para el objetivo y proteger la próxima sesión del plan.',
    },
    pre_training: {
      momentLabel: 'PRE ENTRENAMIENTO',
      momentTitle: input.nextPlanned ? `Se acerca: ${input.nextPlanned.title}` : 'Se acerca tu entrenamiento.',
      momentDescription: 'Peppe cruza el plan con lo que comiste, tu estado y los datos disponibles antes de decidir si hace falta ajustar algo.',
      decisionTitle: 'Decidir si necesitas combustible, hidratación o sólo seguir el plan.',
      decisionReason: 'El coach define la sesión; Peppe optimiza cómo llegas a ella.',
    },
    meal: {
      momentLabel: `MOMENTO DE ${mealWindow?.name?.toUpperCase() ?? 'ALIMENTACIÓN'}`,
      momentTitle: 'Comer según lo que pasó y lo que viene.',
      momentDescription: 'La comida se interpreta dentro del entrenamiento, recuperación, hambre y objetivo. No como una pauta aislada.',
      decisionTitle: 'Decidir cuánto combustible necesitas en esta comida.',
      decisionReason: 'Peppe ajusta la comida al contexto y evita comer por un formulario rígido.',
    },
    morning: {
      momentLabel: 'INICIO DEL DÍA',
      momentTitle: 'Buenos días. Primero, contexto.',
      momentDescription: 'Peppe revisa objetivo, plan, actividad y métricas antes de pedirte algo.',
      decisionTitle: 'Decidir cómo ordenar el día alrededor del plan.',
      decisionReason: 'Las sensaciones sólo se preguntan si cambian la lectura que ya entregan las aplicaciones.',
    },
    prepare_next: {
      momentLabel: 'PREPARANDO LO QUE VIENE',
      momentTitle: input.nextPlanned ? `Próximo foco: ${input.nextPlanned.title}` : 'Preparar la próxima sesión.',
      momentDescription: 'Todavía no es hora de entrenar. Peppe usa este bloque para proteger recuperación, combustible y sueño.',
      decisionTitle: 'Decidir si hoy hay que anticipar recuperación o alimentación.',
      decisionReason: 'La meta es llegar mejor a la sesión planificada, no sumar decisiones innecesarias.',
    },
    evening: {
      momentLabel: 'CIERRE DEL DÍA',
      momentTitle: 'Preparar mañana sin sobrecargarte de preguntas.',
      momentDescription: 'Peppe conserva lo aprendido durante el día y sólo pide una señal si cambia la decisión de recuperación.',
      decisionTitle: 'Decidir cómo cerrar alimentación, hidratación y descanso.',
      decisionReason: 'El próximo entrenamiento define qué tan importante es recuperar hoy.',
    },
    wait: {
      momentLabel: 'PEPPE EN SEGUNDO PLANO',
      momentTitle: 'No hace falta que hagas nada ahora.',
      momentDescription: 'Tus fuentes siguen aportando contexto. Peppe vuelve cuando haya una decisión real.',
      decisionTitle: 'Quedarse callado también es parte del producto.',
      decisionReason: 'Una buena experiencia no pregunta por preguntar.',
    },
  };

  const recommendation = recommendationFor(key, input, fuel, limitedQuestions, now);
  const missingLabels = limitedQuestions.map((question) => question.label.replace('¿', '').replace('?', ''));
  const contextBits = [input.stravaConnected ? 'Strava conectado' : 'Strava pendiente', input.nextPlanned ? 'plan cargado' : 'sin próxima sesión', input.dailyMetric ? 'métricas del día disponibles' : 'métricas del día pendientes'];

  return {
    key,
    ...momentMap[key],
    ...recommendation,
    questions: limitedQuestions,
    known,
    missingLabels,
    contextLine: contextBits.join(' · '),
  };
}
