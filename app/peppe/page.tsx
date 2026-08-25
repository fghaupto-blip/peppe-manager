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

type IntegrationAccount = { status: string; last_synced_at: string | null };

const emptyScores: Scores = { readiness: null, fuel: null, recovery: null, load: null };
const scaleValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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

function chileDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date());
}

function goalLabel(goal: GoalContext | null) {
  if (!goal?.primary_goal) return 'Objetivo por definir';
  return [goal.primary_goal, goal.goal_target].filter(Boolean).join(' · ');
}

export default function PeppePage() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [goal, setGoal] = useState<GoalContext | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [scores, setScores] = useState<Scores>(emptyScores);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [nutrition, setNutrition] = useState<NutritionEntry[]>([]);
  const [latestTraining, setLatestTraining] = useState<TrainingSession | null>(null);
  const [nextPlanned, setNextPlanned] = useState<PlannedSession | null>(null);
  const [dailyMetric, setDailyMetric] = useState<DailyMetric | null>(null);
  const [glucose, setGlucose] = useState<GlucoseReading | null>(null);
  const [strava, setStrava] = useState<IntegrationAccount | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showContext, setShowContext] = useState(false);

  const [energy, setEnergy] = useState(7);
  const [hunger, setHunger] = useState(5);
  const [legs, setLegs] = useState(7);
  const [soreness, setSoreness] = useState(2);
  const [pain, setPain] = useState(false);

  const load = useCallback(async (currentUser: User) => {
    setBooting(true);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const planFloor = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const today = chileDate();

    const [goalResult, prefsResult, scoreResult, checkinResult, nutritionResult, trainingResult, planResult, metricResult, glucoseResult, stravaResult] = await Promise.all([
      supabase.from('athlete_profiles').select('primary_goal,goal_date,goal_target,primary_sport').eq('user_id', currentUser.id).maybeSingle(),
      supabase.from('user_preferences').select('timezone,wake_time,breakfast_time,lunch_time,dinner_time,sleep_time,meal_prompt_lead_minutes').eq('athlete_id', currentUser.id).maybeSingle(),
      supabase.from('scores').select('readiness,fuel,recovery,load').eq('athlete_id', currentUser.id).order('score_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('subjective_checkins').select('energy,hunger,legs,stress,soreness,pain,notes,checked_at').eq('athlete_id', currentUser.id).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('nutrition_entries').select('id,eaten_at,description,photo_path,carbs_g,protein_g').eq('athlete_id', currentUser.id).gte('eaten_at', since24h).order('eaten_at', { ascending: false }).limit(20),
      supabase.from('training_sessions').select('id,title,sport,started_at,duration_seconds,moving_seconds,distance_m,avg_hr,avg_power,training_load,tss').eq('athlete_id', currentUser.id).eq('provider', 'strava').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('planned_sessions').select('id,scheduled_at,title,sport,distance_target_km,duration_target_minutes,intensity,notes,source').eq('athlete_id', currentUser.id).eq('status', 'planned').gte('scheduled_at', planFloor).order('scheduled_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('daily_metrics').select('metric_date,sleep_minutes,hrv_ms,resting_hr_bpm,weight_kg,body_fat_pct,stress_score,body_battery,source').eq('athlete_id', currentUser.id).eq('metric_date', today).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('glucose_readings').select('measured_at,glucose_mg_dl,trend,source').eq('athlete_id', currentUser.id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('integration_accounts').select('status,last_synced_at').eq('user_id', currentUser.id).eq('provider', 'strava').maybeSingle(),
    ]);

    const loadedCheckin = checkinResult.data as Checkin | null;
    setGoal((goalResult.data as GoalContext | null) ?? null);
    setPrefs((prefsResult.data as Preferences | null) ?? null);
    setScores((scoreResult.data as Scores | null) ?? emptyScores);
    setCheckin(loadedCheckin);
    setNutrition((nutritionResult.data as NutritionEntry[] | null) ?? []);
    setLatestTraining((trainingResult.data as TrainingSession | null) ?? null);
    setNextPlanned((planResult.data as PlannedSession | null) ?? null);
    setDailyMetric((metricResult.data as DailyMetric | null) ?? null);
    setGlucose((glucoseResult.data as GlucoseReading | null) ?? null);
    setStrava((stravaResult.data as IntegrationAccount | null) ?? null);

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
    stravaConnected: strava?.status === 'connected',
  }), [goal, prefs, scores, checkin, nutrition, latestTraining, nextPlanned, dailyMetric, glucose, strava?.status]);

  const currentQuestion = decision.questions[Math.min(questionIndex, Math.max(0, decision.questions.length - 1))];

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

    const [checkinResult, scoreResult] = await Promise.all([
      supabase.from('subjective_checkins').insert({
        athlete_id: user.id,
        energy,
        hunger,
        legs,
        stress: checkin?.stress ?? null,
        soreness,
        pain,
        notes: `Peppe · ${decision.key} · datos faltantes completados`,
      }),
      supabase.from('scores').upsert({
        athlete_id: user.id,
        score_date: chileDate(),
        readiness: calculated.readiness,
        fuel: calculated.fuel,
        recovery: calculated.recovery,
        load: calculated.load,
        algorithm_version: 'context-v0.2',
      }, { onConflict: 'athlete_id,score_date,algorithm_version' }),
    ]);

    const error = checkinResult.error || scoreResult.error;
    if (error) setMessage(error.message);
    else {
      setMessage('Listo. Peppe actualizó la decisión con tus respuestas.');
      await load(user);
    }
    setSaving(false);
  }

  async function nextQuestion() {
    if (questionIndex < decision.questions.length - 1) {
      setQuestionIndex((index) => index + 1);
      return;
    }
    await saveAnswers();
  }

  if (booting) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Revisando objetivo, plan y aplicaciones…</p></div></main>;
  if (!user) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Primero inicia sesión.</p><Link href="/">Volver al inicio</Link></div></main>;

  return (
    <main className="shell question-engine-shell conversational-engine">
      <header className="qe-topbar conversation-topbar">
        <div>
          <span className="eyebrow">PEPPE · AHORA</span>
          <h1>{goalLabel(goal)}</h1>
          <p className="muted">{decision.contextLine}</p>
        </div>
      </header>

      <section className={`card conversation-decision ${decision.tone}`}>
        <div className="conversation-copy">
          <span className="moment-badge">{decision.momentLabel}</span>
          <h2>{decision.momentTitle}</h2>
          <p>{decision.momentDescription}</p>
        </div>
        <div className="decision-why">
          <span>PEPPE ESTÁ DECIDIENDO</span>
          <strong>{decision.decisionTitle}</strong>
          <p>{decision.decisionReason}</p>
        </div>
      </section>

      <section className="context-summary-bar">
        <div>
          <span className="context-live-dot" />
          <p><strong>Peppe ya buscó contexto.</strong> {decision.questions.length ? `Sólo faltan ${decision.questions.length} señal${decision.questions.length > 1 ? 'es' : ''} humana${decision.questions.length > 1 ? 's' : ''}.` : 'No falta nada importante para este momento.'}</p>
        </div>
        <button className="context-toggle" type="button" onClick={() => setShowContext((value) => !value)}>{showContext ? 'Ocultar' : 'Ver qué sabe'}</button>
      </section>

      {showContext && (
        <section className="card context-drawer">
          <div className="section-heading">
            <div><span className="eyebrow">CONTEXTO AUTOMÁTICO</span><h2>Esto no te lo volveremos a preguntar.</h2></div>
            <small>Objetivo + plan + aplicaciones + historial</small>
          </div>
          <div className="qe-known-grid compact">
            {decision.known.map((item) => <div key={`${item.label}-${item.source}`}><span>{item.label}</span><strong>{item.value}</strong><small>{item.source}</small></div>)}
          </div>
        </section>
      )}

      <section className="conversation-grid">
        <article className="card qe-question-window conversation-question">
          {currentQuestion ? (
            <>
              <div className="qe-window-head">
                <div>
                  <span className="eyebrow">SÓLO ME FALTA ESTO</span>
                  <h2>{currentQuestion.label}</h2>
                </div>
                <strong>{questionIndex + 1}/{decision.questions.length}</strong>
              </div>

              <div className="qe-progress"><span style={{ width: `${((questionIndex + 1) / decision.questions.length) * 100}%` }} /></div>
              <p className="qe-question-helper">{currentQuestion.helper}</p>

              <div className="qe-scale-grid" role="group" aria-label={currentQuestion.label}>
                {scaleValues.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={valueFor(currentQuestion.id) === value ? 'active' : ''}
                    onClick={() => setValueFor(currentQuestion.id, value)}
                  >{value}</button>
                ))}
              </div>
              <div className="qe-scale-labels"><span>{currentQuestion.lowLabel}</span><span>{currentQuestion.highLabel}</span></div>

              <div className="qe-why">
                <span>¿POR QUÉ TE LO PREGUNTO?</span>
                <p>{currentQuestion.why}</p>
              </div>

              <label className="pain-row qe-pain-row"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Hay dolor o una molestia que quiero que Peppe priorice</label>

              <div className="qe-window-actions">
                {questionIndex > 0 ? <button type="button" className="ghost" onClick={() => setQuestionIndex((index) => Math.max(0, index - 1))}>Atrás</button> : <span />}
                <button type="button" className="primary" onClick={nextQuestion} disabled={saving}>{saving ? 'Actualizando…' : questionIndex === decision.questions.length - 1 ? 'Listo, decide por mí' : 'Continuar'}</button>
              </div>
            </>
          ) : (
            <div className="qe-complete-state quiet-state">
              <span className="eyebrow">PEPPE NO NECESITA PREGUNTAR</span>
              <div className="qe-complete-mark">✓</div>
              <h2>Ya tengo lo necesario.</h2>
              <p>La experiencia correcta también sabe quedarse callada. Peppe volverá cuando cambie el entrenamiento, la comida, la recuperación o una señal relevante.</p>
              <Link className="ghost link-button" href="/">Quiero aportar algo igual</Link>
            </div>
          )}
          {message && <div className="notice">{message}</div>}
        </article>

        <article className={`card qe-recommendation conversation-recommendation ${decision.tone}`}>
          <span className="eyebrow">INDICACIÓN AHORA</span>
          <h2>{decision.recommendationTitle}</h2>
          <p>{decision.recommendationBody}</p>
          <div className="recommendation-actions">
            {decision.recommendationActions.map((action) => <div key={action}><span>→</span><p>{action}</p></div>)}
          </div>
          <div className="qe-next"><span>PRÓXIMO MOMENTO</span><strong>{decision.nextMoment}</strong></div>
        </article>
      </section>

      <section className="card engine-path">
        <span className="eyebrow">CÓMO PENSÓ PEPPE</span>
        <div className="engine-steps">
          <span>Objetivo</span><b>→</b><span>Plan</span><b>→</b><span>Momento</span><b>→</b><span>Decisión</span><b>→</b><span>Datos disponibles</span><b>→</b><span>Preguntar sólo lo faltante</span>
        </div>
        {!nextPlanned && <p className="engine-hint">Para mejorar aún más esta conversación, agrega la próxima sesión una vez desde <Link href="/settings">Plan y rutina</Link>. Luego Peppe la usará automáticamente.</p>}
      </section>

      <footer>V0.7 · Goal-aware Peppe Decision Engine. Las recomendaciones acompañan el plan del coach y usan estimaciones; no sustituyen evaluación médica.</footer>
    </main>
  );
}
