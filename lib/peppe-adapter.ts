import { supabase } from './supabase';
import { normalizeCheckin, type PeppeInput } from '../packages/peppe-core/src/index.ts';

/**
 * ADAPTADOR SUPABASE → MOTOR
 *
 * Única capa del sistema que conoce nombres de tablas y columnas. El motor
 * (`decide()`) recibe datos puros y no sabe que Supabase existe.
 *
 * Por qué importa: cuando consolidemos las tablas duplicadas (activities vs
 * training_sessions, etc.), sólo hay que cambiar este archivo. El motor, sus
 * tests y las pantallas no se enteran.
 *
 * Tablas elegidas según la auditoría del 13-09: se usan las que tienen datos
 * reales (training_sessions con 39 filas, integration_accounts, athlete_profiles).
 */

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function loadPeppeInput(userId: string, now = new Date()): Promise<PeppeInput> {
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const since14d = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();
  const since28d = new Date(now.getTime() - 28 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [goalRes, prefsRes, scoresRes, checkinRes, nutritionRes, trainingRes, plannedRes, metricRes, glucoseRes, integrationsRes, historyRes] =
    await Promise.all([
      supabase.from('athlete_profiles').select('primary_goal,goal_date,goal_target,primary_sport').eq('user_id', userId).maybeSingle(),
      supabase.from('user_preferences').select('timezone,wake_time,breakfast_time,lunch_time,dinner_time,sleep_time,meal_prompt_lead_minutes').eq('athlete_id', userId).maybeSingle(),
      supabase.from('scores').select('readiness,fuel,recovery,load,score_date').eq('athlete_id', userId).order('score_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('subjective_checkins').select('energy,hunger,legs,stress,soreness,pain,notes,checked_at').eq('athlete_id', userId).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('nutrition_entries').select('id,eaten_at,description,photo_path,carbs_g,protein_g').eq('athlete_id', userId).gte('eaten_at', since24h).order('eaten_at', { ascending: false }).limit(20),
      supabase.from('training_sessions').select('id,provider,title,sport,started_at,duration_seconds,moving_seconds,distance_m,avg_hr,avg_power,training_load,tss').eq('athlete_id', userId).gte('started_at', since14d).order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('planned_sessions').select('id,scheduled_at,title,sport,distance_target_km,duration_target_minutes,intensity,notes,source').eq('athlete_id', userId).gte('scheduled_at', new Date(now.getTime() - 3600 * 1000).toISOString()).order('scheduled_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('daily_metrics').select('metric_date,sleep_minutes,hrv_ms,resting_hr_bpm,weight_kg,body_fat_pct,body_battery,source').eq('athlete_id', userId).order('metric_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('glucose_readings').select('measured_at,glucose_mg_dl,trend,source').eq('athlete_id', userId).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('integration_accounts').select('provider,status,last_synced_at').eq('user_id', userId),
      supabase.from('scores').select('readiness,score_date').eq('athlete_id', userId).gte('score_date', since28d).order('score_date', { ascending: true }),
    ]);

  const goalRow = goalRes.data;
  const prefsRow = prefsRes.data;
  const trainingRow = trainingRes.data;
  const plannedRow = plannedRes.data;
  const metricRow = metricRes.data;
  const glucoseRow = glucoseRes.data;

  return {
    now,

    goal: goalRow
      ? {
          primaryGoal: goalRow.primary_goal,
          goalDate: toDate(goalRow.goal_date),
          goalTarget: goalRow.goal_target,
          primarySport: goalRow.primary_sport,
        }
      : null,

    prefs: prefsRow
      ? {
          timezone: prefsRow.timezone,
          wakeTime: prefsRow.wake_time,
          breakfastTime: prefsRow.breakfast_time,
          lunchTime: prefsRow.lunch_time,
          dinnerTime: prefsRow.dinner_time,
          sleepTime: prefsRow.sleep_time,
          mealPromptLeadMinutes: prefsRow.meal_prompt_lead_minutes,
        }
      : null,

    storedScores: scoresRes.data
      ? {
          readiness: scoresRes.data.readiness,
          fuel: scoresRes.data.fuel,
          recovery: scoresRes.data.recovery,
          load: scoresRes.data.load,
          scoreDate: scoresRes.data.score_date,
        }
      : null,

    // normalizeCheckin decide si la escala de piernas es confiable.
    // Mientras 002_escala_piernas.sql no esté aplicado, las filas no traen
    // scale_version y la señal de piernas se descarta a propósito.
    checkin: normalizeCheckin(checkinRes.data ?? null),

    nutrition: (nutritionRes.data ?? []).map((row) => ({
      id: row.id,
      eatenAt: new Date(row.eaten_at),
      description: row.description,
      photoPath: row.photo_path,
      carbsG: row.carbs_g ?? null,
      proteinG: row.protein_g ?? null,
    })),

    lastActivity: trainingRow
      ? {
          id: trainingRow.id,
          provider: trainingRow.provider ?? 'desconocido',
          title: trainingRow.title,
          sport: trainingRow.sport,
          startedAt: new Date(trainingRow.started_at),
          durationSeconds: trainingRow.duration_seconds,
          movingSeconds: trainingRow.moving_seconds,
          distanceM: trainingRow.distance_m,
          avgHr: trainingRow.avg_hr,
          avgPower: trainingRow.avg_power,
          trainingLoad: trainingRow.training_load,
          tss: trainingRow.tss,
          // training_sessions no tiene columna rpe. La tiene 'activities', que
          // es la tabla que usa el móvil. Ver docs/consolidacion-esquema.md.
          rpe: null,
        }
      : null,

    nextPlanned: plannedRow
      ? {
          id: plannedRow.id,
          scheduledAt: new Date(plannedRow.scheduled_at),
          title: plannedRow.title,
          sport: plannedRow.sport,
          distanceTargetKm: plannedRow.distance_target_km,
          durationTargetMinutes: plannedRow.duration_target_minutes,
          intensity: plannedRow.intensity,
          notes: plannedRow.notes,
          source: plannedRow.source,
        }
      : null,

    dailyMetric: metricRow
      ? {
          metricDate: metricRow.metric_date,
          sleepMinutes: metricRow.sleep_minutes,
          hrvMs: metricRow.hrv_ms,
          restingHrBpm: metricRow.resting_hr_bpm,
          weightKg: metricRow.weight_kg,
          bodyFatPct: metricRow.body_fat_pct,
          bodyBattery: metricRow.body_battery,
          source: metricRow.source,
        }
      : null,

    glucose: glucoseRow
      ? {
          measuredAt: new Date(glucoseRow.measured_at),
          glucoseMgDl: glucoseRow.glucose_mg_dl,
          trend: glucoseRow.trend,
          source: glucoseRow.source,
        }
      : null,

    integrations: (integrationsRes.data ?? []).map((row) => ({
      provider: row.provider,
      connected: row.status === 'connected',
      lastSyncedAt: toDate(row.last_synced_at),
    })),

    readinessHistory: (historyRes.data ?? [])
      .map((row) => row.readiness)
      .filter((value): value is number => typeof value === 'number'),

    evidenceCount: 0,
  };
}
