'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  buildPeppeDecision,
  type Checkin,
  type DailyMetric,
  type GlucoseReading,
  type GoalContext,
  type NutritionEntry,
  type PlannedSession,
  type Preferences,
  type QuestionId,
  type Scores,
  type TrainingSession,
} from '../../lib/peppe-engine';
import styles from './peppe-now.module.css';

type IntegrationAccount = {
  provider: string;
  status: string;
  last_synced_at: string | null;
};

type WeekSession = PlannedSession & {
  status?: string | null;
};

type SyncedTraining = TrainingSession & {
  provider?: string | null;
};

type WeatherPoint = {
  time: string;
  temp: number;
  feels: number;
  precip: number;
  wind: number;
  humidity: number;
};

type WeatherSummary = {
  recommendedStart: string | null;
  temperature: string;
  precipitation: string;
  wind: string;
  humidity: string;
  locationLabel: string;
};

const emptyScores: Scores = { readiness: null, fuel: null, recovery: null, load: null };
const scaleValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const muscleZones = [
  'Cuello / trapecio',
  'Hombro izquierdo',
  'Hombro derecho',
  'Espalda alta',
  'Espalda baja',
  'Cadera izquierda',
  'Cadera derecha',
  'Glúteo izquierdo',
  'Glúteo derecho',
  'Isquiotibial izquierdo',
  'Isquiotibial derecho',
  'Cuádriceps izquierdo',
  'Cuádriceps derecho',
  'Rodilla izquierda',
  'Rodilla derecha',
  'Pantorrilla izquierda',
  'Pantorrilla derecha',
  'Tobillo / pie izquierdo',
  'Tobillo / pie derecho',
];

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pilotScores(energy: number, hunger: number, legs: number, soreness: number): Scores {
  return {
    readiness: clamp(10 * (0.42 * energy + 0.32 * legs + 0.26 * (11 - soreness))),
    recovery: clamp(10 * (0.35 * energy + 0.4 * legs + 0.25 * (11 - soreness))),
    fuel: clamp(10 * (0.48 * energy + 0.52 * (11 - hunger))),
    load: clamp(10 * (0.55 * soreness + 0.45 * (11 - legs))),
  };
}

function chileDate(value: Date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(value);
}

function chileTime(value: Date) {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'short',
    day: 'numeric',
  }).format(new Date(value)).replace('.', '');
}

function goalLabel(goal: GoalContext | null) {
  if (!goal?.primary_goal) return 'Objetivo por definir';
  return [goal.primary_goal, goal.goal_target].filter(Boolean).join(' · ');
}

function formatPlan(session: WeekSession | PlannedSession | null) {
  if (!session) return 'Sesión por definir';
  const parts = [session.title];
  if (session.distance_target_km != null) parts.push(`${session.distance_target_km} km`);
  if (session.duration_target_minutes != null) parts.push(`${session.duration_target_minutes} min`);
  return parts.join(' · ');
}

function dateAgeDays(date: string | null | undefined) {
  if (!date) return Number.POSITIVE_INFINITY;
  const parsed = new Date(`${date}T12:00:00`);
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000));
}

function sameChileDay(a: string, b: string) {
  return chileDate(new Date(a)) === chileDate(new Date(b));
}

function isPlanCompleted(plan: WeekSession, training: SyncedTraining[]) {
  if (plan.status === 'completed' || plan.status === 'done') return true;
  return training.some((session) => {
    if (!sameChileDay(plan.scheduled_at, session.started_at)) return false;
    if (!plan.sport || !session.sport) return true;
    return plan.sport.toLowerCase() === session.sport.toLowerCase();
  });
}

