'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type WeightRow = {
  metric_date: string;
  weight_kg: number | null;
};

type GlucoseTrend = 'fast_down' | 'down' | 'stable' | 'up' | 'fast_up' | 'unknown';

type GlucoseRow = {
  id?: number;
  measured_at: string;
  glucose_mg_dl: number;
  trend: GlucoseTrend;
  source: string;
};

const trendOptions: Array<{ value: GlucoseTrend; label: string }> = [
  { value: 'fast_down', label: '↓↓ Baja rápido' },
  { value: 'down', label: '↓ Bajando' },
  { value: 'stable', label: '→ Estable' },
  { value: 'up', label: '↑ Subiendo' },
  { value: 'fast_up', label: '↑↑ Sube rápido' },
  { value: 'unknown', label: 'Sin tendencia' },
];

function chileDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date());
}

function localDateTimeInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function parseCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
    } else current += char;
  }
  values.push(current.trim());
  return values;
}

function parseLibreDate(raw: string) {
  const cleaned = raw.trim().replace(/^"|"$/g, '');
  const native = new Date(cleaned);
  if (!Number.isNaN(native.getTime())) return native.toISOString();

  const match = cleaned.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  let first = Number(match[1]);
  let second = Number(match[2]);
  let year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const secondValue = Number(match[6] ?? 0);
  if (year < 100) year += 2000;

  // LibreView respeta el formato del dispositivo. En Chile priorizamos día/mes;
  // si el segundo campo es >12, interpretamos mes/día automáticamente.
  let day = first;
  let month = second;
  if (second > 12 && first <= 12) {
    month = first;
    day = second;
  }

  const date = new Date(year, month - 1, day, hour, minute, secondValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function StudyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [glucoseRows, setGlucoseRows] = useState<GlucoseRow[]>([]);
  const [weight, setWeight] = useState('');
  const [glucose, setGlucose] = useState('');
  const [trend, setTrend] = useState<GlucoseTrend>('stable');
  const [measuredAt, setMeasuredAt] = useState(localDateTimeInput());
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [savingGlucose, setSavingGlucose] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadStudy = useCallback(async (currentUser: User) => {
    setLoading(true);
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const [{ data: weightData }, { data: glucoseData }] = await Promise.all([
      supabase
        .from('daily_metrics')
        .select('metric_date, weight_kg')
        .eq('athlete_id', currentUser.id)
        .not('weight_kg', 'is', null)
        .order('metric_date', { ascending: false })
        .limit(30),
      supabase
        .from('glucose_readings')
        .select('id, measured_at, glucose_mg_dl, trend, source')
        .eq('athlete_id', currentUser.id)
        .gte('measured_at', startToday.toISOString())
        .order('measured_at', { ascending: false })
        .limit(1000),
    ]);

    const w = (weightData ?? []) as WeightRow[];
    const g = (glucoseData ?? []) as GlucoseRow[];
    setWeights(w);
    setGlucoseRows(g);
    if (w[0]?.metric_date === chileDate() && w[0].weight_kg) setWeight(String(w[0].weight_kg));
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const currentUser = data.user ?? null;
      setUser(currentUser);
      if (currentUser) loadStudy(currentUser);
      else setLoading(false);
    });
  }, [loadStudy]);

  async function saveWeight(event: FormEvent) {
    event.preventDefault();
    if (!user || !weight) return;
    setSavingWeight(true);
    setMessage('');
    const { error } = await supabase.from('daily_metrics').upsert(
      {
        athlete_id: user.id,
        metric_date: chileDate(),
        weight_kg: Number(weight),
        source: 'manual',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'athlete_id,metric_date,source' },
    );
    if (error) setMessage(error.message);
    else {
      setMessage('Peso de hoy guardado. Se incorporará a la tendencia del estudio.');
      await loadStudy(user);
    }
    setSavingWeight(false);
  }

  async function saveGlucose(event: FormEvent) {
    event.preventDefault();
    if (!user || !glucose) return;
    setSavingGlucose(true);
    setMessage('');
    const date = new Date(measuredAt);
    const { error } = await supabase.from('glucose_readings').insert({
      athlete_id: user.id,
      measured_at: date.toISOString(),
      glucose_mg_dl: Number(glucose),
      trend,
      source: 'freestyle_manual',
      notes: notes.trim() || null,
    });
    if (error) setMessage(error.message);
    else {
      setMessage('Lectura FreeStyle guardada.');
      setGlucose('');
      setNotes('');
      setMeasuredAt(localDateTimeInput());
      await loadStudy(user);
    }
    setSavingGlucose(false);
  }

  async function importLibreView(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    setImporting(true);
    setMessage('');

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const headerIndex = lines.findIndex((line) => /timestamp|fecha/i.test(line) && /glucose|glucosa/i.test(line));
      if (headerIndex < 0) throw new Error('No pude identificar las columnas de LibreView. Si quieres, súbeme un archivo de ejemplo y ajustamos el importador.');

      const candidate = lines[headerIndex];
      const delimiter = (candidate.match(/;/g)?.length ?? 0) > (candidate.match(/,/g)?.length ?? 0) ? ';' : ',';
      const headers = parseCsvLine(candidate, delimiter).map((h) => h.toLowerCase().replace(/^\ufeff/, '').trim());
      const timestampIndex = headers.findIndex((h) => h.includes('device timestamp') || h.includes('timestamp') || h.includes('fecha'));
      const glucoseIndexes = headers
        .map((h, i) => ({ h, i }))
        .filter(({ h }) => (h.includes('glucose') || h.includes('glucosa')) && (h.includes('mg/dl') || !h.includes('mmol')))
        .map(({ i }) => i);

      if (timestampIndex < 0 || glucoseIndexes.length === 0) throw new Error('El archivo no contiene timestamp y glucosa en mg/dL reconocibles.');

      const rows: Array<{ athlete_id: string; measured_at: string; glucose_mg_dl: number; trend: GlucoseTrend; source: string }> = [];
      for (const line of lines.slice(headerIndex + 1)) {
        const cells = parseCsvLine(line, delimiter);
        const measured = parseLibreDate(cells[timestampIndex] ?? '');
        const glucoseValue = glucoseIndexes
          .map((index) => Number(String(cells[index] ?? '').replace(',', '.')))
          .find((value) => Number.isFinite(value) && value > 0);
        if (!measured || !glucoseValue) continue;
        rows.push({
          athlete_id: user.id,
          measured_at: measured,
          glucose_mg_dl: glucoseValue,
          trend: 'unknown',
          source: 'libreview_csv',
        });
      }

      if (!rows.length) throw new Error('No encontré lecturas válidas en el archivo.');

      let imported = 0;
      for (let i = 0; i < rows.length; i += 300) {
        const batch = rows.slice(i, i + 300);
        const { error } = await supabase
          .from('glucose_readings')
          .upsert(batch, { onConflict: 'athlete_id,measured_at,source', ignoreDuplicates: true });
        if (error) throw error;
        imported += batch.length;
      }

      setMessage(`LibreView importado: ${imported} lecturas procesadas.`);
      await loadStudy(user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo importar el archivo.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  }

  const latestWeight = weights[0]?.weight_kg ?? null;
  const priorWeight = weights[1]?.weight_kg ?? null;
  const weightDelta = latestWeight !== null && priorWeight !== null ? latestWeight - priorWeight : null;

  const glucoseStats = useMemo(() => {
    if (!glucoseRows.length) return null;
    const values = glucoseRows.map((row) => Number(row.glucose_mg_dl));
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
    const cv = avg > 0 ? (Math.sqrt(variance) / avg) * 100 : 0;
    return { avg, min, max, cv };
  }, [glucoseRows]);

  if (loading) {
    return <main className="center-screen"><div className="loader-card"><strong>PEPPE STUDY</strong><p>Cargando peso y glucosa…</p></div></main>;
  }

  if (!user) {
    return <main className="center-screen"><div className="loader-card"><strong>PEPPE STUDY</strong><p>Primero inicia sesión.</p><Link href="/">Volver a Peppe</Link></div></main>;
  }

  return (
    <main className="shell study-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">PEPPE · ESTUDIO PERSONAL</span>
          <h1>Peso + glucosa.</h1>
          <p className="muted">Dos señales longitudinales para relacionar energía, nutrición, recuperación y entrenamiento.</p>
        </div>
        <Link className="ghost link-button" href="/">Inicio</Link>
      </header>

      <section className="study-summary">
        <article className="card study-stat">
          <span className="eyebrow">PESO ACTUAL</span>
          <strong>{latestWeight !== null ? `${Number(latestWeight).toFixed(1)} kg` : '—'}</strong>
          <small>{weightDelta === null ? 'Sin comparación previa' : `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg vs. medición anterior`}</small>
        </article>
        <article className="card study-stat">
          <span className="eyebrow">ÚLTIMA GLUCOSA</span>
          <strong>{glucoseRows[0] ? `${Number(glucoseRows[0].glucose_mg_dl).toFixed(0)} mg/dL` : '—'}</strong>
          <small>{glucoseRows[0] ? trendOptions.find((option) => option.value === glucoseRows[0].trend)?.label ?? 'Sin tendencia' : 'Sin lecturas hoy'}</small>
        </article>
        <article className="card study-stat">
          <span className="eyebrow">PROMEDIO HOY</span>
          <strong>{glucoseStats ? `${glucoseStats.avg.toFixed(0)} mg/dL` : '—'}</strong>
          <small>{glucoseStats ? `${glucoseRows.length} lecturas · mín ${glucoseStats.min.toFixed(0)} · máx ${glucoseStats.max.toFixed(0)}` : 'Aún sin serie CGM'}</small>
        </article>
        <article className="card study-stat">
          <span className="eyebrow">VARIABILIDAD</span>
          <strong>{glucoseStats ? `${glucoseStats.cv.toFixed(1)}%` : '—'}</strong>
          <small>CV descriptivo del día; no es diagnóstico.</small>
        </article>
      </section>

      <section className="grid content study-forms">
        <article className="card">
          <span className="eyebrow">PESO DIARIO</span>
          <h2>Registrar al despertar</h2>
          <p>Idealmente usa condiciones similares cada mañana para que importe la tendencia y no una medición aislada.</p>
          <form className="form-stack" onSubmit={saveWeight}>
            <label>Peso de hoy (kg)<input required min="35" max="250" step="0.1" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="84.2" /></label>
            <button className="primary wide" disabled={savingWeight}>{savingWeight ? 'Guardando…' : 'Guardar peso'}</button>
          </form>
        </article>

        <article className="card">
          <span className="eyebrow">FREESTYLE / CGM</span>
          <h2>Agregar lectura</h2>
          <form className="form-stack" onSubmit={saveGlucose}>
            <label>Glucosa (mg/dL)<input required min="30" max="500" step="1" type="number" value={glucose} onChange={(e) => setGlucose(e.target.value)} placeholder="96" /></label>
            <label>Tendencia<select value={trend} onChange={(e) => setTrend(e.target.value as GlucoseTrend)}>{trendOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Hora<input required type="datetime-local" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} /></label>
            <label>Contexto opcional<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Antes de entrenar, 60 min después del desayuno…" /></label>
            <button className="primary wide" disabled={savingGlucose}>{savingGlucose ? 'Guardando…' : 'Guardar lectura'}</button>
          </form>
        </article>
      </section>

      <section className="card libre-import">
        <div>
          <span className="eyebrow">LIBREVIEW</span>
          <h2>Importar el historial completo</h2>
          <p>Descarga “Glucose Data” desde LibreView y súbelo aquí. Peppe intentará reconocer timestamp y glucosa en mg/dL y guardar la serie para el estudio.</p>
        </div>
        <label className="upload-button">
          {importing ? 'Importando…' : 'Importar CSV LibreView'}
          <input type="file" accept=".csv,text/csv" onChange={importLibreView} disabled={importing} />
        </label>
      </section>

      {message && <div className="notice">{message}</div>}

      <section className="card study-explainer">
        <span className="eyebrow">CÓMO LO USARÁ PEPPE</span>
        <h2>No queremos perseguir un número de glucosa.</h2>
        <p>El análisis cruzará peso, glucosa y tendencia con entrenamiento, comidas, sueño, HRV, frecuencia cardíaca y sensaciones. Buscaremos patrones personales: cuándo cae tu energía, cómo respondes a ciertos desayunos o fondos, y cómo cambia tu peso en relación con carga e hidratación.</p>
        <p className="muted">El CGM mide glucosa intersticial y esta capa del piloto es de seguimiento deportivo; no sustituye evaluación médica ni debe usarse sola para tomar decisiones clínicas.</p>
      </section>
    </main>
  );
}
