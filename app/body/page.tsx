'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type BodyMetric = {
  metric_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  body_water_pct: number | null;
  bmi: number | null;
  source: string;
};

function chileDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date());
}

export default function BodyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BodyMetric[]>([]);
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [bodyWater, setBodyWater] = useState('');
  const [bmi, setBmi] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const loadBody = useCallback(async (currentUser: User) => {
    setLoading(true);
    const [{ data: metricData }, { data: athleteData }] = await Promise.all([
      supabase
        .from('daily_metrics')
        .select('metric_date, weight_kg, body_fat_pct, body_water_pct, bmi, source')
        .eq('athlete_id', currentUser.id)
        .or('weight_kg.not.is.null,body_fat_pct.not.is.null,body_water_pct.not.is.null,bmi.not.is.null')
        .order('metric_date', { ascending: false })
        .limit(60),
      supabase
        .from('athlete_profiles')
        .select('height_cm')
        .eq('user_id', currentUser.id)
        .maybeSingle(),
    ]);

    const metrics = (metricData ?? []) as BodyMetric[];
    setRows(metrics);
    const h = athleteData?.height_cm ? Number(athleteData.height_cm) : null;
    setHeightCm(h);

    const today = metrics.find((row) => row.metric_date === chileDate() && row.source === 'manual') ?? metrics.find((row) => row.metric_date === chileDate());
    if (today) {
      setWeight(today.weight_kg != null ? String(today.weight_kg) : '');
      setBodyFat(today.body_fat_pct != null ? String(today.body_fat_pct) : '');
      setBodyWater(today.body_water_pct != null ? String(today.body_water_pct) : '');
      setBmi(today.bmi != null ? String(today.bmi) : '');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const currentUser = data.user ?? null;
      setUser(currentUser);
      if (currentUser) loadBody(currentUser);
      else setLoading(false);
    });
  }, [loadBody]);

  const calculatedBmi = useMemo(() => {
    const w = Number(weight);
    if (!heightCm || !Number.isFinite(w) || w <= 0) return null;
    const meters = heightCm / 100;
    return w / (meters * meters);
  }, [heightCm, weight]);

  async function saveBody(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage('');

    const finalBmi = bmi ? Number(bmi) : calculatedBmi;
    const payload = {
      athlete_id: user.id,
      metric_date: chileDate(),
      weight_kg: weight ? Number(weight) : null,
      body_fat_pct: bodyFat ? Number(bodyFat) : null,
      body_water_pct: bodyWater ? Number(bodyWater) : null,
      bmi: finalBmi ? Number(finalBmi.toFixed(2)) : null,
      source: 'manual',
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('daily_metrics')
      .upsert(payload, { onConflict: 'athlete_id,metric_date,source' });

    if (error) setMessage(error.message);
    else {
      setMessage('Composición corporal guardada. Peppe usará la tendencia, no una medición aislada.');
      await loadBody(user);
    }
    setSaving(false);
  }

  const latest = rows[0] ?? null;
  const prior = rows.find((row, index) => index > 0 && row.metric_date !== latest?.metric_date) ?? null;

  function delta(current: number | null, previous: number | null, suffix: string) {
    if (current == null || previous == null) return 'Sin comparación previa';
    const d = current - previous;
    return `${d > 0 ? '+' : ''}${d.toFixed(1)}${suffix} vs. anterior`;
  }

  if (loading) {
    return <main className="center-screen"><div className="loader-card"><strong>PEPPE BODY</strong><p>Cargando composición corporal…</p></div></main>;
  }

  if (!user) {
    return <main className="center-screen"><div className="loader-card"><strong>PEPPE BODY</strong><p>Primero inicia sesión.</p><Link href="/">Volver a Peppe</Link></div></main>;
  }

  return (
    <main className="shell study-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">PEPPE · COMPOSICIÓN CORPORAL</span>
          <h1>Cuerpo y tendencia.</h1>
          <p className="muted">Peso, grasa, agua e IMC cuando estén disponibles. La lectura útil es la tendencia en el tiempo.</p>
        </div>
        <Link className="ghost link-button" href="/">Inicio</Link>
      </header>

      <section className="study-summary">
        <article className="card study-stat">
          <span className="eyebrow">PESO</span>
          <strong>{latest?.weight_kg != null ? `${Number(latest.weight_kg).toFixed(1)} kg` : '—'}</strong>
          <small>{delta(latest?.weight_kg ?? null, prior?.weight_kg ?? null, ' kg')}</small>
        </article>
        <article className="card study-stat">
          <span className="eyebrow">GRASA CORPORAL</span>
          <strong>{latest?.body_fat_pct != null ? `${Number(latest.body_fat_pct).toFixed(1)}%` : '—'}</strong>
          <small>{delta(latest?.body_fat_pct ?? null, prior?.body_fat_pct ?? null, ' pp')}</small>
        </article>
        <article className="card study-stat">
          <span className="eyebrow">AGUA CORPORAL</span>
          <strong>{latest?.body_water_pct != null ? `${Number(latest.body_water_pct).toFixed(1)}%` : '—'}</strong>
          <small>{delta(latest?.body_water_pct ?? null, prior?.body_water_pct ?? null, ' pp')}</small>
        </article>
        <article className="card study-stat">
          <span className="eyebrow">IMC / BMI</span>
          <strong>{latest?.bmi != null ? Number(latest.bmi).toFixed(1) : '—'}</strong>
          <small>{latest?.bmi != null ? 'Seguimiento descriptivo' : calculatedBmi ? `Calculado hoy: ${calculatedBmi.toFixed(1)}` : 'Necesita peso + altura'}</small>
        </article>
      </section>

      <section className="card body-entry-card">
        <span className="eyebrow">MEDICIÓN DE HOY</span>
        <h2>Registra sólo lo que tengas.</h2>
        <p className="muted">Si tu balanza no entrega grasa o agua, déjalos vacíos. Si tenemos altura y peso, Peppe puede calcular el IMC automáticamente.</p>
        <form className="form-grid" onSubmit={saveBody}>
          <label>Peso (kg)<input min="35" max="250" step="0.1" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="84.2" /></label>
          <label>Grasa corporal (%)<input min="0" max="75" step="0.1" type="number" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} placeholder="17.8" /></label>
          <label>Agua corporal (%)<input min="0" max="100" step="0.1" type="number" value={bodyWater} onChange={(e) => setBodyWater(e.target.value)} placeholder="58.4" /></label>
          <label>IMC / BMI<input min="5" max="100" step="0.1" type="number" value={bmi} onChange={(e) => setBmi(e.target.value)} placeholder={calculatedBmi ? calculatedBmi.toFixed(1) : 'Automático si hay peso + altura'} /></label>
          <div className="full body-auto-note">
            <strong>Altura del perfil:</strong> {heightCm ? `${heightCm.toFixed(0)} cm` : 'sin registrar'} · <strong>IMC calculado:</strong> {calculatedBmi ? calculatedBmi.toFixed(1) : '—'}
          </div>
          <button className="primary wide full" disabled={saving}>{saving ? 'Guardando…' : 'Guardar composición corporal'}</button>
        </form>
      </section>

      {message && <div className="notice">{message}</div>}

      <section className="card study-explainer">
        <span className="eyebrow">CÓMO ENTRA AL ANÁLISIS</span>
        <h2>El objetivo no es perseguir el peso de un solo día.</h2>
        <p>Peppe cruzará la tendencia de peso y composición corporal con carga de entrenamiento, hidratación, sueño, alimentación, glucosa y sensaciones. Cambios rápidos de peso pueden reflejar agua y glucógeno; por eso la grasa corporal y el agua, cuando existan, ayudan a interpretar mejor la serie.</p>
      </section>
    </main>
  );
}