function weekBounds() {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function recentTraining(session: SyncedTraining | null, hours: number) {
  if (!session) return false;
  const end = new Date(session.started_at).getTime() + (session.moving_seconds ?? session.duration_seconds ?? 0) * 1000;
  return Date.now() - end >= 0 && Date.now() - end <= hours * 3600000;
}

function weatherPenalty(point: WeatherPoint) {
  const heat = point.temp > 22 ? (point.temp - 22) * 4 : point.temp < 4 ? (4 - point.temp) * 2 : 0;
  const wet = point.precip * 0.65;
  const wind = point.wind > 18 ? (point.wind - 18) * 1.6 : 0;
  const humidity = point.humidity > 85 && point.temp > 18 ? (point.humidity - 85) * 0.7 : 0;
  return heat + wet + wind + humidity;
}

async function getWeather(target: PlannedSession | null): Promise<WeatherSummary | null> {
  const fallback = { lat: -33.4489, lon: -70.6693, label: 'Santiago · ubicación estimada' };
  let location = fallback;

  try {
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.geolocation) {
      const permission = await navigator.permissions.query({ name: 'geolocation' } as PermissionDescriptor);
      if (permission.state === 'granted') {
        location = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => resolve({
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              label: 'Ubicación del dispositivo',
            }),
            () => resolve(fallback),
            { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: 2500 },
          );
        });
      }
    }
  } catch {
    location = fallback;
  }

  const params = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,relative_humidity_2m',
    timezone: 'America/Santiago',
    forecast_days: '7',
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) return null;
  const payload = await response.json();

  const times = (payload.hourly?.time ?? []) as string[];
  const points: WeatherPoint[] = times.map((time, index) => ({
    time,
    temp: Number(payload.hourly.temperature_2m?.[index] ?? 0),
    feels: Number(payload.hourly.apparent_temperature?.[index] ?? 0),
    precip: Number(payload.hourly.precipitation_probability?.[index] ?? 0),
    wind: Number(payload.hourly.wind_speed_10m?.[index] ?? 0),
    humidity: Number(payload.hourly.relative_humidity_2m?.[index] ?? 0),
  }));

  if (!points.length) return null;

  const targetDate = target ? new Date(target.scheduled_at) : new Date(Date.now() + 60 * 60 * 1000);
  const candidateWindow = points.filter((point) => {
    const pointDate = new Date(point.time);
    const delta = Math.abs(pointDate.getTime() - targetDate.getTime()) / 3600000;
    return delta <= (target ? 3 : 6);
  });
  const candidates = candidateWindow.length ? candidateWindow : points.slice(0, 12);
  const best = [...candidates].sort((a, b) => weatherPenalty(a) - weatherPenalty(b))[0];

  return {
    recommendedStart: target ? chileTime(new Date(best.time)) : null,
    temperature: `${Math.round(best.temp)}°C · sensación ${Math.round(best.feels)}°`,
    precipitation: `${Math.round(best.precip)}% lluvia`,
    wind: `${Math.round(best.wind)} km/h viento`,
    humidity: `${Math.round(best.humidity)}% humedad`,
    locationLabel: location.label,
  };
}

