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

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const current = data.user ?? null;
      setUser(current);
      if (!current) return setLoading(false);
      const { data: existing } = await supabase.from('user_preferences').select('*').eq('athlete_id', current.id).maybeSingle();
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
      setLoading(false);
    });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage('');
    const { error } = await supabase.from('user_preferences').upsert({
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
    });
    setMessage(error ? error.message : 'Rutina guardada. Peppe generará tus próximos momentos automáticamente.');
    setSaving(false);
  }

  if (loading) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Cargando rutina…</p></div></main>;
  if (!user) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Primero inicia sesión.</p><Link href="/">Volver</Link></div></main>;

  return (
    <main className="shell narrow">
      <header className="topbar">
        <div>
          <span className="eyebrow">PEPPE · RUTINA</span>
          <h1>¿Cuándo quieres que Peppe te hable?</h1>
          <p className="muted">Cada atleta define sus horarios. Peppe pregunta sólo lo que falte para completar el análisis de ese momento.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="ghost link-button" href="/integrations">Integraciones</Link>
          <Link className="ghost link-button" href="/">Inicio</Link>
        </div>
      </header>

      <form className="card form-stack" onSubmit={save}>
        <label>Zona horaria<input value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })} /></label>

        <div className="form-grid">
          <label>Me despierto<input type="time" value={prefs.wake_time} onChange={(e) => setPrefs({ ...prefs, wake_time: e.target.value })} /></label>
          <label>Desayuno<input type="time" value={prefs.breakfast_time} onChange={(e) => setPrefs({ ...prefs, breakfast_time: e.target.value })} /></label>
          <label>Almuerzo<input type="time" value={prefs.lunch_time} onChange={(e) => setPrefs({ ...prefs, lunch_time: e.target.value })} /></label>
          <label>Cena / comida<input type="time" value={prefs.dinner_time} onChange={(e) => setPrefs({ ...prefs, dinner_time: e.target.value })} /></label>
          <label>Me duermo<input type="time" value={prefs.sleep_time} onChange={(e) => setPrefs({ ...prefs, sleep_time: e.target.value })} /></label>
          <label>Preguntar antes de comer (min)<input type="number" min="0" max="90" value={prefs.meal_prompt_lead_minutes} onChange={(e) => setPrefs({ ...prefs, meal_prompt_lead_minutes: Number(e.target.value) })} /></label>
        </div>

        <div className="toggle-list">
          <label className="toggle-row"><input type="checkbox" checked={prefs.morning_prompts_enabled} onChange={(e) => setPrefs({ ...prefs, morning_prompts_enabled: e.target.checked })} /><span><strong>Reporte de mañana</strong><small>Peso/composición, sueño, energía, piernas, hambre y dolor.</small></span></label>
          <label className="toggle-row"><input type="checkbox" checked={prefs.meal_prompts_enabled} onChange={(e) => setPrefs({ ...prefs, meal_prompts_enabled: e.target.checked })} /><span><strong>Antes de comidas</strong><small>Pregunta energía, hambre, recuperación, glucosa disponible y qué vas a comer.</small></span></label>
          <label className="toggle-row"><input type="checkbox" checked={prefs.sleep_prompts_enabled} onChange={(e) => setPrefs({ ...prefs, sleep_prompts_enabled: e.target.checked })} /><span><strong>Antes de dormir</strong><small>Cierra hidratación, fatiga, dolor y preparación del día siguiente.</small></span></label>
        </div>

        <button className="primary wide" disabled={saving}>{saving ? 'Guardando…' : 'Guardar mi rutina'}</button>
      </form>

      {message && <div className="notice">{message}</div>}

      <section className="card study-explainer">
        <span className="eyebrow">AUTOMATIZACIÓN</span>
        <h2>El horario dispara la conversación; los sensores completan lo demás.</h2>
        <p>Si Garmin ya entregó sueño, HRV y entrenamiento, Peppe no te los preguntará. Si la balanza ya entregó peso y grasa, tampoco. El diálogo se concentra en lo que ninguna app conoce bien: cómo te sientes, hambre, dolor, qué comiste o qué estás por comer.</p>
      </section>
    </main>
  );
}
