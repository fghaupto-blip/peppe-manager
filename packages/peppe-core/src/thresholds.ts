/**
 * TODOS los números del motor viven acá.
 *
 * Antes estaban repartidos entre lib/peppe-engine.ts, app/peppe-enhancer-v2.tsx
 * y mobile/lib/intelligence.ts, con valores distintos entre sí y sin
 * justificación escrita. Eso hacía imposible saber si el motor estaba bien o
 * mal calibrado.
 *
 * Regla: si un número aparece en la lógica, tiene que estar acá con un
 * comentario que diga de dónde sale. `origin` marca la procedencia real:
 *
 *   'heredado'  el valor venía del código anterior, se conserva por continuidad
 *   'consenso'  respaldado por literatura o práctica estándar de entrenamiento
 *   'arbitrario' inventado, pendiente de calibrar contra datos reales
 *
 * Los 'arbitrario' son deuda: cuando haya histórico suficiente, se calibran.
 */

export type Thresholds = typeof DEFAULT_THRESHOLDS;

export const DEFAULT_THRESHOLDS = {
  /** Ventana en minutos tras terminar la sesión donde el momento es post-entreno. */
  postTrainingWindowMin: 240, // origin: heredado (peppe-engine.ts)
  /** Minutos antes de la sesión planificada donde el momento es pre-entreno. */
  preTrainingWindowMin: 180, // origin: heredado
  /** Tolerancia después de la hora planificada antes de dejar de considerarla pre-entreno. */
  preTrainingGraceMin: 20, // origin: heredado
  /** Un check-in se considera vigente durante este tiempo. */
  checkinFreshnessMin: 240, // origin: heredado
  /** Una lectura de glucosa se considera vigente durante este tiempo. */
  glucoseFreshnessMin: 30, // origin: heredado
  /** Minutos antes de una comida en que Peppe la considera "el momento". */
  mealLeadMinDefault: 20, // origin: heredado (user_preferences lo sobrescribe)
  /** Minutos después de la hora de comida en que la ventana sigue abierta. */
  mealTrailMin: 45, // origin: heredado
  /** Antes de esta hora, el momento es "inicio del día". */
  morningBeforeHour: 10, // origin: arbitrario
  /** Desde esta hora, el momento es "cierre del día". */
  eveningFromHour: 19, // origin: arbitrario

  fuel: {
    /** Punto de partida cuando no hay ningún dato. */
    base: 64, // origin: arbitrario
    /** Bonus si la última comida fue hace menos de `recentMealMin`. */
    recentMealBonus: 12, // origin: arbitrario
    recentMealMin: 180, // origin: consenso (ventana típica de digestión/disponibilidad)
    /** Castigo si la última comida fue hace más de `staleMealMin`. */
    staleMealPenalty: 8, // origin: arbitrario
    staleMealMin: 300, // origin: arbitrario
    /** Castigo si no hay ninguna comida registrada. */
    noMealPenalty: 10, // origin: arbitrario
    /** Castigo por punto de hambre sobre el umbral. */
    hungerPenaltyPerPoint: 4, // origin: arbitrario
    hungerPivot: 5, // origin: arbitrario
    /** Ajuste por punto de energía respecto del pivote. */
    energyAdjustPerPoint: 2, // origin: arbitrario
    energyPivot: 6, // origin: arbitrario
    /** Castigo por sesión reciente sin reposición. */
    postTrainingPenalty: 14, // origin: arbitrario
    min: 15,
    max: 95,
  },

  /** Bajo este fuel, la recomendación cambia a "repón combustible". */
  fuelLowPost: 60, // origin: arbitrario
  fuelLowPre: 65, // origin: arbitrario
  fuelLowMeal: 60, // origin: arbitrario

  /** Señales que activan estado 'attention'. */
  attention: {
    readinessBelow: 50, // origin: heredado (mobile/intelligence.ts)
    recoveryBelow: 50, // origin: heredado
    energyAtOrBelow: 4, // origin: heredado
    legsLoadAtOrAbove: 8, // origin: heredado (convención canónica: alto = cargado)
    sorenessAtOrAbove: 8, // origin: heredado
  },

  /** Señales que permiten estado 'favorable' sin reservas. */
  favorable: {
    readinessAtOrAbove: 60, // origin: heredado (enhancer-v2)
    legsLoadAtOrBelow: 4, // origin: heredado, convertido a escala canónica
    sorenessAtOrBelow: 4, // origin: heredado
  },

  /** Carga alta que obliga a priorizar absorción aunque el estado sea usable. */
  loadHighAtOrAbove: 75, // origin: heredado

  completeness: {
    goal: 10,
    dailyMetric: 20,
    scores: 20,
    checkin: 20,
    nutrition: 15,
    environment: 15,
    /** Bonus de confianza por tener histórico para comparar. */
    historyBonusLong: 5,
    historyBonusShort: 2,
    historyLongDays: 7,
    historyShortDays: 3,
    /** Bajo este valor, el estado es 'incomplete'. */
    incompleteBelow: 60,
  },

  /** Máximo de preguntas por momento. Peppe pregunta poco a propósito. */
  maxQuestions: 3, // origin: heredado (peppe-engine.ts)

  /** Diferencia mínima contra el baseline para reportarla como cambio real. */
  baselineDeltaMin: 3, // origin: arbitrario
  /** Días de histórico mínimos para comparar contra baseline. */
  baselineMinSamples: 3, // origin: arbitrario
} as const;
