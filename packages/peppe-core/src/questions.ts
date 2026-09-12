import type { PeppeInput, Question, QuestionId, Reason } from './types.ts';
import { DEFAULT_THRESHOLDS, type Thresholds } from './thresholds.ts';
import { ENERGY_LABELS, HUNGER_LABELS, LEGS_LABELS, SORENESS_LABELS } from './scales.ts';
import { isCheckinFresh, latestMeal, minutesBetween, type MomentResult } from './moment.ts';

/**
 * Catálogo único. Antes había dos: uno en lib/peppe-engine.ts (4 preguntas,
 * escala de piernas invertida) y otro en mobile/lib/questionEngine.ts
 * (8 preguntas, otra escala, otros textos). Este los reemplaza a ambos.
 *
 * `priority` decide qué se pregunta primero cuando hay más candidatas que
 * cupos. Menor número = más urgente.
 */
export const QUESTIONS: Record<QuestionId, Question> = {
  pain: {
    id: 'pain',
    kind: 'choice',
    label: '¿Apareció alguna molestia o dolor?',
    helper: 'Peppe no diagnostica. Esta señal cambia cuánto conviene exigir hoy.',
    why: 'Ningún dispositivo distingue fatiga normal de una molestia que conviene vigilar.',
    options: [
      { label: 'No', value: 'no' },
      { label: 'Sí', value: 'yes' },
    ],
    priority: 1,
  },
  legs: {
    id: 'legs',
    kind: 'scale',
    label: '¿Qué tan cargadas están tus piernas?',
    helper: '1 = frescas · 10 = muy cargadas. Usa la sensación global, no un músculo puntual.',
    why: 'Strava registra carga y ritmo, pero no puede saber cómo respondió tu musculatura.',
    lowLabel: LEGS_LABELS.low,
    highLabel: LEGS_LABELS.high,
    priority: 2,
  },
  energy: {
    id: 'energy',
    kind: 'scale',
    label: '¿Cómo está tu energía ahora?',
    helper: '1 = sin energía · 10 = excelente. Energía física y mental, no sólo sueño.',
    why: 'Los dispositivos estiman recuperación, pero no cómo te sientes en este momento.',
    lowLabel: ENERGY_LABELS.low,
    highLabel: ENERGY_LABELS.high,
    priority: 3,
  },
  hunger: {
    id: 'hunger',
    kind: 'scale',
    label: '¿Cuánta hambre tienes ahora?',
    helper: '1 = nada · 10 = muchísima. Cambia cuánto y cuándo conviene comer.',
    why: 'La demanda del entrenamiento se estima; el hambre sigue siendo una señal humana.',
    lowLabel: HUNGER_LABELS.low,
    highLabel: HUNGER_LABELS.high,
    priority: 4,
  },
  soreness: {
    id: 'soreness',
    kind: 'scale',
    label: '¿Qué nivel de molestia muscular tienes?',
    helper: '1 = nada · 10 = muy alta. Diferencia fatiga normal de algo que conviene vigilar.',
    why: 'Esta señal cambia la prioridad entre carga, recuperación y descanso.',
    lowLabel: SORENESS_LABELS.low,
    highLabel: SORENESS_LABELS.high,
    priority: 5,
  },
  rpe: {
    id: 'rpe',
    kind: 'scale',
    label: '¿Qué tan exigente se sintió el entrenamiento?',
    helper: '1 = muy fácil · 10 = máximo esfuerzo percibido.',
    why: 'El costo real de una sesión no siempre coincide con lo que marca el reloj.',
    lowLabel: 'Muy fácil',
    highLabel: 'Máximo',
    priority: 2,
  },
  meal_recent: {
    id: 'meal_recent',
    kind: 'choice',
    label: '¿Comiste en las últimas 3 horas?',
    helper: 'Ayuda a interpretar tu combustible disponible y la próxima decisión nutricional.',
    why: 'Sin ingesta registrada, cualquier lectura de combustible es una suposición.',
    options: [
      { label: 'Sí', value: 'yes' },
      { label: 'No', value: 'no' },
    ],
    priority: 6,
  },
  goal: {
    id: 'goal',
    kind: 'text',
    label: '¿Cuál es el objetivo que debe guiar tus próximas semanas?',
    helper: 'Ejemplo: maratón sub 3:10, bajar grasa sin perder rendimiento, mejorar VO₂max.',
    why: 'Sin objetivo, Peppe juzga días sueltos en vez de una trayectoria.',
    priority: 7,
  },
};

