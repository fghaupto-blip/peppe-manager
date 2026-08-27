'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { supabase } from '../lib/supabase';

type ShotSource = 'file' | 'paste' | 'drop';
type Shot = { id: string; file: File; preview: string; source: ShotSource; status: 'pending' | 'uploading' | 'done' | 'error' };
type Context = {
  prefs: any;
  scores: any;
  checkin: any;
  training: any;
  plan: any;
  metric: any;
  glucose: any;
  nutrition: any[];
  evidenceCount: number;
  stravaConnected: boolean;
};

const scale = [1,2,3,4,5,6,7,8,9,10];

function chileDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date());
}

function imageExt(type: string) {
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'jpg';
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function hoursUntil(value?: string | null) {
  if (!value) return null;
  return (new Date(value).getTime() - Date.now()) / 3600000;
}

function scoreFromAnswers(energy: number, hunger: number, legs: number, soreness: number) {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return {
    readiness: clamp(10 * (0.42 * energy + 0.32 * legs + 0.26 * (11 - soreness))),
    recovery: clamp(10 * (0.35 * energy + 0.4 * legs + 0.25 * (11 - soreness))),
    fuel: clamp(10 * (0.48 * energy + 0.52 * (11 - hunger))),
    load: clamp(10 * (0.55 * soreness + 0.45 * (11 - legs))),
  };
}

function buildGuidance(context: Context | null) {
  if (!context) return null;
  const now = new Date();
  const hToPlan = hoursUntil(context.plan?.scheduled_at);
  const planSoon = hToPlan != null && hToPlan >= 0 && hToPlan <= 14;
  const planVerySoon = hToPlan != null && hToPlan >= 0 && hToPlan <= 3;
  const planTitle = context.plan?.title || 'tu próxima sesión';
  const hardPlan = /1200|2000|tempo|umbral|interval|serie|marat|fondo|largo|calidad/i.test(`${context.plan?.title || ''} ${context.plan?.intensity || ''} ${context.plan?.notes || ''}`);
  const readiness = context.scores?.readiness ?? null;
  const legs = context.checkin?.legs ?? null;
  const soreness = context.checkin?.soreness ?? null;
  const hunger = context.checkin?.hunger ?? null;
  const energy = context.checkin?.energy ?? null;
  const pain = Boolean(context.checkin?.pain);
  const glucoseAge = context.glucose?.measured_at ? (Date.now() - new Date(context.glucose.measured_at).getTime()) / 60000 : 999;
  const freshGlucose = glucoseAge <= 45 ? context.glucose : null;
  const trainingAge = context.training?.started_at ? (Date.now() - new Date(context.training.started_at).getTime()) / 3600000 : 999;
  const postTraining = trainingAge >= 0 && trainingAge <= 6;
  const mealTime = (() => {
    const hour = now.getHours();
    if (hour < 10) return context.prefs?.breakfast_time || '08:00';
    if (hour < 16) return context.prefs?.lunch_time || '13:00';
    return context.prefs?.dinner_time || '20:00';
  })();
  const sleepTime = context.prefs?.sleep_time || '22:30';

  const weak = pain || (readiness != null && readiness < 50) || (legs != null && legs <= 4) || (soreness != null && soreness >= 7);
  const strong = !weak && (readiness == null || readiness >= 60) && (legs == null || legs >= 7) && (soreness == null || soreness <= 4);

  const summary = pain
    ? 'Peppe prioriza la molestia por sobre cualquier carga adicional.'
    : weak
      ? 'Hay señales de fatiga que aconsejan proteger recuperación y no sumar carga extra.'
      : planSoon
        ? `La prioridad de las próximas horas es llegar bien a “${planTitle}”.`
        : strong
          ? 'Las señales disponibles son compatibles con seguir el plan sin agregar decisiones innecesarias.'
          : 'El contexto es razonable, pero Peppe mantiene una lectura prudente hasta reunir más señales.';

  const meal = postTraining
    ? 'Próxima comida: proteína + carbohidrato + líquidos. La sesión reciente hace que recuperar sea más importante que recortar.'
    : planSoon && hardPlan
      ? `Próxima comida (${mealTime} aprox.): proteína + una fuente clara de carbohidrato + líquidos. No conviene llegar vacío a ${planTitle}.`
      : hunger != null && hunger >= 8
        ? `Próxima comida (${mealTime} aprox.): no esperes a hambre extrema; prioriza proteína, vegetales y carbohidrato proporcional a lo que viene.`
        : `Próxima comida (${mealTime} aprox.): proteína y vegetales como base; ajusta carbohidrato según la carga que viene.`;

  const recovery = pain
    ? 'Descanso: nada de carga extra. Movilidad suave sólo si no aumenta la molestia.'
    : weak
      ? `Descanso: baja estímulos, hidrátate y apunta a dormir cerca de ${sleepTime}.`
      : `Descanso: mantén actividad cotidiana normal y protege el sueño; objetivo de acostarte cerca de ${sleepTime}.`;

  const next = planVerySoon
    ? `Antes de ${planTitle}: revisa energía, piernas y hambre 60–90 min antes. Si cambia alguna señal, Peppe reajusta combustible o recuperación, no el plan del coach.`
    : planSoon
      ? `Próxima revisión: antes de ${planTitle}${context.plan?.scheduled_at ? `, cerca de ${formatClock(new Date(context.plan.scheduled_at))}` : ''}.`
      : 'Próxima revisión: cuando aparezca una comida, entrenamiento o cambio real de energía, hambre, piernas o dolor.';

  const evidence = [
    context.stravaConnected ? 'Strava conectado' : 'Strava pendiente',
    context.plan ? 'plan disponible' : 'plan aún no cargado',
    context.metric ? 'métricas del día' : 'sin Garmin automático',
    freshGlucose ? `glucosa ${Math.round(freshGlucose.glucose_mg_dl)} mg/dL` : 'sin glucosa automática reciente',
    context.evidenceCount ? `${context.evidenceCount} pantallazo${context.evidenceCount === 1 ? '' : 's'} aportado${context.evidenceCount === 1 ? '' : 's'}` : 'sin pantallazos recientes',
  ];

  const completed = energy != null && legs != null && soreness != null && hunger != null;
  const confidence = completed && context.plan && (context.metric || context.evidenceCount >= 2) ? 'Alta' : completed ? 'Media' : 'Provisional';

  return { summary, meal, recovery, next, evidence, confidence, completed };
}

export default function PeppeEnhancer() {
  const pathname = usePathname();
  const [homeMount, setHomeMount] = useState<HTMLElement | null>(null);
  const [peppeMount, setPeppeMount] = useState<HTMLElement | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [shotMessage, setShotMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const pendingRef = useRef(0);

  const [context, setContext] = useState<Context | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [energy, setEnergy] = useState<number | null>(null);
  const [legs, setLegs] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [hunger, setHunger] = useState<number | null>(null);
  const [pain, setPain] = useState(false);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [answersSaved, setAnswersSaved] = useState(false);

  const pendingCount = shots.filter((s) => s.status === 'pending' || s.status === 'error').length;
  pendingRef.current = pendingCount + (uploading ? 1 : 0);

  useEffect(() => {
    if (pathname !== '/') return;
    document.body.classList.add('peppe-enhanced-home');
    const original = document.querySelector('.photo-prompt');
    if (!original || !original.parentElement) return;
    const mount = document.createElement('div');
    mount.id = 'peppe-multi-evidence-mount';
    original.parentElement.insertBefore(mount, original);
    setHomeMount(mount);
    return () => {
      document.body.classList.remove('peppe-enhanced-home');
      mount.remove();
      setHomeMount(null);
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname !== '/peppe') return;
    document.body.classList.add('peppe-enhanced-flow');
    const anchor = document.querySelector('.engine-path');
    if (!anchor || !anchor.parentElement) return;
    const mount = document.createElement('div');
    mount.id = 'peppe-guidance-mount';
    anchor.parentElement.insertBefore(mount, anchor);
    setPeppeMount(mount);
    return () => {
      document.body.classList.remove('peppe-enhanced-flow');
      mount.remove();
      setPeppeMount(null);
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname !== '/') return;
    const form = document.querySelector('.home-conversation form');
    if (!form) return;
    const handler = (event: Event) => {
      if (pendingRef.current > 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setShotMessage('Guarda primero los pantallazos que agregaste; después seguimos con Peppe.');
        return;
      }
      window.localStorage.setItem('peppe_subjective_step', 'fresh');
    };
    form.addEventListener('submit', handler, true);
    return () => form.removeEventListener('submit', handler, true);
  }, [pathname]);

  function addFiles(files: File[], source: ShotSource) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    const accepted = images.filter((f) => f.size <= 8 * 1024 * 1024).slice(0, Math.max(0, 12 - shots.length));
    if (!accepted.length) {
      setShotMessage('No encontré imágenes válidas o superan 8 MB.');
      return;
    }
    const next = accepted.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), source, status: 'pending' as const }));
    setShots((current) => [...current, ...next]);
    setShotMessage('');
  }

  useEffect(() => () => shots.forEach((shot) => URL.revokeObjectURL(shot.preview)), [shots]);

  useEffect(() => {
    if (pathname !== '/' || !homeMount) return;
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items || []).filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean) as File[];
      if (!files.length) return;
      event.preventDefault();
      addFiles(files.map((f) => new File([f], `pantallazo-${Date.now()}.${imageExt(f.type)}`, { type: f.type })), 'paste');
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [pathname, homeMount, shots.length]);

  async function uploadShots() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setShotMessage('Primero entra al piloto para guardar las capturas.');
      return;
    }
    setUploading(true);
    setShotMessage('');
    let success = 0;
    for (const shot of shots) {
      if (shot.status === 'done') continue;
      setShots((current) => current.map((s) => s.id === shot.id ? { ...s, status: 'uploading' } : s));
      try {
        const ext = shot.file.name.split('.').pop()?.toLowerCase() || imageExt(shot.file.type);
        const path = `${data.user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const upload = await supabase.storage.from('context-evidence').upload(path, shot.file, { upsert: false, contentType: shot.file.type || 'image/jpeg' });
        if (upload.error) throw upload.error;
        const evidence = await supabase.from('context_evidence').insert({
          athlete_id: data.user.id,
          kind: 'photo',
          note: `Pantallazo de contexto · ${shot.source} · fuente todavía sin API automática`,
          storage_path: path,
          source: 'home_multi_screenshot',
        });
        if (evidence.error) throw evidence.error;
        success += 1;
        setShots((current) => current.map((s) => s.id === shot.id ? { ...s, status: 'done' } : s));
      } catch {
        setShots((current) => current.map((s) => s.id === shot.id ? { ...s, status: 'error' } : s));
      }
    }
    setUploading(false);
    setShotMessage(success ? `${success} pantallazo${success === 1 ? '' : 's'} guardado${success === 1 ? '' : 's'} ✓ Peppe los usará como contexto visual.` : 'No pude guardar las capturas. Reintenta.');
  }

  async function loadContext() {
    if (pathname !== '/peppe') return;
    setLoadingContext(true);
    const { data } = await supabase.auth.getUser();
    if (!data.user) { setLoadingContext(false); return; }
    const id = data.user.id;
    const today = chileDate();
    const since24 = new Date(Date.now() - 24 * 3600000).toISOString();
    const planFloor = new Date(Date.now() - 4 * 3600000).toISOString();
    const [prefsR, scoresR, checkinR, trainingR, planR, metricR, glucoseR, nutritionR, evidenceR, stravaR] = await Promise.all([
      supabase.from('user_preferences').select('breakfast_time,lunch_time,dinner_time,sleep_time').eq('athlete_id', id).maybeSingle(),
      supabase.from('scores').select('readiness,fuel,recovery,load').eq('athlete_id', id).order('score_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('subjective_checkins').select('energy,hunger,legs,soreness,pain,notes,checked_at').eq('athlete_id', id).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('training_sessions').select('title,started_at,duration_seconds,distance_m,avg_hr,avg_power').eq('athlete_id', id).eq('provider', 'strava').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('planned_sessions').select('title,scheduled_at,intensity,notes').eq('athlete_id', id).eq('status', 'planned').gte('scheduled_at', planFloor).order('scheduled_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('daily_metrics').select('sleep_minutes,hrv_ms,resting_hr_bpm,stress_score,body_battery,source').eq('athlete_id', id).eq('metric_date', today).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('glucose_readings').select('measured_at,glucose_mg_dl,trend,source').eq('athlete_id', id).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('nutrition_entries').select('eaten_at,description,carbs_g,protein_g').eq('athlete_id', id).gte('eaten_at', since24).order('eaten_at', { ascending: false }).limit(10),
      supabase.from('context_evidence').select('storage_path,source,note').eq('athlete_id', id).limit(30),
      supabase.from('integration_accounts').select('status').eq('user_id', id).eq('provider', 'strava').maybeSingle(),
    ]);
    const nextContext: Context = {
      prefs: prefsR.data,
      scores: scoresR.data,
      checkin: checkinR.data,
      training: trainingR.data,
      plan: planR.data,
      metric: metricR.data,
      glucose: glucoseR.data,
      nutrition: nutritionR.data || [],
      evidenceCount: (evidenceR.data || []).filter((e: any) => e.source === 'home_multi_screenshot' || e.source === 'home_clipboard' || e.source === 'home').length,
      stravaConnected: stravaR.data?.status === 'connected',
    };
    setContext(nextContext);

    const fromHome = window.localStorage.getItem('peppe_subjective_step') === 'fresh';
    const c = nextContext.checkin;
    const fresh = c?.checked_at ? (Date.now() - new Date(c.checked_at).getTime()) <= 4 * 3600000 : false;
    if (fromHome) {
      setEnergy(c?.energy ?? null);
      setLegs(null); setSoreness(null); setHunger(null); setPain(Boolean(c?.pain)); setAnswersSaved(false);
    } else if (fresh && c?.energy != null && c?.legs != null && c?.soreness != null && c?.hunger != null) {
      setEnergy(c.energy); setLegs(c.legs); setSoreness(c.soreness); setHunger(c.hunger); setPain(Boolean(c.pain)); setAnswersSaved(true);
    } else {
      setEnergy(c?.energy ?? null); setLegs(c?.legs ?? null); setSoreness(c?.soreness ?? null); setHunger(c?.hunger ?? null); setPain(Boolean(c?.pain)); setAnswersSaved(false);
    }
    setLoadingContext(false);
  }

  useEffect(() => {
    if (pathname !== '/peppe') return;
    loadContext();
  }, [pathname]);

  async function saveSubjective() {
    if ([energy, legs, soreness, hunger].some((v) => v == null)) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    setSavingAnswers(true);
    const calculated = scoreFromAnswers(energy!, hunger!, legs!, soreness!);
    const [checkinR, scoreR] = await Promise.all([
      supabase.from('subjective_checkins').insert({ athlete_id: data.user.id, energy, hunger, legs, soreness, pain, stress: null, notes: 'Peppe · segunda pantalla · señales humanas' }),
      supabase.from('scores').upsert({ athlete_id: data.user.id, score_date: chileDate(), ...calculated, algorithm_version: 'context-v0.3' }, { onConflict: 'athlete_id,score_date,algorithm_version' }),
    ]);
    setSavingAnswers(false);
    if (checkinR.error || scoreR.error) return;
    window.localStorage.removeItem('peppe_subjective_step');
    setAnswersSaved(true);
    await loadContext();
  }

  const guidance = useMemo(() => buildGuidance(context), [context]);

  const homeUi = homeMount ? createPortal(
    <section className="peppe-multi-evidence" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files), 'drop'); }}>
      <div className="peppe-evidence-head">
        <div>
          <span className="eyebrow">CONTEXTO VISUAL MIENTRAS CONECTAMOS LAS APIs</span>
          <h3>Sube todos los pantallazos que hagan falta.</h3>
          <p>No te limites a uno. Peppe puede guardar Garmin, Libre, TrainingPeaks, COROS, comida y cualquier otra captura para completar el contexto del día.</p>
        </div>
        <span className="peppe-evidence-count">{shots.length}/12</span>
      </div>
      <div className="peppe-source-suggestions">
        <span><b>Garmin</b> sueño · HRV · FC reposo · readiness</span>
        <span><b>Libre</b> glucosa · tendencia</span>
        <span><b>TrainingPeaks</b> sesión y semana planificada</span>
        <span><b>COROS</b> carga · recuperación si lo usas</span>
      </div>
      <div className="peppe-evidence-actions">
        <label className="peppe-evidence-add">+ Añadir pantallazos<input multiple type="file" accept="image/*" onChange={(e) => addFiles(Array.from(e.target.files || []), 'file')} /></label>
        <span>Pega con ⌘V / Ctrl+V o arrastra varias imágenes.</span>
      </div>
      {shots.length > 0 && <div className="peppe-shot-grid">{shots.map((shot, index) => <div className={`peppe-shot ${shot.status}`} key={shot.id}>
        <img src={shot.preview} alt={`Pantallazo ${index + 1}`} />
        <div><strong>{shot.status === 'done' ? 'Guardado ✓' : shot.status === 'uploading' ? 'Guardando…' : shot.status === 'error' ? 'Reintentar' : `Pantallazo ${index + 1}`}</strong><button type="button" onClick={() => { URL.revokeObjectURL(shot.preview); setShots((current) => current.filter((s) => s.id !== shot.id)); }}>Quitar</button></div>
      </div>)}</div>}
      {pendingCount > 0 && <button type="button" className="primary peppe-save-shots" disabled={uploading} onClick={uploadShots}>{uploading ? 'Guardando contexto…' : `Guardar ${pendingCount} pantallazo${pendingCount === 1 ? '' : 's'}`}</button>}
      {shotMessage && <div className="peppe-inline-message">{shotMessage}</div>}
      <small>Ahora se guardan como evidencia visual. La lectura automática de sus números será la siguiente capa mientras avanzamos con las APIs.</small>
    </section>, homeMount) : null;

  const question = (label: string, value: number | null, setter: (v:number)=>void, low: string, high: string) => <div className="peppe-human-question">
    <div><strong>{label}</strong><span>{value ?? '—'}/10</span></div>
    <div className="peppe-mini-scale">{scale.map((n) => <button type="button" key={n} className={value === n ? 'active' : ''} onClick={() => setter(n)}>{n}</button>)}</div>
    <div className="peppe-scale-ends"><span>{low}</span><span>{high}</span></div>
  </div>;

  const peppeUi = peppeMount ? createPortal(
    <section className="peppe-ai-flow">
      {!answersSaved && <article className="card peppe-human-step">
        <span className="eyebrow">PASO 2 · LO QUE NINGUNA APP SABE</span>
        <h2>Cuéntame cómo respondió tu cuerpo.</h2>
        <p>Con esto Peppe deja de adivinar y puede cruzar plan, entrenamiento, comida, recuperación y los pantallazos que subiste.</p>
        {question('¿Cómo están tus piernas ahora?', legs, setLegs, 'Muy pesadas', 'Muy frescas')}
        {question('¿Qué nivel de molestia muscular tienes?', soreness, setSoreness, 'Nada', 'Muy alta')}
        {question('¿Cuánta hambre tienes ahora?', hunger, setHunger, 'Nada', 'Muchísima')}
        {question('¿Cómo está tu energía general?', energy, setEnergy, 'Muy baja', 'Excelente')}
        <label className="peppe-pain-check"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Hay dolor o una molestia específica que Peppe debe priorizar.</label>
        <button type="button" className="primary peppe-decide" disabled={savingAnswers || [energy,legs,soreness,hunger].some((v) => v == null)} onClick={saveSubjective}>{savingAnswers ? 'Analizando…' : 'Analizar y decirme qué hago ahora'}</button>
      </article>}

      <article className="card peppe-analysis-card">
        <div className="peppe-analysis-head"><div><span className="eyebrow">PASO 3 · ANÁLISIS PEPPE</span><h2>{guidance?.summary || 'Ordenando tu contexto…'}</h2></div><span className="peppe-confidence">{guidance?.confidence || '—'} confianza</span></div>
        {loadingContext ? <p>Revisando plan, Strava, señales humanas y evidencia visual…</p> : <>
          <div className="peppe-horizon-grid">
            <div><span>AHORA</span><strong>{guidance?.completed ? 'Sigue esta lectura' : 'Completa las preguntas'}</strong><p>{guidance?.completed ? guidance.summary : 'La recomendación final se activa apenas completes piernas, molestia, hambre y energía.'}</p></div>
            <div><span>PRÓXIMA COMIDA</span><strong>Qué comer</strong><p>{guidance?.meal}</p></div>
            <div><span>DESCANSO</span><strong>Qué hacer hoy</strong><p>{guidance?.recovery}</p></div>
            <div><span>PRÓXIMAS HORAS</span><strong>Qué viene después</strong><p>{guidance?.next}</p></div>
          </div>
          <div className="peppe-used-context"><span>QUÉ ESTÁ USANDO PEPPE</span><div>{guidance?.evidence.map((item) => <b key={item}>{item}</b>)}</div></div>
          {context?.evidenceCount ? <p className="peppe-vision-note">Tienes {context.evidenceCount} captura{context.evidenceCount === 1 ? '' : 's'} guardada{context.evidenceCount === 1 ? '' : 's'}. En esta versión Peppe las conserva como evidencia visual; todavía no extrae automáticamente todos sus números, por eso las preguntas humanas siguen siendo importantes.</p> : null}
        </>}
      </article>
    </section>, peppeMount) : null;

  return <>{homeUi}{peppeUi}</>;
}
