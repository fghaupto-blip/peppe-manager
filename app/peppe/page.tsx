'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type Scores = { readiness: number | null; fuel: number | null; recovery: number | null; load: number | null };
type Checkin = { energy: number | null; hunger: number | null; legs: number | null; stress: number | null; soreness: number | null; pain: boolean | null; notes?: string | null; checked_at: string };
type NutritionEntry = { id: number; eaten_at: string; description: string; photo_path: string | null };
type Question = { id: string; label: string; helper: string; type: 'range' | 'yesno'; value: number | boolean; setValue: (v: number | boolean) => void };

const emptyScores: Scores = { readiness: null, fuel: null, recovery: null, load: null };

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

export default function PeppePage() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [scores, setScores] = useState<Scores>(emptyScores);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [nutrition, setNutrition] = useState<NutritionEntry[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const [energy, setEnergy] = useState(7);
  const [hunger, setHunger] = useState(5);
  const [legs, setLegs] = useState(7);
  const [soreness, setSoreness] = useState(2);
  const [pain, setPain] = useState(false);

  const load = useCallback(async (currentUser: User) => {
    setBooting(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: scoreData }, { data: checkinData }, { data: nutritionData }] = await Promise.all([
      supabase.from('scores').select('readiness, fuel, recovery, load').eq('athlete_id', currentUser.id).order('score_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('subjective_checkins').select('energy, hunger, legs, stress, soreness, pain, notes, checked_at').eq('athlete_id', currentUser.id).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('nutrition_entries').select('id, eaten_at, description, photo_path').eq('athlete_id', currentUser.id).gte('eaten_at', since).order('eaten_at', { ascending: false }).limit(20),
    ]);
    const c = checkinData as Checkin | null;
    setScores((scoreData as Scores | null) ?? emptyScores);
    setCheckin(c);
    setNutrition((nutritionData as NutritionEntry[] | null) ?? []);
    if (c) {
      if (c.energy) setEnergy(c.energy);
      if (c.hunger) setHunger(c.hunger);
      if (c.legs) setLegs(c.legs);
      if (c.soreness) setSoreness(c.soreness);
      setPain(Boolean(c.pain));
    }
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

  const known = useMemo(() => [
    { label: 'Readiness', value: scores.readiness == null ? 'Pendiente de fuente' : `${scores.readiness}/100`, source: scores.readiness == null ? 'Manual / futura API' : 'Peppe' },
    { label: 'Fuel estimado', value: `${fuel}/100`, source: scores.fuel == null ? 'Estimación piloto' : 'Peppe' },
    { label: 'Recovery', value: scores.recovery == null ? 'Pendiente de fuente' : `${scores.recovery}/100`, source: scores.recovery == null ? 'Manual / futura API' : 'Peppe' },
    { label: 'Comidas 24 h', value: String(nutrition.length), source: 'Peppe' },
  ], [scores, fuel, nutrition.length]);

  const questions = useMemo<Question[]>(() => {
    const q: Question[] = [];
    if (!checkin || Date.now() - new Date(checkin.checked_at).getTime() > 4 * 60 * 60 * 1000) {
      q.push(
        { id: 'energy', label: '¿Cómo está tu energía?', helper: 'Peppe no puede saber esto por un sensor.', type: 'range', value: energy, setValue: (v) => setEnergy(v as number) },
        { id: 'legs', label: '¿Cómo están tus piernas?', helper: '10 = frescas, 1 = muy pesadas.', type: 'range', value: legs, setValue: (v) => setLegs(v as number) },
        { id: 'soreness', label: '¿Qué nivel de molestia muscular tienes?', helper: '0–10. Si hay dolor real, márcalo abajo.', type: 'range', value: soreness, setValue: (v) => setSoreness(v as number) },
      );
    }
    if (fuel < 65) q.push({ id: 'hunger', label: '¿Cuánta hambre tienes ahora?', helper: 'Esto ayuda a ajustar la siguiente comida.', type: 'range', value: hunger, setValue: (v) => setHunger(v as number) });
    return q.slice(0, 3);
  }, [checkin, energy, legs, soreness, hunger, fuel]);

  const recommendation = useMemo(() => {
    if (pain) return { title: 'Primero resolvamos la molestia.', body: 'No voy a sugerir más carga hasta entender dónde duele, cuándo aparece y si cambia tu forma de moverte.', tone: 'bad' };
    if ((scores.recovery ?? 100) < 60) return { title: 'Hoy gana la recuperación.', body: 'Prioriza comida suficiente, hidratación, descanso y una nueva lectura de piernas antes de sumar carga.', tone: 'warn' };
    if (fuel < 60) return { title: 'La próxima decisión es combustible.', body: 'Tu estimación de Fuel está baja. Peppe debe revisar qué comiste, cuánto entrenaste y qué sesión viene después.', tone: 'warn' };
    return { title: 'Contexto favorable para seguir el plan.', body: 'No necesito preguntarte más de lo necesario. La próxima pregunta aparecerá cuando cambie el contexto: comida, entrenamiento o recuperación.', tone: 'good' };
  }, [pain, scores.recovery, fuel]);

  async function saveAnswers() {
    if (!user) return;
    setSaving(true); setMessage('');
    const { error } = await supabase.from('subjective_checkins').insert({
      athlete_id: user.id,
      energy,
      hunger,
      legs,
      stress: checkin?.stress ?? 4,
      soreness,
      pain,
      notes: 'Question Engine Peppe',
    });
    if (error) setMessage(error.message);
    else { setMessage('Listo. Peppe incorporó tus respuestas y recalculó el contexto.'); await load(user); }
    setSaving(false);
  }

  if (booting) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Ordenando lo que ya sabemos…</p></div></main>;
  if (!user) return <main className="shell narrow"><section className="card"><span className="eyebrow">PEPPE</span><h1>Inicia sesión primero.</h1><p>Vuelve a Inicio para entrar a tu cuenta.</p></section></main>;

  const sources = [
    ['TrainingPeaks', 'Plan del entrenador', 'Pendiente API'],
    ['Garmin', 'Sueño · HRV · FC · actividad', 'Pendiente API'],
    ['Strava', 'Actividad realizada', 'Pendiente OAuth'],
    ['COROS', 'Actividad · recuperación', 'Pendiente API'],
    ['Libre', 'Glucosa', 'Manual / CSV'],
    ['Peppe', 'Comidas · sensaciones · molestias', 'Activo'],
  ];

  return (
    <main className="shell question-engine-shell">
      <header className="topbar">
        <div><span className="eyebrow">PEPPE · QUESTION ENGINE</span><h1>Preguntar menos. Entender más.</h1><p className="muted">Datos conocidos → datos faltantes → 1–3 preguntas → decisión → próximo momento.</p></div>
      </header>

      <section className="qe-hero card">
        <div>
          <span className="eyebrow">LO QUE PEPPE YA SABE</span>
          <h2>Tu contexto está parcialmente armado.</h2>
          <p>No repetimos preguntas que ya tienen respuesta. Cuando conectemos las APIs, este bloque crecerá automáticamente.</p>
        </div>
        <div className="qe-known-grid">{known.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.source}</small></div>)}</div>
      </section>

      <section className="qe-status-grid">
        <article className={`card qe-status ${readinessState.tone}`}><span>READINESS</span><strong>{scores.readiness ?? '—'}</strong><small>{readinessState.label}</small></article>
        <article className={`card qe-status ${fuel >= 75 ? 'good' : fuel >= 55 ? 'warn' : 'bad'}`}><span>FUEL · GLUCÓGENO EST.</span><strong>{fuel}</strong><small>Estimación, no medición directa</small></article>
        <article className={`card qe-status ${recoveryState.tone}`}><span>RECOVERY</span><strong>{scores.recovery ?? '—'}</strong><small>{recoveryState.label}</small></article>
        <article className={`card qe-status ${loadState.tone}`}><span>LOAD</span><strong>{scores.load ?? '—'}</strong><small>{loadState.label}</small></article>
      </section>

      <section className="grid qe-main-grid">
        <article className="card qe-questions">
          <span className="eyebrow">ME FALTA ESTO</span>
          <h2>{questions.length ? `${questions.length} pregunta${questions.length > 1 ? 's' : ''} para completar el momento.` : 'No necesito preguntarte nada ahora.'}</h2>
          {questions.map((q) => <label className="range-row" key={q.id}><span className="range-heading"><span>{q.label}</span><strong>{q.value as number}/10</strong></span><small className="qe-helper">{q.helper}</small><input type="range" min="1" max="10" value={q.value as number} onChange={(e) => q.setValue(Number(e.target.value))} /></label>)}
          <label className="pain-row"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Tengo dolor que quiero que Peppe priorice</label>
          {questions.length > 0 && <button className="primary" onClick={saveAnswers} disabled={saving}>{saving ? 'Guardando…' : 'Responder y continuar'}</button>}
          {message && <div className="notice">{message}</div>}
        </article>

        <article className={`card qe-recommendation ${recommendation.tone}`}>
          <span className="eyebrow">PEPPE RECOMIENDA</span><h2>{recommendation.title}</h2><p>{recommendation.body}</p>
          <div className="qe-next"><span>PRÓXIMO PASO</span><strong>{fuel < 65 ? 'Revisar alimentación / combustible' : 'Esperar el siguiente momento relevante'}</strong></div>
        </article>
      </section>

      <section className="card qe-sources">
        <div className="section-heading"><div><span className="eyebrow">FUENTES DE DATOS</span><h2>Una sola capa para todas las aplicaciones.</h2></div><p>Mientras llegan las APIs, Peppe funciona con información manual, fotos y capturas. Después cada fuente sustituye preguntas.</p></div>
        <div className="qe-source-grid">{sources.map(([name, data, status]) => <div key={name}><strong>{name}</strong><span>{data}</span><small>{status}</small></div>)}</div>
      </section>

      <section className="card qe-principle"><span className="eyebrow">REGLA DE PRODUCTO</span><h2>Peppe nunca pregunta algo que puede obtener automáticamente.</h2><p>Los sensores entregan datos. Peppe pregunta por sensaciones, hambre, dolor, contexto y decisiones humanas. Ésa es la experiencia diferencial.</p></section>
      <footer>V0.5 · Question Engine + Fuel Estimate piloto. Fuel es una estimación de disponibilidad energética y no una medición directa de glucógeno muscular.</footer>
    </main>
  );
}
