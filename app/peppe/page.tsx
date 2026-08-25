'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type Scores = { readiness: number | null; fuel: number | null; recovery: number | null; load: number | null };
type Checkin = { energy: number | null; hunger: number | null; legs: number | null; stress: number | null; soreness: number | null; pain: boolean | null; notes?: string | null; checked_at: string };
type NutritionEntry = { id: number; eaten_at: string; description: string; photo_path: string | null };
type TrainingSession = {
  id: string;
  title: string | null;
  sport: string | null;
  started_at: string;
  duration_seconds: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  avg_power: number | null;
};
type IntegrationAccount = { status: string; last_synced_at: string | null };
type Question = {
  id: 'energy' | 'hunger' | 'legs' | 'soreness';
  label: string;
  helper: string;
  why: string;
  lowLabel: string;
  highLabel: string;
  value: number;
  setValue: (v: number) => void;
};

const emptyScores: Scores = { readiness: null, fuel: null, recovery: null, load: null };
const scaleValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function scoreState(value: number | null, reverse = false) {
  if (value == null) return { label: 'Sin dato', tone: 'neutral' };
  const adjusted = reverse ? 100 - value : value;
  if (adjusted >= 75) return { label: 'Favorable', tone: 'good' };
  if (adjusted >= 55) return { label: 'Atención', tone: 'warn' };
  return { label: 'Prioridad', tone: 'bad' };
}

function fuelEstimate(scores: Scores, nutrition: NutritionEntry[], checkin: Checkin | null) {
  if (scores.fuel != null) return scores.fuel;
  let estimate = 58;
  estimate += Math.min(18, nutrition.length * 4);
  if (checkin?.energy != null) estimate += (checkin.energy - 5) * 3;
  if (checkin?.hunger != null) estimate -= Math.max(0, checkin.hunger - 5) * 4;
  return Math.max(15, Math.min(95, Math.round(estimate)));
}

