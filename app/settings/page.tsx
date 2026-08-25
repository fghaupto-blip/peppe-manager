'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type Prefs = {
  timezone: string;
  wake_time: string;
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  sleep_time: string;
  meal_prompt_lead_minutes: number;
  sleep_prompt_lead_minutes: number;
  morning_prompts_enabled: boolean;
  meal_prompts_enabled: boolean;
  sleep_prompts_enabled: boolean;
};

type GoalProfile = {
  primary_goal: string | null;
  goal_date: string | null;
  goal_target: string | null;
  primary_sport: string | null;
};

type PlannedSession = {
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

const initial: Prefs = {
  timezone: 'America/Santiago',
  wake_time: '',
  breakfast_time: '',
  lunch_time: '',
  dinner_time: '',
  sleep_time: '',
  meal_prompt_lead_minutes: 20,
  sleep_prompt_lead_minutes: 30,
  morning_prompts_enabled: true,
  meal_prompts_enabled: true,
  sleep_prompts_enabled: true,
};

function localDateTimeInput(iso?: string | null) {
  const date = iso ? new Date(iso) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [message, setMessage] = useState('');

  const [goal, setGoal] = useState('Mejorar rendimiento');
  const [goalDate, setGoalDate] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [primarySport, setPrimarySport] = useState('running');

  const [nextSession, setNextSession] = useState<PlannedSession | null>(null);
  const [sessionAt, setSessionAt] = useState(localDateTimeInput());
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionSport, setSessionSport] = useState('running');
  const [sessionDistance, setSessionDistance] = useState('');
  const [sessionDuration, setSessionDuration] = useState('');
  const [sessionIntensity, setSessionIntensity] = useState('suave');
  const [sessionNotes, setSessionNotes] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const current = data.user ?? null;
      setUser(current);
      if (!current) return setLoading(false);

      const now = new Date().toISOString();
      const [prefsResult, goalResult, sessionResult] = await Promise.all([
        supabase.from('user_preferences').select('*').eq('athlete_id', current.id).maybeSingle(),
        supabase.from('athlete_profiles').select('primary_goal,goal_date,goal_target,primary_sport').eq('user_id', current.id).maybeSingle(),
        supabase.from('planned_sessions').select('id,scheduled_at,title,sport,distance_target_km,duration_target_minutes,intensity,notes,source').eq('athlete_id', current.id).gte('scheduled_at', now).eq('status', 'planned').order('scheduled_at', { ascending: true }).limit(1).maybeSingle(),
      ]);

      const existing = prefsResult.data;
      if (existing) {
        setPrefs({
          timezone: existing.timezone ?? 'America/Santiago',
          wake_time: existing.wake_time?.slice(0, 5) ?? '',
          breakfast_time: existing.breakfast_time?.slice(0, 5) ?? '',
          lunch_time: existing.lunch_time?.slice(0, 5) ?? '',
          dinner_time: existing.dinner_time?.slice(0, 5) ?? '',
          sleep_time: existing.sleep_time?.slice(0, 5) ?? '',
          meal_prompt_lead_minutes: existing.meal_prompt_lead_minutes ?? 20,
          sleep_prompt_lead_minutes: existing.sleep_prompt_lead_minutes ?? 30,
          morning_prompts_enabled: existing.morning_prompts_enabled ?? true,
          meal_prompts_enabled: existing.meal_prompts_enabled ?? true,
          sleep_prompts_enabled: existing.sleep_prompts_enabled ?? true,
        });
      }

      const goalData = goalResult.data as GoalProfile | null;
      if (goalData) {
        setGoal(goalData.primary_goal ?? 'Mejorar rendimiento');
        setGoalDate(goalData.goal_date ?? '');
        setGoalTarget(goalData.goal_target ?? '');
        setPrimarySport(goalData.primary_sport ?? 'running');
        setSessionSport(goalData.primary_sport ?? 'running');
      }

      const planned = sessionResult.data as PlannedSession | null;
      if (planned) {
        setNextSession(planned);
        setSessionAt(localDateTimeInput(planned.scheduled_at));
        setSessionTitle(planned.title);
        setSessionSport(planned.sport ?? goalData?.primary_sport ?? 'running');
        setSessionDistance(planned.distance_target_km != null ? String(planned.distance_target_km) : '');
        setSessionDuration(planned.duration_target_minutes != null ? String(planned.duration_target_minutes) : '');
        setSessionIntensity(planned.intensity ?? 'suave');
        setSessionNotes(planned.notes ?? '');
      }

      setLoading(false);
    });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage('');

    const [prefsResult, goalResult] = await Promise.all([
      supabase.from('user_preferences').upsert({
        athlete_id: user.id,
        timezone: prefs.timezone,
        wake_time: prefs.wake_time || null,
        breakfast_time: prefs.breakfast_time || null,
        lunch_time: prefs.lunch_time || null,
        dinner_time: prefs.dinner_time || null,
        sleep_time: prefs.sleep_time || null,
        meal_prompt_lead_minutes: prefs.meal_prompt_lead_minutes,
        sleep_prompt_lead_minutes: prefs.sleep_prompt_lead_minutes,
        morning_prompts_enabled: prefs.morning_prompts_enabled,
        meal_prompts_enabled: prefs.meal_prompts_enabled,
        sleep_prompts_enabled: prefs.sleep_prompts_enabled,
        updated_at: new Date().toISOString(),
      }),
      supabase.from('athlete_profiles').update({
        primary_goal: goal.trim() || 'Mejorar rendimiento',
        goal_date: goalDate || null,
        goal_target: goalTarget.trim() || null,
        primary_sport: primarySport,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id),
    ]);

    const error = prefsResult.error || goalResult.error;
    setMessage(error ? error.message : 'Objetivo y rutina guardados. Peppe los usará como contexto antes de preguntar.');
    setSaving(false);
  }

  async function saveNextSession(event: FormEvent) {
    event.preventDefault();
    if (!user || !sessionTitle.trim() || !sessionAt) return;
    setSavingPlan(true);
    setMessage('');

    const payload = {
      athlete_id: user.id,
      scheduled_at: new Date(sessionAt).toISOString(),
      title: sessionTitle.trim(),
      sport: sessionSport,
      distance_target_km: sessionDistance ? Number(sessionDistance) : null,
      duration_target_minutes: sessionDuration ? Number(sessionDuration) : null,
      intensity: sessionIntensity || null,
      notes: sessionNotes.trim() || null,
      source: nextSession?.source && nextSession.source !== 'manual' ? nextSession.source : 'manual',
      status: 'planned',
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const result = nextSession
      ? await supabase.from('planned_sessions').update(payload).eq('id', nextSession.id).select('id,scheduled_at,title,sport,distance_target_km,duration_target_minutes,intensity,notes,source').single()
      : await supabase.from('planned_sessions').insert(payload).select('id,scheduled_at,title,sport,distance_target_km,duration_target_minutes,intensity,notes,source').single();

    if (result.error) setMessage(result.error.message);
    else {
      setNextSession(result.data as PlannedSession);
      setMessage('Próxima sesión guardada. Peppe ya puede decidir qué preguntar antes y después de ese entrenamiento.');
    }
    setSavingPlan(false);
  }

  if (loading) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Cargando plan…</p></div></main>;
  if (!user) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Primero inicia sesión.</p><Link href="/">Volver</Link></div></main>;

  return (
    <main className="shell narrow">
      <header className="topbar">
        <div>
          <span className="eyebrow">PEPPE · PLAN Y RUTINA</span>
          <h1>Define la meta. Peppe decide cuándo hablar.</h1>
          <p className="muted">Esta pantalla queda en el menú secundario. En el uso diario, Peppe trabaja silenciosamente con este plan y tus fuentes conectadas.</p>
        </div>
      </header>

      <form className="card form-stack" onSubmit={save}>
        <span className="eyebrow">OBJETIVO ACTUAL</span>
        <div className="form-grid">
          <label className="full">Meta principal<input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ej: Maratón de Buenos Aires" /></label>
          <label>Fecha objetivo<input type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} /></label>
          <label>Meta concreta<input value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} placeholder="Ej: sub 3 horas" /></label>
          <label>Deporte<select value={primarySport} onChange={(e) => setPrimarySport(e.target.value)}><option value="running">Running</option><option value="cycling">Ciclismo</option><option value="triathlon">Triatlón</option><option value="strength">Fuerza</option><option value="other">Otro</option></select></label>
          <label>Zona horaria<input value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })} /></label>
        </div>

        <span className="eyebrow">MOMENTOS HABITUALES</span>
        <div className="form-grid">
          <label>Me despierto<input type="time" value={prefs.wake_time} onChange={(e) => setPrefs({ ...prefs, wake_time: e.target.value })} /></label>
          <label>Desayuno<input type="time" value={prefs.breakfast_time} onChange={(e) => setPrefs({ ...prefs, breakfast_time: e.target.value })} /></label>
          <label>Almuerzo<input type="time" value={prefs.lunch_time} onChange={(e) => setPrefs({ ...prefs, lunch_time: e.target.value })} /></label>
          <label>Cena / comida<input type="time" value={prefs.dinner_time} onChange={(e) => setPrefs({ ...prefs, dinner_time: e.target.value })} /></label>
          <label>Me duermo<input type="time" value={prefs.sleep_time} onChange={(e) => setPrefs({ ...prefs, sleep_time: e.target.value })} /></label>
          <label>Avisar antes de comer (min)<input type="number" min="0" max="90" value={prefs.meal_prompt_lead_minutes} onChange={(e) => setPrefs({ ...prefs, meal_prompt_lead_minutes: Number(e.target.value) })} /></label>
        </div>

        <div className="toggle-list">
          <label className="toggle-row"><input type="checkbox" checked={prefs.morning_prompts_enabled} onChange={(e) => setPrefs({ ...prefs, morning_prompts_enabled: e.target.checked })} /><span><strong>Lectura de mañana</strong><small>Sólo si falta información que cambie el plan del día.</small></span></label>
          <label className="toggle-row"><input type="checkbox" checked={prefs.meal_prompts_enabled} onChange={(e) => setPrefs({ ...prefs, meal_prompts_enabled: e.target.checked })} /><span><strong>Momentos de alimentación</strong><small>Se activa según hambre, carga y próxima sesión.</small></span></label>
          <label className="toggle-row"><input type="checkbox" checked={prefs.sleep_prompts_enabled} onChange={(e) => setPrefs({ ...prefs, sleep_prompts_enabled: e.target.checked })} /><span><strong>Cierre del día</strong><small>Sólo cuando haga falta preparar mejor mañana.</small></span></label>
        </div>

        <button className="primary wide" disabled={saving}>{saving ? 'Guardando…' : 'Guardar objetivo y rutina'}</button>
      </form>

      <form className="card form-stack" onSubmit={saveNextSession}>
        <span className="eyebrow">PRÓXIMO ENTRENAMIENTO</span>
        <h2>{nextSession ? 'Peppe ya tiene una próxima sesión.' : 'Hasta conectar el plan del coach, agrégala aquí.'}</h2>
        <p className="muted">Cuando TrainingPeaks, Garmin u otra fuente entregue el plan, este bloque podrá completarse solo.</p>
        <div className="form-grid">
          <label className="full">Sesión<input required value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} placeholder="Ej: 4 × 2000 m con 1 min de descanso" /></label>
          <label>Fecha y hora<input required type="datetime-local" value={sessionAt} onChange={(e) => setSessionAt(e.target.value)} /></label>
          <label>Deporte<select value={sessionSport} onChange={(e) => setSessionSport(e.target.value)}><option value="running">Running</option><option value="cycling">Ciclismo</option><option value="triathlon">Triatlón</option><option value="strength">Fuerza</option><option value="other">Otro</option></select></label>
          <label>Distancia objetivo (km)<input type="number" min="0" step="0.1" value={sessionDistance} onChange={(e) => setSessionDistance(e.target.value)} /></label>
          <label>Duración objetivo (min)<input type="number" min="0" step="1" value={sessionDuration} onChange={(e) => setSessionDuration(e.target.value)} /></label>
          <label>Intensidad<select value={sessionIntensity} onChange={(e) => setSessionIntensity(e.target.value)}><option value="regenerativo">Regenerativo</option><option value="suave">Suave / aeróbico</option><option value="moderado">Moderado</option><option value="calidad">Calidad / intervalos</option><option value="largo">Fondo largo</option><option value="competencia">Competencia</option></select></label>
          <label className="full">Indicaciones del coach<textarea rows={3} value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} placeholder="Ritmo, zonas, nutrición o cualquier indicación especial" /></label>
        </div>
        <button className="primary wide" disabled={savingPlan}>{savingPlan ? 'Guardando sesión…' : nextSession ? 'Actualizar próxima sesión' : 'Guardar próxima sesión'}</button>
      </form>

      {message && <div className="notice">{message}</div>}

      <section className="card study-explainer">
        <span className="eyebrow">LÓGICA PEPPE</span>
        <h2>Objetivo → plan → momento → decisión → datos faltantes.</h2>
        <p>Strava ya aporta lo realizado. El plan aporta lo que viene. Los sensores aportarán sueño, HRV, frecuencia cardíaca, peso y glucosa. Peppe pregunta únicamente lo que todavía falta para decidir bien.</p>
      </section>
    </main>
  );
}
