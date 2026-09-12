/**
 * Tipos canónicos de Peppe.
 *
 * CONVENCIÓN DE ESCALAS SUBJETIVAS (obligatoria, no negociable)
 * --------------------------------------------------------------
 * Todas las señales subjetivas son enteros 1..10 y TODAS apuntan en la misma
 * dirección: un valor más alto significa MÁS COSTO para el atleta.
 *
 *   legsLoad   1 = piernas frescas      10 = piernas muy cargadas
 *   soreness   1 = sin molestia         10 = molestia muy alta
 *   stress     1 = sin estrés           10 = estrés muy alto
 *   hunger     1 = sin hambre           10 = hambre extrema
 *
 * La única excepción es `energy`, donde el lenguaje natural hace imposible
 * invertirla sin confundir al usuario. Queda marcada explícitamente:
 *
 *   energy     1 = sin energía          10 = energía excelente   (INVERSA)
 *
 * Cualquier UI que pregunte estas señales DEBE usar estas etiquetas.
 * Cualquier fila histórica que no pueda garantizar esta convención debe
 * llegar con scaleVersion = 'unknown' y el motor la descarta.
 */

export const ENGINE_VERSION = 'peppe-core@1.0.0';

export type ScaleVersion = 'v1' | 'unknown';

export type Checkin = {
  /** 1 = sin energía, 10 = excelente (INVERSA: más alto es mejor) */
  energy: number | null;
  /** 1 = sin hambre, 10 = hambre extrema */
  hunger: number | null;
  /** 1 = frescas, 10 = muy cargadas */
  legsLoad: number | null;
  /** 1 = sin molestia, 10 = molestia muy alta */
  soreness: number | null;
  /** 1 = sin estrés, 10 = estrés muy alto */
  stress: number | null;
  pain: boolean | null;
  notes: string | null;
  checkedAt: Date;
  scaleVersion: ScaleVersion;
};

export type Goal = {
  primaryGoal: string | null;
  goalDate: Date | null;
  goalTarget: string | null;
  primarySport: string | null;
};

export type Preferences = {
  timezone: string | null;
  wakeTime: string | null;
  breakfastTime: string | null;
  lunchTime: string | null;
  dinnerTime: string | null;
  sleepTime: string | null;
  mealPromptLeadMinutes: number | null;
};

export type Meal = {
  id: string | number;
  eatenAt: Date;
  description: string;
  photoPath: string | null;
  carbsG: number | null;
  proteinG: number | null;
};

/** Una sesión ya ejecutada (venga de Strava, Garmin, TrainingPeaks o manual). */
export type Activity = {
  id: string | number;
  provider: string;
  title: string | null;
  sport: string | null;
  startedAt: Date;
  durationSeconds: number | null;
  movingSeconds: number | null;
  distanceM: number | null;
  avgHr: number | null;
  avgPower: number | null;
  trainingLoad: number | null;
  tss: number | null;
  /** 1..10, esfuerzo percibido. Más alto = más exigente. */
  rpe: number | null;
};

/** Una sesión planificada por el coach. Peppe NUNCA la modifica. */
export type PlannedSession = {
  id: string;
  scheduledAt: Date;
  title: string;
  sport: string | null;
  distanceTargetKm: number | null;
  durationTargetMinutes: number | null;
  intensity: string | null;
  notes: string | null;
  source: string;
};

export type DailyMetric = {
  metricDate: string;
  sleepMinutes: number | null;
  hrvMs: number | null;
  restingHrBpm: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
  bodyBattery: number | null;
  source: string | null;
};

export type GlucoseReading = {
  measuredAt: Date;
  glucoseMgDl: number;
  trend: string | null;
  source: string | null;
};

export type StoredScores = {
  readiness: number | null;
  fuel: number | null;
  recovery: number | null;
  load: number | null;
  scoreDate: string;
};

export type IntegrationStatus = {
  provider: string;
  connected: boolean;
  lastSyncedAt: Date | null;
};

/**
 * Entrada única del motor. Es data pura: no hay cliente de Supabase acá.
 * Web y móvil construyen este objeto con sus propios adaptadores y el motor
 * responde exactamente lo mismo para la misma entrada.
 */
export type PeppeInput = {
  now: Date;
  goal: Goal | null;
  prefs: Preferences | null;
  storedScores: StoredScores | null;
  checkin: Checkin | null;
  nutrition: Meal[];
  lastActivity: Activity | null;
  nextPlanned: PlannedSession | null;
  dailyMetric: DailyMetric | null;
  glucose: GlucoseReading | null;
  integrations: IntegrationStatus[];
  /** Readiness de los últimos 28 días, para comparar contra el propio baseline. */
  readinessHistory: number[];
  /** Pantallazos / evidencia aportada recientemente. */
  evidenceCount: number;
};

export type MomentKey =
  | 'post_training'
  | 'pre_training'
  | 'meal'
  | 'morning'
  | 'prepare_next'
  | 'evening'
  | 'wait';

export type QuestionId =
  | 'energy'
  | 'hunger'
  | 'legs'
  | 'soreness'
  | 'pain'
  | 'rpe'
  | 'meal_recent'
  | 'goal';

export type QuestionKind = 'scale' | 'choice' | 'text';

export type Question = {
  id: QuestionId;
  kind: QuestionKind;
  label: string;
  helper: string;
  /** Por qué Peppe necesita esto y ninguna app puede saberlo. */
  why: string;
  lowLabel?: string;
  highLabel?: string;
  options?: Array<{ label: string; value: string }>;
  /** Prioridad: menor número se pregunta antes. */
  priority: number;
};

export type Fact = {
  label: string;
  value: string;
  source: string;
};

/** Traza de cada regla que disparó. Esto es lo que hace auditable al motor. */
export type Reason = {
  rule: string;
  detail: string;
};

export type ScoreSource = 'stored' | 'derived' | 'none';

export type Scores = {
  readiness: number | null;
  fuel: number | null;
  recovery: number | null;
  load: number | null;
  source: ScoreSource;
};

export type ConfidenceLevel = 'alta' | 'media' | 'provisional';

export type Confidence = {
  completeness: number;
  confidence: number;
  level: ConfidenceLevel;
  missing: string[];
};

export type State = 'favorable' | 'attention' | 'incomplete';

export type Guardrail = 'pain_lock' | 'stale_scale' | 'coach_owns_plan';

export type PeppeDecision = {
  engineVersion: string;
  generatedAt: Date;
  moment: {
    key: MomentKey;
    label: string;
    title: string;
    description: string;
  };
  state: State;
  scores: Scores;
  confidence: Confidence;
  questions: Question[];
  known: Fact[];
  recommendation: {
    headline: string;
    body: string;
    actions: string[];
    training: string;
    nutrition: string;
    recovery: string;
  };
  comparison: string;
  objectiveStatus: string;
  nextMoment: string;
  why: Reason[];
  guardrails: Guardrail[];
};