function formatDistance(meters: number | null) {
  if (!meters) return '—';
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatPace(distanceM: number | null, movingSeconds: number | null) {
  if (!distanceM || !movingSeconds) return '—';
  const secPerKm = movingSeconds / (distanceM / 1000);
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}/km`;
}

export default function PeppePage() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [scores, setScores] = useState<Scores>(emptyScores);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [nutrition, setNutrition] = useState<NutritionEntry[]>([]);
  const [latestTraining, setLatestTraining] = useState<TrainingSession | null>(null);
  const [strava, setStrava] = useState<IntegrationAccount | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);

  const [energy, setEnergy] = useState(7);
  const [hunger, setHunger] = useState(5);
  const [legs, setLegs] = useState(7);
  const [soreness, setSoreness] = useState(2);
  const [pain, setPain] = useState(false);

  const load = useCallback(async (currentUser: User) => {
    setBooting(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: scoreData }, { data: checkinData }, { data: nutritionData }, { data: trainingData }, { data: stravaData }] = await Promise.all([
      supabase.from('scores').select('readiness, fuel, recovery, load').eq('athlete_id', currentUser.id).order('score_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('subjective_checkins').select('energy, hunger, legs, stress, soreness, pain, notes, checked_at').eq('athlete_id', currentUser.id).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('nutrition_entries').select('id, eaten_at, description, photo_path').eq('athlete_id', currentUser.id).gte('eaten_at', since).order('eaten_at', { ascending: false }).limit(20),
      supabase.from('training_sessions').select('id,title,sport,started_at,duration_seconds,distance_m,avg_hr,avg_power,moving_seconds').eq('athlete_id', currentUser.id).eq('provider', 'strava').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('integration_accounts').select('status,last_synced_at').eq('user_id', currentUser.id).eq('provider', 'strava').maybeSingle(),
    ]);

    const c = checkinData as Checkin | null;
    setScores((scoreData as Scores | null) ?? emptyScores);
    setCheckin(c);
    setNutrition((nutritionData as NutritionEntry[] | null) ?? []);
    setLatestTraining((trainingData as TrainingSession | null) ?? null);
    setStrava((stravaData as IntegrationAccount | null) ?? null);
    if (c) {
      if (c.energy) setEnergy(c.energy);
      if (c.hunger) setHunger(c.hunger);
      if (c.legs) setLegs(c.legs);
      if (c.soreness) setSoreness(c.soreness);
      setPain(Boolean(c.pain));
    }
    setQuestionIndex(0);
    setBooting(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      if (data.user) load(data.user); else setBooting(false);
    });
  }, [load]);

  const fuel = useMemo(() => fuelEstimate(scores, nutrition, checkin), [scores, nutrition, checkin]);
  const recoveryState = scoreState(scores.recovery);
  const readinessState = scoreState(scores.readiness);
  const loadState = scoreState(scores.load, true);

  const trainingContext = useMemo(() => {
    if (!latestTraining) return { isRecent: false, endedAt: null as Date | null, movingSeconds: null as number | null };
    const row = latestTraining as TrainingSession & { moving_seconds?: number | null };
    const duration = row.duration_seconds ?? row.moving_seconds ?? 0;
    const endedAt = new Date(new Date(row.started_at).getTime() + duration * 1000);
    const age = Date.now() - endedAt.getTime();
    return { isRecent: age >= -30 * 60 * 1000 && age <= 4 * 60 * 60 * 1000, endedAt, movingSeconds: row.moving_seconds ?? row.duration_seconds };
  }, [latestTraining]);

  const moment = useMemo(() => {
    if (trainingContext.isRecent) return { key: 'post', label: 'POST ENTRENAMIENTO', title: 'Recuperación inmediata', description: 'Strava ya entregó la sesión. Peppe sólo necesita saber cómo respondió tu cuerpo.' };
    const hour = new Date().getHours();
    if (hour < 10) return { key: 'morning', label: 'INICIO DEL DÍA', title: 'Lectura rápida de estado', description: 'Completamos sólo las variables subjetivas que todavía no vienen de sensores.' };
    if (hour < 14) return { key: 'midday', label: 'ANTES DE ALMORZAR', title: 'Combustible y recuperación', description: 'Revisamos si la mañana cambió tu necesidad de comida o descanso.' };
    if (hour < 19) return { key: 'afternoon', label: 'TARDE', title: 'Cómo vas acumulando el día', description: 'Peppe pregunta únicamente si la información anterior ya quedó desactualizada.' };
    return { key: 'evening', label: 'CIERRE DEL DÍA', title: 'Preparar la recuperación', description: 'Cerramos molestias, hambre y piernas para ajustar el próximo bloque.' };
  }, [trainingContext.isRecent]);

  const checkinIsFresh = useMemo(() => {
    if (!checkin) return false;
    const checked = new Date(checkin.checked_at).getTime();
    if (trainingContext.isRecent && trainingContext.endedAt) return checked > trainingContext.endedAt.getTime();
    return Date.now() - checked < 4 * 60 * 60 * 1000;
  }, [checkin, trainingContext]);

  const questions = useMemo<Question[]>(() => {
    const q: Question[] = [];

    if (trainingContext.isRecent && !checkinIsFresh) {
      q.push(
        { id: 'legs', label: '¿Cómo quedaron tus piernas?', helper: 'Evalúa la sensación global después de la sesión.', why: 'Strava sabe cuánto corriste, pero no puede saber cómo se sienten tus piernas.', lowLabel: 'Muy pesadas', highLabel: 'Muy frescas', value: legs, setValue: setLegs },
        { id: 'soreness', label: '¿Qué nivel de molestia muscular tienes?', helper: 'Diferencia fatiga normal de una molestia que conviene vigilar.', why: 'Esto cambia la recomendación de recuperación y la prioridad muscular.', lowLabel: 'Nada', highLabel: 'Muy alta', value: soreness, setValue: setSoreness },
        { id: 'hunger', label: '¿Cuánta hambre tienes ahora?', helper: 'Nos ayuda a decidir cuánto combustible recuperar en la próxima comida.', why: 'La sesión está registrada, pero la necesidad de comer sigue siendo subjetiva.', lowLabel: 'Nada', highLabel: 'Muchísima', value: hunger, setValue: setHunger },
      );
    } else if (!checkinIsFresh) {
      q.push(
        { id: 'energy', label: '¿Cómo está tu energía ahora?', helper: 'Piensa en energía física y mental, no sólo sueño.', why: 'Es una señal subjetiva que todavía no podemos obtener automáticamente.', lowLabel: 'Muy baja', highLabel: 'Excelente', value: energy, setValue: setEnergy },
        { id: 'legs', label: '¿Cómo están tus piernas?', helper: 'Úsalo como lectura rápida de carga muscular.', why: 'La sensación de piernas completa lo que muestran carga, ritmo y frecuencia cardíaca.', lowLabel: 'Muy pesadas', highLabel: 'Muy frescas', value: legs, setValue: setLegs },
      );
      if (fuel < 70) q.push({ id: 'hunger', label: '¿Cuánta hambre tienes ahora?', helper: 'Sólo aparece porque Fuel necesita más contexto.', why: 'Con Fuel bajo, hambre y próxima comida pueden cambiar la recomendación.', lowLabel: 'Nada', highLabel: 'Muchísima', value: hunger, setValue: setHunger });
    }

    return q.slice(0, 3);
  }, [trainingContext.isRecent, checkinIsFresh, legs, soreness, hunger, energy, fuel]);

  const currentQuestion = questions[Math.min(questionIndex, Math.max(0, questions.length - 1))];

  const known = useMemo(() => {
    const facts: { label: string; value: string; source: string }[] = [];
    if (latestTraining) {
      const movingSeconds = trainingContext.movingSeconds;
      facts.push(
        { label: 'Última sesión', value: `${formatDistance(latestTraining.distance_m)} · ${formatDuration(movingSeconds)}`, source: 'Strava' },
        { label: 'Ritmo', value: formatPace(latestTraining.distance_m, movingSeconds), source: 'Strava' },
        { label: 'FC media', value: latestTraining.avg_hr ? `${Math.round(latestTraining.avg_hr)} bpm` : '—', source: 'Strava' },
        { label: 'Potencia', value: latestTraining.avg_power ? `${Math.round(latestTraining.avg_power)} W` : '—', source: 'Strava' },
      );
    } else {
      facts.push({ label: 'Entrenamiento', value: 'Aún sin actividad reciente', source: strava?.status === 'connected' ? 'Strava conectado' : 'Pendiente' });
    }
    facts.push(
      { label: 'Fuel estimado', value: `${fuel}/100`, source: scores.fuel == null ? 'Estimación Peppe' : 'Peppe' },
      { label: 'Comidas 24 h', value: String(nutrition.length), source: 'Peppe' },
    );
    return facts;
  }, [latestTraining, trainingContext.movingSeconds, strava?.status, fuel, scores.fuel, nutrition.length]);

  const recommendation = useMemo(() => {
    if (pain) return { title: 'La molestia pasa a ser prioridad.', body: 'Peppe detiene recomendaciones de carga adicional y necesita seguimiento del dolor antes de avanzar.', tone: 'bad' };
    if (trainingContext.isRecent && questions.length > 0) return { title: 'Primero terminemos la lectura post entrenamiento.', body: 'La sesión ya está importada. Con estas respuestas ajustaremos Fuel, Recovery y la siguiente comida sin volver a preguntarte datos del entrenamiento.', tone: 'warn' };
    if ((scores.recovery ?? 100) < 60) return { title: 'Hoy gana la recuperación.', body: 'Prioriza comida suficiente, hidratación, descanso y una nueva lectura de piernas antes de sumar carga.', tone: 'warn' };
    if (fuel < 60) return { title: 'La próxima decisión es combustible.', body: 'Tu estimación de Fuel está baja. Peppe debe revisar qué comiste y qué sesión viene después.', tone: 'warn' };
    return { title: 'Peppe ya tiene suficiente contexto.', body: 'No preguntamos por preguntar. La próxima ventana aparecerá cuando cambie el momento: comida, entrenamiento, recuperación o una señal relevante.', tone: 'good' };
  }, [pain, trainingContext.isRecent, questions.length, scores.recovery, fuel]);

  async function saveAnswers() {
    if (!user) return;
    setSaving(true);
    setMessage('');
    const { error } = await supabase.from('subjective_checkins').insert({
      athlete_id: user.id,
      energy,
      hunger,
      legs,
      stress: checkin?.stress ?? 4,
      soreness,
      pain,
      notes: `Question Engine Peppe · ${moment.key}`,
    });
    if (error) setMessage(error.message);
    else {
      setMessage('Listo. Peppe incorporó tus respuestas y cerró esta ventana.');
      await load(user);
    }
    setSaving(false);
  }

  function nextQuestion() {
    if (!currentQuestion) return;
    if (questionIndex < questions.length - 1) setQuestionIndex((index) => index + 1);
    else saveAnswers();
  }

  if (booting) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Ordenando lo que ya sabemos…</p></div></main>;
  if (!user) return <main className="shell narrow"><section className="card"><span className="eyebrow">PEPPE</span><h1>Inicia sesión primero.</h1><p>Vuelve a Inicio para entrar a tu cuenta.</p></section></main>;

  const sources = [
    ['TrainingPeaks', 'Plan del entrenador', 'Pendiente API'],
    ['Garmin', 'Sueño · HRV · FC · actividad', 'Pendiente API'],
    ['Strava', 'Actividad realizada', strava?.status === 'connected' ? 'Conectado ✓' : 'Pendiente conexión'],
    ['COROS', 'Actividad · recuperación', 'Pendiente API'],
    ['Libre', 'Glucosa', 'Manual / CSV'],
    ['Peppe', 'Comidas · sensaciones · molestias', 'Activo'],
  ];

  return (
    <main className="shell question-engine-shell">
      <header className="topbar qe-topbar">
        <div>
          <span className="eyebrow">PEPPE · QUESTION ENGINE</span>
          <h1>Una pregunta cuando hace falta.</h1>
          <p className="muted">Peppe arma contexto con tus fuentes, detecta lo que falta y abre una ventana breve sólo en el momento correcto.</p>
        </div>
      </header>

      <section className="card qe-moment-banner">
        <div>
          <span className="eyebrow">{moment.label}</span>
          <h2>{moment.title}</h2>
          <p>{moment.description}</p>
        </div>
        <div className="qe-context-badge">
          <span>CONTEXTO</span>
          <strong>{questions.length === 0 ? 'Completo' : `${questions.length} dato${questions.length > 1 ? 's' : ''} faltante${questions.length > 1 ? 's' : ''}`}</strong>
        </div>
      </section>

      <section className="card qe-known-compact">
        <div className="section-heading">
          <div><span className="eyebrow">PEPPE YA SABE</span><h2>No volveremos a preguntarte esto.</h2></div>
          <small>{strava?.status === 'connected' ? 'Strava sincronizado automáticamente' : 'Completa fuentes para reducir preguntas'}</small>
        </div>
        <div className="qe-known-grid compact">{known.map((item) => <div key={`${item.label}-${item.source}`}><span>{item.label}</span><strong>{item.value}</strong><small>{item.source}</small></div>)}</div>
      </section>

      <section className="qe-status-grid">
        <article className={`card qe-status ${readinessState.tone}`}><span>READINESS</span><strong>{scores.readiness ?? '—'}</strong><small>{readinessState.label}</small></article>
        <article className={`card qe-status ${fuel >= 75 ? 'good' : fuel >= 55 ? 'warn' : 'bad'}`}><span>FUEL · GLUCÓGENO EST.</span><strong>{fuel}</strong><small>Estimación, no medición directa</small></article>
        <article className={`card qe-status ${recoveryState.tone}`}><span>RECOVERY</span><strong>{scores.recovery ?? '—'}</strong><small>{recoveryState.label}</small></article>
        <article className={`card qe-status ${loadState.tone}`}><span>LOAD</span><strong>{scores.load ?? '—'}</strong><small>{loadState.label}</small></article>
      </section>

      <section className="grid qe-main-grid adaptive">
        <article className="card qe-question-window">
          {currentQuestion ? (
            <>
              <div className="qe-window-head">
                <div>
                  <span className="eyebrow">ME FALTA ESTO</span>
                  <h2>{currentQuestion.label}</h2>
                </div>
                <strong>{questionIndex + 1}/{questions.length}</strong>
              </div>

              <div className="qe-progress"><span style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></div>
              <p className="qe-question-helper">{currentQuestion.helper}</p>

              <div className="qe-scale-grid" role="group" aria-label={currentQuestion.label}>
                {scaleValues.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={currentQuestion.value === value ? 'active' : ''}
                    onClick={() => currentQuestion.setValue(value)}
                  >{value}</button>
                ))}
              </div>
              <div className="qe-scale-labels"><span>{currentQuestion.lowLabel}</span><span>{currentQuestion.highLabel}</span></div>

              <div className="qe-why">
                <span>¿POR QUÉ TE LO PREGUNTO?</span>
                <p>{currentQuestion.why}</p>
              </div>

              <label className="pain-row qe-pain-row"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Tengo dolor que quiero que Peppe priorice</label>

              <div className="qe-window-actions">
                {questionIndex > 0 ? <button className="ghost" onClick={() => setQuestionIndex((index) => Math.max(0, index - 1))}>Atrás</button> : <span />}
                <button className="primary" onClick={nextQuestion} disabled={saving}>{saving ? 'Guardando…' : questionIndex === questions.length - 1 ? 'Guardar y ver indicación' : 'Continuar'}</button>
              </div>
            </>
          ) : (
            <div className="qe-complete-state">
              <span className="eyebrow">SIN PREGUNTAS AHORA</span>
              <div className="qe-complete-mark">✓</div>
              <h2>Peppe ya tiene lo necesario para este momento.</h2>
              <p>La siguiente ventana aparecerá sólo si cambia tu entrenamiento, alimentación, recuperación o alguna señal relevante.</p>
            </div>
          )}
          {message && <div className="notice">{message}</div>}
        </article>

        <article className={`card qe-recommendation ${recommendation.tone}`}>
          <span className="eyebrow">PEPPE RECOMIENDA</span>
          <h2>{recommendation.title}</h2>
          <p>{recommendation.body}</p>
          <div className="qe-next"><span>PRÓXIMO MOMENTO</span><strong>{trainingContext.isRecent ? 'Recuperación + próxima comida' : fuel < 65 ? 'Alimentación / combustible' : 'Esperar un cambio de contexto'}</strong></div>
        </article>
      </section>

      <section className="card qe-sources">
        <div className="section-heading"><div><span className="eyebrow">FUENTES DE DATOS</span><h2>Cada fuente elimina preguntas.</h2></div><p>Sensor disponible = dato automático. Sin sensor = pregunta corta sólo cuando esa respuesta modifica una decisión.</p></div>
        <div className="qe-source-grid">{sources.map(([name, data, status]) => <div key={name}><strong>{name}</strong><span>{data}</span><small>{status}</small></div>)}</div>
      </section>

      <section className="card qe-principle"><span className="eyebrow">REGLA DE PRODUCTO</span><h2>Pregunta → respuesta → decisión. Nunca formulario por formulario.</h2><p>Cada ventana debe tener una razón clara, máximo tres preguntas y una consecuencia visible en Fuel, Recovery, Readiness o la recomendación siguiente.</p></section>
      <footer>V0.6 · Adaptive Question Windows + Strava context. Fuel es una estimación de disponibilidad energética y no una medición directa de glucógeno muscular.</footer>
    </main>
  );
}