export default function PeppePage() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [goal, setGoal] = useState<GoalContext | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [scores, setScores] = useState<Scores>(emptyScores);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [nutrition, setNutrition] = useState<NutritionEntry[]>([]);
  const [latestTraining, setLatestTraining] = useState<SyncedTraining | null>(null);
  const [weekTraining, setWeekTraining] = useState<SyncedTraining[]>([]);
  const [weekPlan, setWeekPlan] = useState<WeekSession[]>([]);
  const [nextPlanned, setNextPlanned] = useState<PlannedSession | null>(null);
  const [dailyMetric, setDailyMetric] = useState<DailyMetric | null>(null);
  const [glucose, setGlucose] = useState<GlucoseReading | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationAccount[]>([]);
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);

  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showBodyForm, setShowBodyForm] = useState(false);
  const [bodySaving, setBodySaving] = useState(false);
  const [weightDraft, setWeightDraft] = useState('');
  const [fatDraft, setFatDraft] = useState('');

  const [energy, setEnergy] = useState(7);
  const [hunger, setHunger] = useState(5);
  const [legs, setLegs] = useState(7);
  const [soreness, setSoreness] = useState(2);
  const [pain, setPain] = useState(false);
  const [muscleZone, setMuscleZone] = useState('');
  const [painTiming, setPainTiming] = useState('corriendo');
  const [questionIndex, setQuestionIndex] = useState(0);

  const load = useCallback(async (currentUser: User) => {
    setBooting(true);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { start, end } = weekBounds();

    const [
      goalResult,
      prefsResult,
      scoreResult,
      checkinResult,
      nutritionResult,
      trainingResult,
      planResult,
      metricResult,
      glucoseResult,
      integrationsResult,
    ] = await Promise.all([
      supabase.from('athlete_profiles').select('primary_goal,goal_date,goal_target,primary_sport').eq('user_id', currentUser.id).maybeSingle(),
      supabase.from('user_preferences').select('timezone,wake_time,breakfast_time,lunch_time,dinner_time,sleep_time,meal_prompt_lead_minutes').eq('athlete_id', currentUser.id).maybeSingle(),
      supabase.from('scores').select('readiness,fuel,recovery,load').eq('athlete_id', currentUser.id).order('score_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('subjective_checkins').select('energy,hunger,legs,stress,soreness,pain,notes,checked_at').eq('athlete_id', currentUser.id).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('nutrition_entries').select('id,eaten_at,description,photo_path,carbs_g,protein_g').eq('athlete_id', currentUser.id).gte('eaten_at', since24h).order('eaten_at', { ascending: false }).limit(20),
      supabase.from('training_sessions').select('id,title,sport,provider,started_at,duration_seconds,moving_seconds,distance_m,avg_hr,avg_power,training_load,tss').eq('athlete_id', currentUser.id).gte('started_at', since14d).order('started_at', { ascending: false }).limit(50),
      supabase.from('planned_sessions').select('id,scheduled_at,title,sport,distance_target_km,duration_target_minutes,intensity,notes,source,status').eq('athlete_id', currentUser.id).gte('scheduled_at', start.toISOString()).lt('scheduled_at', end.toISOString()).order('scheduled_at', { ascending: true }),
      supabase.from('daily_metrics').select('metric_date,sleep_minutes,hrv_ms,resting_hr_bpm,weight_kg,body_fat_pct,stress_score,body_battery,source').eq('athlete_id', currentUser.id).order('metric_date', { ascending: false }).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('glucose_readings').select('measured_at,glucose_mg_dl,trend,source').eq('athlete_id', currentUser.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('integration_accounts').select('provider,status,last_synced_at').eq('user_id', currentUser.id),
    ]);

    const loadedCheckin = checkinResult.data as Checkin | null;
    const loadedTraining = ((trainingResult.data as SyncedTraining[] | null) ?? []);
    const loadedPlan = ((planResult.data as WeekSession[] | null) ?? []);
    const loadedMetric = (metricResult.data as DailyMetric | null) ?? null;

    setGoal((goalResult.data as GoalContext | null) ?? null);
    setPrefs((prefsResult.data as Preferences | null) ?? null);
    setScores((scoreResult.data as Scores | null) ?? emptyScores);
    setCheckin(loadedCheckin);
    setNutrition((nutritionResult.data as NutritionEntry[] | null) ?? []);
    setWeekTraining(loadedTraining);
    setLatestTraining(loadedTraining[0] ?? null);
    setWeekPlan(loadedPlan);
    setDailyMetric(loadedMetric);
    setGlucose((glucoseResult.data as GlucoseReading | null) ?? null);
    setIntegrations((integrationsResult.data as IntegrationAccount[] | null) ?? []);

    const next = loadedPlan.find((session) => (
      new Date(session.scheduled_at).getTime() >= Date.now() - 4 * 3600000 &&
      !isPlanCompleted(session, loadedTraining)
    )) ?? null;
    setNextPlanned(next);

    if (loadedMetric) {
      setWeightDraft(loadedMetric.weight_kg != null ? String(loadedMetric.weight_kg) : '');
      setFatDraft(loadedMetric.body_fat_pct != null ? String(loadedMetric.body_fat_pct) : '');
    }

    if (loadedCheckin) {
      if (loadedCheckin.energy != null) setEnergy(loadedCheckin.energy);
      if (loadedCheckin.hunger != null) setHunger(loadedCheckin.hunger);
      if (loadedCheckin.legs != null) setLegs(loadedCheckin.legs);
      if (loadedCheckin.soreness != null) setSoreness(loadedCheckin.soreness);
      setPain(Boolean(loadedCheckin.pain));
    }

    setQuestionIndex(0);
    setBooting(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const current = data.user ?? null;
      setUser(current);
      if (current) load(current);
      else setBooting(false);
    });
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setWeatherBusy(true);
    getWeather(nextPlanned)
      .then((summary) => {
        if (!cancelled) setWeather(summary);
      })
      .catch(() => {
        if (!cancelled) setWeather(null);
      })
      .finally(() => {
        if (!cancelled) setWeatherBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nextPlanned]);

  const decision = useMemo(() => buildPeppeDecision({
    goal,
    prefs,
    scores,
    checkin,
    nutrition,
    latestTraining,
    nextPlanned,
    dailyMetric,
    glucose,
    stravaConnected: integrations.some((item) => item.status === 'connected'),
  }), [goal, prefs, scores, checkin, nutrition, latestTraining, nextPlanned, dailyMetric, glucose, integrations]);

  const essentialQuestions = useMemo(() => {
    const objectiveRecovery = Boolean(
      dailyMetric?.sleep_minutes != null ||
      dailyMetric?.hrv_ms != null ||
      dailyMetric?.resting_hr_bpm != null ||
      dailyMetric?.body_battery != null
    );
    if (pain || checkin?.pain) {
      return decision.questions.filter((question) => question.id === 'soreness' || question.id === 'legs').slice(0, 1);
    }
    if (objectiveRecovery) {
      return decision.questions.filter((question) => question.id === 'legs').slice(0, recentTraining(latestTraining, 6) ? 1 : 0);
    }
    return decision.questions.filter((question) => question.id === 'energy' || question.id === 'legs').slice(0, 1);
  }, [decision.questions, dailyMetric, pain, checkin?.pain, latestTraining]);

  const currentQuestion = essentialQuestions[Math.min(questionIndex, Math.max(0, essentialQuestions.length - 1))];
  const bodyDue = !dailyMetric || dateAgeDays(dailyMetric.metric_date) >= 7;

  const completedCount = useMemo(
    () => weekPlan.filter((session) => isPlanCompleted(session, weekTraining)).length,
    [weekPlan, weekTraining],
  );

  const missedSession = useMemo(() => {
    const now = Date.now();
    return [...weekPlan]
      .reverse()
      .find((session) => (
        new Date(session.scheduled_at).getTime() < now - 3 * 3600000 &&
        !isPlanCompleted(session, weekTraining)
      )) ?? null;
  }, [weekPlan, weekTraining]);

  const recoveryAdvice = useMemo(() => {
    if (!missedSession) return null;
    if (!nextPlanned) {
      return {
        title: 'Hay una sesión pendiente que podemos reubicar con criterio.',
        body: `No la movería automáticamente. Peppe puede sugerir un espacio de recuperación para “${missedSession.title}” sin romper la lógica del coach.`,
      };
    }

    const hours = (new Date(nextPlanned.scheduled_at).getTime() - Date.now()) / 3600000;
    const importantNext = /fondo|long|tempo|interval|series|umbral/i.test(`${nextPlanned.title} ${nextPlanned.intensity ?? ''}`);
    if (hours <= 48 || importantNext) {
      return {
        title: 'No recuperaría esta sesión de forma automática.',
        body: `La sesión “${missedSession.title}” quedó pendiente y tienes “${nextPlanned.title}” cerca. Apilar ambas puede empeorar la recuperación; conviene preservar la sesión clave y validar cualquier cambio con el coach.`,
      };
    }

    return {
      title: 'Existe una ventana posible de recuperación.',
      body: `La sesión “${missedSession.title}” podría reubicarse con menor carga antes de “${nextPlanned.title}”. Peppe la tratará como una propuesta, no como un cambio automático del plan.`,
    };
  }, [missedSession, nextPlanned]);

  const hydrationAdvice = useMemo(() => {
    const hot = weather ? Number.parseInt(weather.temperature, 10) >= 24 : false;
    if (recentTraining(latestTraining, 4)) {
      const durationHours = (latestTraining?.moving_seconds ?? latestTraining?.duration_seconds ?? 0) / 3600;
      const base = hot ? 750 : 500;
      const extra = durationHours > 1.5 ? 250 : 0;
      return {
        status: hot ? 'Necesidad alta' : 'Reposición sugerida',
        text: `Sin contar cada vaso: suma aproximadamente ${base + extra}–${base + extra + 250} ml durante las próximas horas y ajusta según sed, sudor y sodio.`,
      };
    }
    return {
      status: 'Aproximación suficiente',
      text: 'Peppe no te pedirá litros exactos. Mantén hidratación normal durante el día y aumentará la recomendación cuando la carga o el clima lo justifiquen.',
    };
  }, [latestTraining, weather]);

  function valueFor(id: QuestionId) {
    if (id === 'energy') return energy;
    if (id === 'hunger') return hunger;
    if (id === 'legs') return legs;
    return soreness;
  }

  function setValueFor(id: QuestionId, value: number) {
    if (id === 'energy') setEnergy(value);
    else if (id === 'hunger') setHunger(value);
    else if (id === 'legs') setLegs(value);
    else setSoreness(value);
  }

  async function saveAnswers() {
    if (!user) return;
    setSaving(true);
    setMessage('');
    const calculated = pilotScores(energy, hunger, legs, soreness);
    const noteParts = [`Peppe · ${decision.key} · señal humana mínima`];
    if (pain) noteParts.push(`molestia: ${muscleZone || 'sin zona'}`, `aparece: ${painTiming}`);

    const [checkinResult, scoreResult] = await Promise.all([
      supabase.from('subjective_checkins').insert({
        athlete_id: user.id,
        energy,
        hunger,
        legs,
        stress: checkin?.stress ?? null,
        soreness,
        pain,
        notes: noteParts.join(' · '),
      }),
      supabase.from('scores').upsert({
        athlete_id: user.id,
        score_date: chileDate(),
        readiness: calculated.readiness,
        fuel: calculated.fuel,
        recovery: calculated.recovery,
        load: calculated.load,
        algorithm_version: 'context-v0.3',
      }, { onConflict: 'athlete_id,score_date,algorithm_version' }),
    ]);

    const error = checkinResult.error || scoreResult.error;
    if (error) setMessage(error.message);
    else {
      setMessage('Listo. Peppe incorporó la señal y recalculó qué conviene hacer ahora.');
      await load(user);
    }
    setSaving(false);
  }

  async function nextQuestion() {
    if (questionIndex < essentialQuestions.length - 1) {
      setQuestionIndex((index) => index + 1);
      return;
    }
    await saveAnswers();
  }

  async function saveBody(keepCurrent: boolean) {
    if (!user) return;
    setBodySaving(true);
    setMessage('');

    const weight = keepCurrent ? dailyMetric?.weight_kg ?? null : (weightDraft ? Number(weightDraft) : dailyMetric?.weight_kg ?? null);
    const fat = keepCurrent ? dailyMetric?.body_fat_pct ?? null : (fatDraft ? Number(fatDraft) : dailyMetric?.body_fat_pct ?? null);
    const source = keepCurrent ? 'manual_carry_forward' : 'manual';

    const { error } = await supabase.from('daily_metrics').upsert({
      athlete_id: user.id,
      metric_date: chileDate(),
      weight_kg: weight,
      body_fat_pct: fat,
      source,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id,metric_date,source' });

    if (error) setMessage(error.message);
    else {
      setMessage(keepCurrent ? 'Mantendremos estos valores como referencia durante esta semana.' : 'Cuerpo actualizado. No te lo volveremos a pedir hasta la próxima semana.');
      setShowBodyForm(false);
      await load(user);
    }
    setBodySaving(false);
  }

  const readiness = scores.readiness ?? scores.recovery;
  const connectedProviders = integrations.filter((item) => item.status === 'connected');
  const nowAction = essentialQuestions.length
    ? 'Sólo necesito una señal humana antes de cerrar la recomendación.'
    : decision.recommendationTitle;

  if (booting) {
    return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Uniendo plan, cuerpo, aplicaciones y contexto…</p></div></main>;
  }

  if (!user) {
    return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Primero inicia sesión.</p><Link href="/">Volver al inicio</Link></div></main>;
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div>
          <span className="eyebrow">PEPPE · AHORA</span>
          <h1>{goalLabel(goal)}</h1>
          <p>{decision.contextLine}</p>
        </div>
        <Link href="/" className={styles.addButton}>＋ Contarle algo a Peppe</Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.statusRow}>
            <span className={styles.liveDot} />
            <strong>{readiness != null && readiness >= 75 ? 'Preparación buena' : readiness != null && readiness < 55 ? 'Recuperación prioritaria' : 'Contexto en revisión'}</strong>
            {readiness != null && <span>{Math.round(readiness)}/100</span>}
          </div>
          <span className={styles.kicker}>QUÉ HACER AHORA</span>
          <h2>{nowAction}</h2>
          <p>{essentialQuestions.length ? 'Tus aplicaciones ya entregaron la parte objetiva. Responde sólo lo que realmente puede cambiar la decisión.' : decision.recommendationBody}</p>

          {!essentialQuestions.length && (
            <div className={styles.actionList}>
              {decision.recommendationActions.slice(0, 3).map((action) => (
                <div key={action}><span>→</span><p>{action}</p></div>
              ))}
            </div>
          )}
        </div>

        <aside className={styles.weatherCard}>
          <span className={styles.kicker}>CLIMA + PRÓXIMA SESIÓN</span>
          <h3>{nextPlanned ? formatPlan(nextPlanned) : 'Sin sesión próxima cargada'}</h3>
          {weatherBusy && <p>Calculando la mejor ventana…</p>}
          {!weatherBusy && weather && (
            <>
              {weather.recommendedStart && <div className={styles.weatherStart}><span>Hora sugerida</span><strong>{weather.recommendedStart}</strong></div>}
              <div className={styles.weatherGrid}>
                <span>{weather.temperature}</span>
                <span>{weather.precipitation}</span>
                <span>{weather.wind}</span>
                <span>{weather.humidity}</span>
              </div>
              <small>{weather.locationLabel}. Peppe compara condiciones alrededor del horario planificado.</small>
            </>
          )}
          {!weatherBusy && !weather && <p>No pude obtener el pronóstico ahora. El plan sigue disponible sin bloquear la experiencia.</p>}
        </aside>
      </section>

      <section className={styles.horizonHeader}>
        <div><span>AHORA</span><strong>Decisión inmediata</strong></div>
        <div><span>HOY</span><strong>Completar bien el día</strong></div>
        <div><span>SEMANA</span><strong>Proteger las sesiones clave</strong></div>
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <span className={styles.kicker}>SEÑALES HUMANAS · SÓLO SI HACEN FALTA</span>
              <h2>{essentialQuestions.length ? 'Peppe necesita una sola respuesta.' : 'No necesito preguntarte más.'}</h2>
            </div>
            <button type="button" className={styles.contextButton} onClick={() => setShowContext((value) => !value)}>
              {showContext ? 'Ocultar contexto' : 'Ver qué sabe Peppe'}
            </button>
          </div>

          {essentialQuestions.length && currentQuestion ? (
            <div className={styles.questionBox}>
              <div>
                <strong>{currentQuestion.label}</strong>
                <p>{currentQuestion.helper}</p>
              </div>
              <div className={styles.scale} role="group" aria-label={currentQuestion.label}>
                {scaleValues.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={valueFor(currentQuestion.id) === value ? styles.scaleActive : ''}
                    onClick={() => setValueFor(currentQuestion.id, value)}
                  >{value}</button>
                ))}
              </div>
              <div className={styles.scaleLabels}><span>{currentQuestion.lowLabel}</span><span>{currentQuestion.highLabel}</span></div>
              <button type="button" className={styles.primaryButton} onClick={nextQuestion} disabled={saving}>
                {saving ? 'Actualizando…' : 'Incorporar y decidir'}
              </button>
            </div>
          ) : (
            <div className={styles.quietState}>
              <span>✓</span>
              <div>
                <strong>La experiencia correcta también sabe quedarse callada.</strong>
                <p>Peppe volverá a preguntar sólo si falta una señal que pueda cambiar entrenamiento, recuperación o seguridad.</p>
              </div>
            </div>
          )}

          <div className={styles.painPrompt}>
            <div>
              <span className={styles.kicker}>DOLENCIAS</span>
              <strong>¿Hay una molestia que deba priorizar?</strong>
            </div>
            <div className={styles.segmented}>
              <button type="button" className={!pain ? styles.segmentActive : ''} onClick={() => { setPain(false); setMuscleZone(''); }}>No</button>
              <button type="button" className={pain ? styles.segmentActive : ''} onClick={() => setPain(true)}>Sí</button>
            </div>
          </div>

          {pain && (
            <div className={styles.painDetail}>
              <div>
                <span className={styles.kicker}>LOCALIZA LA MOLESTIA</span>
                <h3>Mapa muscular rápido</h3>
                <p>Selecciona sólo la zona principal. Peppe la cruza con carga, sesión y evolución.</p>
              </div>
              <div className={styles.muscleGrid}>
                {muscleZones.map((zone) => (
                  <button
                    type="button"
                    key={zone}
                    className={muscleZone === zone ? styles.muscleActive : ''}
                    onClick={() => setMuscleZone(zone)}
                  >{zone}</button>
                ))}
              </div>
              <div className={styles.painTiming}>
                <span>¿Cuándo aparece?</span>
                {['reposo', 'caminando', 'corriendo', 'después'].map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={painTiming === item ? styles.segmentActive : ''}
                    onClick={() => setPainTiming(item)}
                  >{item}</button>
                ))}
              </div>
              <button type="button" className={styles.primaryButton} onClick={saveAnswers} disabled={saving || !muscleZone}>
                {saving ? 'Guardando…' : 'Priorizar esta molestia'}
              </button>
            </div>
          )}

          {showContext && (
            <div className={styles.contextGrid}>
              {decision.known.map((item) => (
                <div key={`${item.label}-${item.source}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.source}</small>
                </div>
              ))}
            </div>
          )}
        </article>

        <aside className={styles.sideStack}>
          <section className={styles.panel}>
            <span className={styles.kicker}>CUERPO · 1 VEZ POR SEMANA</span>
            <h2>{bodyDue ? 'Toca confirmar tus valores.' : 'Usando tus últimos valores.'}</h2>
            <div className={styles.bodyValues}>
              <div><span>Peso</span><strong>{dailyMetric?.weight_kg != null ? `${dailyMetric.weight_kg} kg` : '—'}</strong></div>
              <div><span>Grasa</span><strong>{dailyMetric?.body_fat_pct != null ? `${dailyMetric.body_fat_pct}%` : '—'}</strong></div>
            </div>
            <p>{bodyDue ? 'Puedes actualizar o mantener los últimos valores. Peppe no te los volverá a pedir durante la semana.' : `Última referencia: ${dailyMetric?.metric_date ?? 'sin fecha'}.`}</p>

            {bodyDue && !showBodyForm && (
              <div className={styles.twoButtons}>
                <button type="button" className={styles.secondaryButton} onClick={() => saveBody(true)} disabled={bodySaving}>Mantener</button>
                <button type="button" className={styles.primaryButton} onClick={() => setShowBodyForm(true)}>Actualizar</button>
              </div>
            )}

            {showBodyForm && (
              <div className={styles.bodyForm}>
                <label>Peso kg<input value={weightDraft} onChange={(event) => setWeightDraft(event.target.value)} inputMode="decimal" /></label>
                <label>% grasa<input value={fatDraft} onChange={(event) => setFatDraft(event.target.value)} inputMode="decimal" /></label>
                <button type="button" className={styles.primaryButton} onClick={() => saveBody(false)} disabled={bodySaving}>{bodySaving ? 'Guardando…' : 'Guardar semana'}</button>
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <span className={styles.kicker}>NUTRICIÓN + AGUA · COMPLEMENTARIO</span>
            <h2>{hydrationAdvice.status}</h2>
            <p>{hydrationAdvice.text}</p>
            <div className={styles.nutritionHint}>
              <strong>{nutrition[0]?.description ?? 'Sin comida reciente registrada'}</strong>
              <span>{nutrition[0] ? 'Peppe la usa como contexto, no como contador de calorías.' : 'Puedes aportar una foto sólo cuando ayude a decidir mejor.'}</span>
            </div>
            <Link href="/" className={styles.textLink}>＋ Foto o contexto de comida</Link>
          </section>

          <section className={styles.panel}>
            <span className={styles.kicker}>APLICACIONES · AUTOMÁTICO</span>
            <h2>{connectedProviders.length ? `${connectedProviders.length} fuentes conectadas` : 'Conecta tus fuentes una sola vez'}</h2>
            <div className={styles.integrationList}>
              {integrations.length ? integrations.map((item) => (
                <div key={item.provider}>
                  <span>{item.provider}</span>
                  <strong>{item.status === 'connected' ? 'Conectado' : item.status}</strong>
                </div>
              )) : <p>Cuando Garmin, Strava, TrainingPeaks, Coros u otra fuente esté conectada, Peppe la toma sin pedir carga manual.</p>}
            </div>
          </section>
        </aside>
      </section>

      <section className={styles.weekSection}>
        <div className={styles.weekTop}>
          <div>
            <span className={styles.kicker}>SEMANA</span>
            <h2>El plan manda; Peppe protege la continuidad.</h2>
            <p>{weekPlan.length ? `${completedCount} de ${weekPlan.length} sesiones cumplidas o detectadas automáticamente.` : 'Todavía no hay sesiones cargadas para esta semana.'}</p>
          </div>
          <Link href="/settings" className={styles.secondaryLink}>Plan y rutina</Link>
        </div>

        {weekPlan.length ? (
          <div className={styles.weekTimeline}>
            {weekPlan.map((session) => {
              const done = isPlanCompleted(session, weekTraining);
              const missed = !done && new Date(session.scheduled_at).getTime() < Date.now() - 3 * 3600000;
              return (
                <div key={session.id} className={`${styles.weekDay} ${done ? styles.weekDone : missed ? styles.weekMissed : ''}`}>
                  <span>{dayLabel(session.scheduled_at)}</span>
                  <strong>{session.title}</strong>
                  <small>{session.distance_target_km != null ? `${session.distance_target_km} km · ` : ''}{session.intensity ?? 'planificado'}</small>
                  <b>{done ? '✓ Cumplido' : missed ? 'Pendiente' : chileTime(new Date(session.scheduled_at))}</b>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyWeek}>Carga el plan una vez por semana; luego Peppe avanzará por día y detectará automáticamente lo realizado.</div>
        )}

        {recoveryAdvice && (
          <div className={styles.recoveryBox}>
            <span>RECUPERACIÓN DE SESIONES</span>
            <strong>{recoveryAdvice.title}</strong>
            <p>{recoveryAdvice.body}</p>
          </div>
        )}
      </section>

      {message && <div className="notice">{message}</div>}

      <footer className={styles.footer}>
        <strong>Peppe V0.8 · Ahora / Hoy / Semana</strong>
        <span>Las recomendaciones acompañan el plan del coach, usan estimaciones y no sustituyen evaluación médica.</span>
      </footer>
    </main>
  );
}