export type QuestionPlan = { questions: Question[]; why: Reason[] };

/**
 * Elige qué preguntar. Dos reglas de oro heredadas del producto:
 *  1. Nunca preguntar algo que una integración ya contesta.
 *  2. Nunca más de `maxQuestions` por momento.
 */
export function planQuestions(input: PeppeInput, moment: MomentResult, t: Thresholds = DEFAULT_THRESHOLDS): QuestionPlan {
  const why: Reason[] = [];
  const fresh = isCheckinFresh(input, t);
  const c = input.checkin;
  const candidates: QuestionId[] = [];

  const needs = (id: QuestionId, value: number | boolean | null | undefined, reason: string) => {
    if (fresh && value != null) return;
    candidates.push(id);
    why.push({ rule: `question.${id}`, detail: reason });
  };

  switch (moment.key) {
    case 'post_training': {
      if (input.lastActivity && input.lastActivity.rpe == null) {
        candidates.push('rpe');
        why.push({ rule: 'question.rpe', detail: 'La sesión llegó sin esfuerzo percibido.' });
      }
      needs('legs', c?.legsLoad, 'Tras la sesión hace falta releer las piernas.');
      needs('pain', c?.pain, 'Hay que descartar molestia antes de recomendar carga.');
      needs('soreness', c?.soreness, 'Distinguir fatiga esperable de molestia que vigilar.');
      needs('hunger', c?.hunger, 'La reposición depende del hambre real.');
      break;
    }
    case 'pre_training': {
      needs('energy', c?.energy, 'La energía de ahora decide si el plan se ejecuta como está.');
      needs('legs', c?.legsLoad, 'Las piernas cargadas cambian el calentamiento y el combustible.');
      const meal = latestMeal(input);
      const stale = !meal || minutesBetween(input.now, meal.eatenAt) > t.fuel.recentMealMin;
      if (stale) needs('hunger', c?.hunger, 'No hay ingesta reciente antes de entrenar.');
      break;
    }
    case 'meal': {
      const meal = latestMeal(input);
      const stale = !meal || minutesBetween(input.now, meal.eatenAt) > t.fuel.recentMealMin;
      if (stale) needs('hunger', c?.hunger, 'Definir cantidad requiere saber el hambre real.');
      if (!meal) {
        candidates.push('meal_recent');
        why.push({ rule: 'question.meal_recent', detail: 'No hay ninguna comida registrada hoy.' });
      }
      if (!fresh) needs('energy', c?.energy, 'Sin check-in vigente, la energía orienta la comida.');
      break;
    }
    case 'morning': {
      needs('energy', c?.energy, 'Abrir el día con una lectura de energía.');
      needs('legs', c?.legsLoad, 'Las piernas de la mañana condicionan el resto del día.');
      break;
    }
    case 'prepare_next': {
      if (!fresh) needs('energy', c?.energy, 'Falta una lectura reciente antes de preparar la sesión.');
      needs('hunger', c?.hunger, 'Anticipar combustible para lo que viene.');
      break;
    }
    case 'evening': {
      needs('legs', c?.legsLoad, 'Cerrar el día con el estado real de las piernas.');
      needs('soreness', c?.soreness, 'La molestia de la noche define la recuperación.');
      break;
    }
    case 'wait':
      break;
  }

  if (!input.goal?.primaryGoal) {
    candidates.push('goal');
    why.push({ rule: 'question.goal', detail: 'Sin objetivo definido no hay trayectoria contra la cual juzgar.' });
  }

  const unique = [...new Set(candidates)];
  const questions = unique
    .map((id) => QUESTIONS[id])
    .sort((a, b) => a.priority - b.priority)
    .slice(0, t.maxQuestions);

  return { questions, why };
}
