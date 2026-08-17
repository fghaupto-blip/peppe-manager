'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type PromptRow = {
  id: string;
  prompt_type: 'morning' | 'pre_breakfast' | 'post_training' | 'pre_lunch' | 'pre_dinner' | 'pre_sleep' | 'manual';
  due_at: string;
  question_set: string[];
  status: string;
};

const titles: Record<string, string> = {
  morning: 'Buenos días. Completemos tu estado de hoy.',
  pre_breakfast: 'Antes del desayuno, ¿cómo llegas?',
  pre_lunch: 'Antes del almuerzo, revisemos energía y recuperación.',
  pre_dinner: 'Antes de la cena, cerremos cómo va tu día.',
  pre_sleep: 'Antes de dormir, preparemos mañana.',
  post_training: 'Entrenamiento terminado. ¿Cómo quedaste?',
  manual: 'Cuéntame cómo estás ahora.',
};

export default function MomentPage() {
  const [user, setUser] = useState<User | null>(null);
  const [prompt, setPrompt] = useState<PromptRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [energy, setEnergy] = useState(7);
  const [hunger, setHunger] = useState(5);
  const [legs, setLegs] = useState(7);
  const [stress, setStress] = useState(4);
  const [pain, setPain] = useState(false);
  const [weight, setWeight] = useState('');
  const [glucose, setGlucose] = useState('');
  const [meal, setMeal] = useState('');
  const [hydration, setHydration] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const current = data.user ?? null;
      setUser(current);
      if (!current) return setLoading(false);

      const now = new Date().toISOString();
      const { data: due } = await supabase
        .from('daily_prompts')
        .select('id,prompt_type,due_at,question_set,status')
        .eq('athlete_id', current.id)
        .in('status', ['pending', 'open'])
        .lte('due_at', now)
        .order('due_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (due) {
        setPrompt(due as PromptRow);
        if (due.status === 'pending') {
          await supabase.from('daily_prompts').update({ status: 'open', opened_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', due.id);
        }
      }
      setLoading(false);
    });
  }, []);

  const questions = useMemo(() => new Set(prompt?.question_set ?? []), [prompt]);
  const showWeight = questions.has('peso_y_composicion');
  const showEnergy = questions.has('energia') || questions.has('fatiga') || questions.has('recuperacion_post_entreno');
  const showHunger = questions.has('hambre');
  const showLegs = questions.has('piernas') || questions.has('fatiga') || questions.has('recuperacion_post_entreno');
  const showPain = questions.has('dolor');
  const showGlucose = questions.has('glucosa_si_disponible');
  const showMeal = questions.has('comida_prevista') || questions.has('ultima_comida');
  const showHydration = questions.has('hidratacion');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || !prompt) return;
    setSaving(true);
    setMessage('');

    const answers = {
      energy: showEnergy ? energy : null,
      hunger: showHunger ? hunger : null,
      legs: showLegs ? legs : null,
      stress: showEnergy ? stress : null,
      pain: showPain ? pain : null,
      weight_kg: showWeight && weight ? Number(weight) : null,
      glucose_mg_dl: showGlucose && glucose ? Number(glucose) : null,
      meal: showMeal ? meal.trim() || null : null,
      hydration: showHydration ? hydration.trim() || null : null,
      notes: notes.trim() || null,
    };

    const errors: string[] = [];
    const { error: responseError } = await supabase.from('prompt_responses').upsert({ prompt_id: prompt.id, athlete_id: user.id, answers }, { onConflict: 'prompt_id' });
    if (responseError) errors.push(responseError.message);

    if (showEnergy || showHunger || showLegs || showPain) {
      const { error } = await supabase.from('subjective_checkins').insert({
        athlete_id: user.id,
        energy: showEnergy ? energy : null,
        hunger: showHunger ? hunger : null,
        legs: showLegs ? legs : null,
        stress: showEnergy ? stress : null,
        pain: showPain ? pain : null,
        notes: notes.trim() || null,
      });
      if (error) errors.push(error.message);
    }

    if (showWeight && weight) {
      const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date());
      const { error } = await supabase.from('daily_metrics').upsert({
        athlete_id: user.id,
        metric_date: localDate,
        weight_kg: Number(weight),
        source: 'prompt',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'athlete_id,metric_date,source' });
      if (error) errors.push(error.message);
    }

    if (showGlucose && glucose) {
      const { error } = await supabase.from('glucose_readings').insert({
        athlete_id: user.id,
        measured_at: new Date().toISOString(),
        glucose_mg_dl: Number(glucose),
        trend: 'unknown',
        source: 'prompt_manual',
        notes: prompt.prompt_type,
      });
      if (error) errors.push(error.message);
    }

    const { error: promptError } = await supabase.from('daily_prompts').update({
      status: 'answered',
      answered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', prompt.id);
    if (promptError) errors.push(promptError.message);

    if (errors.length) setMessage(errors[0]);
    else {
      setMessage('Listo. Peppe incorporó esta lectura al estado del día.');
      setPrompt(null);
    }
    setSaving(false);
  }

  if (loading) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Buscando tu próximo momento…</p></div></main>;
  if (!user) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Primero inicia sesión.</p><Link href="/">Volver</Link></div></main>;
  if (!prompt) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>No tienes preguntas pendientes ahora.</p><Link href="/">Volver al inicio</Link></div></main>;

  return (
    <main className="shell narrow">
      <header className="topbar">
        <div>
          <span className="eyebrow">PEPPE · MOMENTO DEL DÍA</span>
          <h1>{titles[prompt.prompt_type] ?? titles.manual}</h1>
          <p className="muted">Sólo te pregunto lo que falta. Los datos ya sincronizados desde sensores no deberían repetirse.</p>
        </div>
        <Link className="ghost link-button" href="/">Inicio</Link>
      </header>

      <form className="card checkin" onSubmit={submit}>
        {showEnergy && <Range label="Energía" value={energy} setValue={setEnergy} left="Vacío" right="Excelente" />}
        {showHunger && <Range label="Hambre" value={hunger} setValue={setHunger} left="Nada" right="Mucha" />}
        {showLegs && <Range label="Piernas / recuperación" value={legs} setValue={setLegs} left="Muy pesadas" right="Frescas" />}
        {showEnergy && <Range label="Estrés" value={stress} setValue={setStress} left="Bajo" right="Muy alto" />}

        {showPain && <label className="pain-row"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Tengo una molestia o dolor que Peppe debe considerar.</label>}
        {showWeight && <label className="notes-label">Peso de hoy, si todavía no llegó de tu balanza<input type="number" min="35" max="250" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="83.8 kg" /></label>}
        {showGlucose && <label className="notes-label">Glucosa actual, sólo si no está sincronizada<input type="number" min="30" max="500" value={glucose} onChange={(e) => setGlucose(e.target.value)} placeholder="96 mg/dL" /></label>}
        {showMeal && <label className="notes-label">{prompt.prompt_type === 'pre_sleep' ? '¿Qué fue lo último que comiste?' : '¿Qué estás por comer?'}<textarea value={meal} onChange={(e) => setMeal(e.target.value)} placeholder="Ej: pollo, ensalada, papa y agua" /></label>}
        {showHydration && <label className="notes-label">Hidratación del día<textarea value={hydration} onChange={(e) => setHydration(e.target.value)} placeholder="Ej: 2 L agua + electrolitos" /></label>}
        <label className="notes-label">¿Hay algo más que deba saber?<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></label>

        <button className="primary wide" disabled={saving}>{saving ? 'Actualizando tu estado…' : 'Enviar a Peppe'}</button>
      </form>

      {message && <div className="notice">{message}</div>}
    </main>
  );
}

function Range({ label, value, setValue, left, right }: { label: string; value: number; setValue: (value: number) => void; left: string; right: string }) {
  return <div className="range-row">
    <div className="range-heading"><span>{label}</span><strong>{value}/10</strong></div>
    <input type="range" min="1" max="10" value={value} onChange={(e) => setValue(Number(e.target.value))} />
    <div className="range-scale"><span>{left}</span><span>{right}</span></div>
  </div>;
}
