import { supabase } from './supabase';

export type PeppeQuestionKind = 'scale' | 'choice' | 'text';

export type PeppeQuestion = {
  id: 'energy' | 'hunger' | 'legs' | 'pain' | 'post_rpe' | 'meal_recent' | 'meal_description' | 'goal';
  category: 'sensations' | 'training' | 'nutrition' | 'goal';
  title: string;
  helper?: string;
  kind: PeppeQuestionKind;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
};

export type AdaptiveQuestionContext = {
  questions: PeppeQuestion[];
  postTraining: boolean;
  activityId: number | null;
  activitySport: string | null;
};

const SCALE_HELPER = '1 = muy bajo / fresco · 10 = muy alto / cargado';

export async function buildAdaptiveQuestions(athleteId: string): Promise<AdaptiveQuestionContext> {
  const now = Date.now();
  const since8h = new Date(now - 8 * 60 * 60 * 1000).toISOString();
  const since6h = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  const since4h = new Date(now - 4 * 60 * 60 * 1000).toISOString();

  const [checkinRes, nutritionRes, activityRes, profileRes] = await Promise.all([
    supabase.from('subjective_checkins').select('checked_at,energy,hunger,legs,pain').eq('athlete_id', athleteId).gte('checked_at', since8h).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('nutrition_entries').select('id,eaten_at').eq('athlete_id', athleteId).gte('eaten_at', since6h).order('eaten_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('activities').select('id,sport,started_at,duration_seconds,rpe').eq('athlete_id', athleteId).gte('started_at', since4h).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('athlete_profiles').select('primary_goal').eq('user_id', athleteId).maybeSingle(),
  ]);

  const errors = [checkinRes.error, nutritionRes.error, activityRes.error, profileRes.error].filter(Boolean);
  if (errors.length) throw errors[0];

  const checkin = checkinRes.data;
  const activity = activityRes.data;
  const activityFinishedAt = activity ? new Date(new Date(activity.started_at).getTime() + Number(activity.duration_seconds ?? 0) * 1000).getTime() : 0;
  const checkinAt = checkin?.checked_at ? new Date(checkin.checked_at).getTime() : 0;
  const postTraining = Boolean(activity && activityFinishedAt > 0 && activityFinishedAt <= now && checkinAt < activityFinishedAt);

  const questions: PeppeQuestion[] = [];

  if (postTraining) {
    if (activity?.rpe == null) {
      questions.push({ id: 'post_rpe', category: 'training', title: '¿Qué tan exigente se sintió el entrenamiento?', helper: '1 = muy fácil · 10 = máximo esfuerzo percibido', kind: 'scale' });
    }
    questions.push(
      { id: 'legs', category: 'training', title: '¿Cómo quedaron tus piernas?', helper: '1 = frescas · 10 = muy cargadas', kind: 'scale' },
      { id: 'pain', category: 'training', title: '¿Apareció alguna molestia o dolor?', helper: 'Peppe no diagnostica; esta señal cambia cuánto conviene exigir hoy.', kind: 'choice', options: [{ label: 'No', value: 'no' }, { label: 'Sí', value: 'yes' }] },
      { id: 'hunger', category: 'nutrition', title: '¿Cuánta hambre tienes ahora?', helper: SCALE_HELPER, kind: 'scale' },
    );
  } else if (!checkin) {
    questions.push(
      { id: 'energy', category: 'sensations', title: '¿Cómo está tu energía ahora?', helper: '1 = sin energía · 10 = excelente', kind: 'scale' },
      { id: 'legs', category: 'sensations', title: '¿Qué tan cargadas están tus piernas?', helper: '1 = frescas · 10 = muy cargadas', kind: 'scale' },
      { id: 'hunger', category: 'nutrition', title: '¿Cuánta hambre tienes?', helper: '1 = nada · 10 = mucha hambre', kind: 'scale' },
      { id: 'pain', category: 'sensations', title: '¿Tienes alguna molestia o dolor que Peppe deba considerar?', kind: 'choice', options: [{ label: 'No', value: 'no' }, { label: 'Sí', value: 'yes' }] },
    );
  }

  if (!nutritionRes.data) {
    questions.push(
      { id: 'meal_recent', category: 'nutrition', title: '¿Comiste en las últimas 3 horas?', helper: 'Esto ayuda a interpretar Fuel y la próxima decisión nutricional.', kind: 'choice', options: [{ label: 'Sí', value: 'yes' }, { label: 'No', value: 'no' }] },
      { id: 'meal_description', category: 'nutrition', title: 'Muéstrame qué comiste.', helper: 'Saca una foto o elige una imagen. Si quieres, agrega una descripción breve; la foto es suficiente para registrar la comida.', kind: 'text', placeholder: 'Opcional: plátano, tostada, huevos y café' },
    );
  }

  if (!profileRes.data?.primary_goal) {
    questions.push({ id: 'goal', category: 'goal', title: '¿Cuál es el objetivo que debe guiar tus próximas semanas?', helper: 'Ejemplo: Maratón sub 3 horas, bajar grasa sin perder rendimiento, mejorar VO₂max.', kind: 'text', placeholder: 'Escribe tu objetivo principal' });
  }

  return { questions, postTraining, activityId: activity?.id ?? null, activitySport: activity?.sport ?? null };
}

export async function saveAdaptiveAnswers(athleteId: string, context: AdaptiveQuestionContext, answers: Record<string, string | number>) {
  const errors: string[] = [];
  const energy = numberOrNull(answers.energy);
  const hunger = numberOrNull(answers.hunger);
  const legs = numberOrNull(answers.legs);
  const pain = answers.pain === 'yes';

  if (energy != null || hunger != null || legs != null || answers.pain != null) {
    const { error } = await supabase.from('subjective_checkins').insert({
      athlete_id: athleteId,
      energy,
      hunger,
      legs,
      pain,
      notes: context.postTraining ? `adaptive_post_training:${context.activitySport ?? 'activity'}` : 'adaptive_daily_open',
    });
    if (error) errors.push(error.message);
  }

  const postRpe = numberOrNull(answers.post_rpe);
  if (context.activityId && postRpe != null) {
    const { error } = await supabase.from('activities').update({ rpe: postRpe }).eq('id', context.activityId).eq('athlete_id', athleteId);
    if (error) errors.push(error.message);
  }

  const mealDescription = typeof answers.meal_description === 'string' ? answers.meal_description.trim() : '';
  const mealPhotoPath = typeof answers.meal_photo_path === 'string' ? answers.meal_photo_path : '';
  if (answers.meal_recent === 'yes' && (mealDescription || mealPhotoPath)) {
    const { error } = await supabase.from('nutrition_entries').insert({
      athlete_id: athleteId,
      eaten_at: new Date().toISOString(),
      description: mealDescription || 'Comida registrada por foto · pendiente de análisis visual',
      photo_path: mealPhotoPath || null,
      source: mealPhotoPath ? 'adaptive_photo' : 'adaptive_checkin',
    });
    if (error) errors.push(error.message);
  }

  const goal = typeof answers.goal === 'string' ? answers.goal.trim() : '';
  if (goal) {
    const { data: existing } = await supabase.from('athlete_profiles').select('user_id').eq('user_id', athleteId).maybeSingle();
    const result = existing
      ? await supabase.from('athlete_profiles').update({ primary_goal: goal, updated_at: new Date().toISOString() }).eq('user_id', athleteId)
      : await supabase.from('athlete_profiles').insert({ user_id: athleteId, primary_goal: goal });
    if (result.error) errors.push(result.error.message);
  }

  if (errors.length) throw new Error(errors[0]);
}

function numberOrNull(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
