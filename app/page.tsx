'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type Role = 'athlete' | 'coach' | 'both';
type Profile = { id: string; full_name: string | null; role: Role };
type AthleteProfile = { user_id: string; birth_date: string | null; sex: string | null; height_cm: number | null; primary_sport: string | null; primary_goal: string | null };
type Scores = { readiness: number | null; fuel: number | null; recovery: number | null; load: number | null };
type Checkin = { energy: number | null; hunger: number | null; legs: number | null; stress: number | null; soreness: number | null; pain: boolean | null; checked_at: string };
type NutritionEntry = { id: number; eaten_at: string; description: string; photo_path: string | null };

const emptyScores: Scores = { readiness: null, fuel: null, recovery: null, load: null };

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function pilotScores(energy: number, hunger: number, legs: number, stress: number, soreness: number): Scores {
  return {
    readiness: clamp(10 * (0.35 * energy + 0.25 * legs + 0.2 * (11 - stress) + 0.2 * (11 - soreness))),
    recovery: clamp(10 * (0.3 * energy + 0.3 * legs + 0.2 * (11 - stress) + 0.2 * (11 - soreness))),
    fuel: clamp(10 * (0.55 * energy + 0.45 * (11 - hunger))),
    load: clamp(10 * (0.5 * soreness + 0.3 * stress + 0.2 * (11 - energy))),
  };
}
function chileDate() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date()); }
function scoreNote(label: keyof Scores, value: number | null) {
  if (value === null) return 'Completa tu primer check-in';
  if (label === 'load') return value >= 75 ? 'Carga percibida alta' : value >= 50 ? 'Carga percibida moderada' : 'Carga percibida baja';
  return value >= 80 ? 'Estado favorable' : value >= 60 ? 'Atención moderada' : 'Conviene revisar hoy';
}

export default function Home() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile | null>(null);
  const [scores, setScores] = useState<Scores>(emptyScores);
  const [latestCheckin, setLatestCheckin] = useState<Checkin | null>(null);
  const [nutrition, setNutrition] = useState<NutritionEntry[]>([]);
  const [message, setMessage] = useState('');

  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupRole, setSignupRole] = useState<Role>('athlete');
  const [authBusy, setAuthBusy] = useState(false);

  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState('prefer_not_to_say');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [sport, setSport] = useState('running');
  const [goal, setGoal] = useState('Mejorar rendimiento');
  const [onboardingBusy, setOnboardingBusy] = useState(false);

  const [energy, setEnergy] = useState(7);
  const [hunger, setHunger] = useState(5);
  const [legs, setLegs] = useState(7);
  const [stress, setStress] = useState(4);
  const [soreness, setSoreness] = useState(3);
  const [pain, setPain] = useState(false);
  const [notes, setNotes] = useState('');
  const [checkinBusy, setCheckinBusy] = useState(false);

  const [mealType, setMealType] = useState('Comida');
  const [mealDescription, setMealDescription] = useState('');
  const [mealPhoto, setMealPhoto] = useState<File | null>(null);
  const [nutritionBusy, setNutritionBusy] = useState(false);

  const loadUserData = useCallback(async (currentUser: User) => {
    setBooting(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: profileData }, { data: athleteData }, { data: scoreData }, { data: checkinData }, { data: nutritionData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role').eq('id', currentUser.id).maybeSingle(),
      supabase.from('athlete_profiles').select('*').eq('user_id', currentUser.id).maybeSingle(),
      supabase.from('scores').select('readiness, fuel, recovery, load').eq('athlete_id', currentUser.id).order('score_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('subjective_checkins').select('energy, hunger, legs, stress, soreness, pain, checked_at').eq('athlete_id', currentUser.id).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('nutrition_entries').select('id, eaten_at, description, photo_path').eq('athlete_id', currentUser.id).gte('eaten_at', since).order('eaten_at', { ascending: false }).limit(12),
    ]);

    const loadedProfile = profileData as Profile | null;
    const loadedAthlete = athleteData as AthleteProfile | null;
    setProfile(loadedProfile);
    setAthleteProfile(loadedAthlete);
    setScores((scoreData as Scores | null) ?? emptyScores);
    setLatestCheckin((checkinData as Checkin | null) ?? null);
    setNutrition((nutritionData as NutritionEntry[] | null) ?? []);
    setFullName(loadedProfile?.full_name ?? currentUser.user_metadata?.full_name ?? '');
    if (loadedAthlete) {
      setBirthDate(loadedAthlete.birth_date ?? '');
      setSex(loadedAthlete.sex ?? 'prefer_not_to_say');
      setHeight(loadedAthlete.height_cm ? String(loadedAthlete.height_cm) : '');
      setSport(loadedAthlete.primary_sport ?? 'running');
      setGoal(loadedAthlete.primary_goal ?? 'Mejorar rendimiento');
    }
    if (checkinData) {
      const c = checkinData as Checkin;
      if (c.energy) setEnergy(c.energy); if (c.hunger) setHunger(c.hunger); if (c.legs) setLegs(c.legs); if (c.stress) setStress(c.stress); if (c.soreness) setSoreness(c.soreness); setPain(Boolean(c.pain));
    }
    setBooting(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => { if (!mounted) return; setUser(data.user ?? null); if (data.user) loadUserData(data.user); else setBooting(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const nextUser = session?.user ?? null; setUser(nextUser);
      if (nextUser) loadUserData(nextUser); else { setProfile(null); setAthleteProfile(null); setScores(emptyScores); setNutrition([]); setBooting(false); }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadUserData]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setAuthBusy(true); setMessage('');
    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { data: { full_name: signupName.trim(), role: signupRole }, emailRedirectTo: 'https://peppe-manager.vercel.app' } });
      if (error) setMessage(error.message); else if (!data.session) setMessage('Cuenta creada. Revisa tu correo para confirmar y vuelve a Peppe.'); else setMessage('Cuenta creada. Bienvenido a Peppe.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword }); if (error) setMessage(error.message);
    }
    setAuthBusy(false);
  }

  async function saveOnboarding(event: FormEvent) {
    event.preventDefault(); if (!user) return; setOnboardingBusy(true); setMessage('');
    const { error: profileError } = await supabase.from('profiles').update({ full_name: fullName.trim(), updated_at: new Date().toISOString() }).eq('id', user.id);
    const { error: athleteError } = await supabase.from('athlete_profiles').upsert({ user_id: user.id, birth_date: birthDate || null, sex, height_cm: height ? Number(height) : null, primary_sport: sport, primary_goal: goal.trim(), updated_at: new Date().toISOString() });
    let weightError = null;
    if (weight) {
      const result = await supabase.from('daily_metrics').upsert({ athlete_id: user.id, metric_date: chileDate(), weight_kg: Number(weight), source: 'manual', updated_at: new Date().toISOString() }, { onConflict: 'athlete_id,metric_date,source' }); weightError = result.error;
    }
    const error = profileError || athleteError || weightError;
    if (error) setMessage(error.message); else { setMessage('Perfil guardado. Peppe ya puede comenzar a construir tu baseline.'); await loadUserData(user); }
    setOnboardingBusy(false);
  }

  async function saveCheckin(event: FormEvent) {
    event.preventDefault(); if (!user) return; setCheckinBusy(true); setMessage('');
    const calculated = pilotScores(energy, hunger, legs, stress, soreness);
    const { error: checkinError } = await supabase.from('subjective_checkins').insert({ athlete_id: user.id, energy, hunger, legs, stress, soreness, pain, notes: notes.trim() || null });
    const { error: scoreError } = await supabase.from('scores').upsert({ athlete_id: user.id, score_date: chileDate(), readiness: calculated.readiness, fuel: calculated.fuel, recovery: calculated.recovery, load: calculated.load, algorithm_version: 'pilot-v0.1' }, { onConflict: 'athlete_id,score_date,algorithm_version' });
    const error = checkinError || scoreError;
    if (error) setMessage(error.message); else { setScores(calculated); setLatestCheckin({ energy, hunger, legs, stress, soreness, pain, checked_at: new Date().toISOString() }); setMessage('Check-in guardado. Tu resumen del día se actualizó.'); setNotes(''); }
    setCheckinBusy(false);
  }

  async function saveNutrition(event: FormEvent) {
    event.preventDefault(); if (!user || (!mealPhoto && !mealDescription.trim())) return;
    setNutritionBusy(true); setMessage(''); let photoPath: string | null = null;
    if (mealPhoto) {
      if (mealPhoto.size > 8 * 1024 * 1024) { setMessage('La foto supera 8 MB. Elige una imagen más liviana.'); setNutritionBusy(false); return; }
      const extension = mealPhoto.name.split('.').pop()?.toLowerCase() || 'jpg';
      photoPath = `${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('nutrition-photos').upload(photoPath, mealPhoto, { upsert: false, contentType: mealPhoto.type || 'image/jpeg' });
      if (uploadError) { setMessage(`No pude subir la foto: ${uploadError.message}`); setNutritionBusy(false); return; }
    }
    const description = `${mealType}: ${mealDescription.trim() || 'Foto de comida pendiente de análisis IA'}`;
    const { error } = await supabase.from('nutrition_entries').insert({ athlete_id: user.id, description, photo_path: photoPath, source: mealPhoto ? 'photo' : 'manual' });
    if (error) setMessage(error.message); else { setMealDescription(''); setMealPhoto(null); setMessage('Comida registrada. Ya forma parte de tu resumen diario.'); await loadUserData(user); }
    setNutritionBusy(false);
  }

  async function signOut() { await supabase.auth.signOut(); setMessage(''); }

  const scoreCards = useMemo(() => [
    { label: 'readiness' as const, title: 'Readiness', value: scores.readiness },
    { label: 'fuel' as const, title: 'Fuel', value: scores.fuel },
    { label: 'recovery' as const, title: 'Recovery', value: scores.recovery },
    { label: 'load' as const, title: 'Load', value: scores.load },
  ], [scores]);

  const dailyDecision = useMemo(() => {
    const hour = new Date().getHours();
    const moment = hour < 11 ? 'Antes del almuerzo' : hour < 17 ? 'Tarde / recuperación' : hour < 21 ? 'Antes de la cena' : 'Antes de dormir';
    if (!latestCheckin) return { moment, title: 'Necesito tu check-in', text: 'Cuéntame energía, hambre, piernas y estrés para poder orientar el resto del día.' };
    if (latestCheckin.pain) return { moment, title: 'Prioridad: revisar la molestia', text: 'Registraste dolor. Evitaremos interpretar esto sólo como fatiga y lo mantendremos destacado para el seguimiento.' };
    if ((scores.fuel ?? 100) < 60) return { moment, title: 'Prioridad: energía', text: `Fuel bajo para tu estado actual. Tienes ${nutrition.length} registro(s) de comida en las últimas 24 h; conviene revisar ingesta y próxima demanda.` };
    if ((scores.recovery ?? 100) < 65) return { moment, title: 'Prioridad: recuperación', text: 'Tu recuperación está por debajo de lo deseable. En esta etapa del piloto priorizamos comida, hidratación, descanso y una nueva lectura de sensaciones.' };
    return { moment, title: 'Estado estable', text: `Tus sensaciones son favorables. Hay ${nutrition.length} registro(s) nutricional(es) en las últimas 24 h. Seguiremos ajustando la próxima decisión con lo que comas y cómo evoluciones.` };
  }, [latestCheckin, nutrition.length, scores.fuel, scores.recovery]);

  if (booting) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Preparando tu información…</p></div></main>;

  if (!user) return (
    <main className="auth-shell">
      <section className="auth-brand"><span className="eyebrow light">PEPPE MANAGER · PILOTO</span><h1>Entrena con contexto, no sólo con datos.</h1><p>Entrenamiento, recuperación, nutrición y sensaciones en una sola lectura.</p><div className="pilot-points"><span>Readiness</span><span>Fuel</span><span>Recovery</span><span>Load</span></div></section>
      <section className="auth-card">
        <div className="auth-tabs"><button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Entrar</button><button className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>Crear cuenta</button></div>
        <h2>{authMode === 'login' ? 'Bienvenido de vuelta' : 'Únete al piloto'}</h2>
        <form className="form-stack" onSubmit={submitAuth}>
          {authMode === 'signup' && <><label>Nombre completo<input required value={signupName} onChange={(e) => setSignupName(e.target.value)} /></label><label>Perfil<select value={signupRole} onChange={(e) => setSignupRole(e.target.value as Role)}><option value="athlete">Atleta</option><option value="coach">Coach</option><option value="both">Atleta + Coach</option></select></label></>}
          <label>Correo<input required type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} /></label><label>Contraseña<input required minLength={8} type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} /></label>
          <button className="primary wide" disabled={authBusy}>{authBusy ? 'Procesando…' : authMode === 'login' ? 'Entrar a Peppe' : 'Crear mi cuenta'}</button>
        </form>{message && <div className="notice">{message}</div>}
      </section>
    </main>
  );

  const isCoachOnly = profile?.role === 'coach';
  if (isCoachOnly) return <main className="shell narrow"><header className="topbar"><div><span className="eyebrow">PEPPE COACH · PILOTO</span><h1>Panel Coach en construcción.</h1></div><button className="ghost" onClick={signOut}>Salir</button></header><section className="card"><p>Tu cuenta está lista. El módulo de invitaciones y atletas será el siguiente despliegue.</p></section></main>;

  if (!athleteProfile) return (
    <main className="shell narrow"><header className="topbar"><div><span className="eyebrow">PEPPE · ONBOARDING</span><h1>Construyamos tu perfil deportivo.</h1></div><button className="ghost" onClick={signOut}>Salir</button></header>
      <section className="card onboarding-card"><form className="form-grid" onSubmit={saveOnboarding}>
        <label className="full">Nombre completo<input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
        <label>Fecha de nacimiento<input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></label>
        <label>Sexo<select value={sex} onChange={(e) => setSex(e.target.value)}><option value="male">Masculino</option><option value="female">Femenino</option><option value="other">Otro</option><option value="prefer_not_to_say">Prefiero no indicar</option></select></label>
        <label>Altura (cm)<input type="number" min="120" max="230" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
        <label>Peso actual (kg)<input type="number" step="0.1" min="35" max="250" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
        <label>Deporte<select value={sport} onChange={(e) => setSport(e.target.value)}><option value="running">Running</option><option value="cycling">Ciclismo</option><option value="triathlon">Triatlón</option><option value="other">Otro</option></select></label>
        <label>Objetivo<input value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
        <button className="primary full" disabled={onboardingBusy}>{onboardingBusy ? 'Guardando…' : 'Crear mi perfil Peppe'}</button>
      </form>{message && <div className="notice">{message}</div>}</section>
    </main>
  );

  return (
    <main className="shell">
      <header className="topbar"><div><span className="eyebrow">PEPPE MANAGER · PILOTO</span><h1>Hola, {profile?.full_name?.split(' ')[0] || 'atleta'}.</h1><p className="muted">{athleteProfile.primary_sport} · {athleteProfile.primary_goal}</p></div><button className="ghost" onClick={signOut}>Salir</button></header>

      <section className="grid scores">{scoreCards.map((s) => <article className="card score" key={s.title}><span>{s.title}</span><strong>{s.value ?? '—'}</strong><small>{scoreNote(s.label, s.value)}</small></article>)}</section>

      <section className="card" style={{ marginBottom: 16 }}>
        <span className="eyebrow">RESUMEN DE HOY · {dailyDecision.moment.toUpperCase()}</span><h2>{dailyDecision.title}</h2><p>{dailyDecision.text}</p>
        <div className="metrics"><span>{nutrition.length} comidas / 24 h</span><span>{latestCheckin ? `Energía ${latestCheckin.energy}/10` : 'Sin check-in'}</span><span>Plan automático: próxima fase</span></div>
        <p className="muted" style={{ marginTop: 14 }}>Cuando conectemos Garmin/TrainingPeaks, este bloque sumará entrenamiento programado, sesión realizada, sueño, HRV y carga automática.</p>
      </section>

      <section className="grid content">
        <article className="card"><span className="eyebrow">BASELINE PERSONAL</span><h2>Estamos aprendiendo cómo respondes.</h2><p>Cada check-in y cada comida alimentan tu historial. Después sumaremos sueño, HRV, frecuencia cardíaca y entrenamiento automático.</p></article>
        <article className="card"><span className="eyebrow">ÚLTIMA LECTURA</span><h2>{latestCheckin ? `Energía ${latestCheckin.energy}/10` : 'Aún sin lectura'}</h2><p>{latestCheckin ? `Hambre ${latestCheckin.hunger}/10 · Piernas ${latestCheckin.legs}/10 · Estrés ${latestCheckin.stress}/10.` : 'Completa tu primer check-in.'}</p></article>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <span className="eyebrow">NUTRICIÓN · FOTO O TEXTO</span><h2>Registrar comida</h2><p className="muted">En iPhone puedes abrir la cámara o elegir una foto. Por ahora guardamos foto + descripción; el análisis visual automático por IA se conectará en la siguiente capa.</p>
        <form className="form-grid" onSubmit={saveNutrition}>
          <label>Momento<select value={mealType} onChange={(e) => setMealType(e.target.value)}><option>Desayuno</option><option>Pre entrenamiento</option><option>Durante entrenamiento</option><option>Post entrenamiento</option><option>Almuerzo</option><option>Colación</option><option>Cena</option><option>Comida</option></select></label>
          <label>Foto<input type="file" accept="image/*" capture="environment" onChange={(e) => setMealPhoto(e.target.files?.[0] ?? null)} /></label>
          <label className="full">¿Qué comiste? (opcional si subes foto)<textarea rows={3} value={mealDescription} onChange={(e) => setMealDescription(e.target.value)} placeholder="Ej: pollo, ensalada, papa pequeña, café..." /></label>
          <button className="primary full" disabled={nutritionBusy || (!mealPhoto && !mealDescription.trim())}>{nutritionBusy ? 'Guardando…' : 'Guardar comida'}</button>
        </form>
        {mealPhoto && <p className="muted">Foto seleccionada: {mealPhoto.name}</p>}
        {nutrition.length > 0 && <div style={{ marginTop: 18 }}><strong>Últimos registros</strong>{nutrition.slice(0, 4).map((n) => <p key={n.id} className="muted" style={{ margin: '8px 0' }}>• {new Date(n.eaten_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} — {n.description}{n.photo_path ? ' · 📷' : ''}</p>)}</div>}
      </section>

      <section className="card checkin">
        <span className="eyebrow">CHECK-IN · 30 SEGUNDOS</span><h2>¿Cómo estás ahora?</h2>
        {[["Energía", energy, setEnergy, 'Vacío', 'Excelente'], ['Hambre', hunger, setHunger, 'Nada', 'Mucha'], ['Piernas', legs, setLegs, 'Pesadas', 'Frescas'], ['Estrés', stress, setStress, 'Bajo', 'Alto'], ['Molestia muscular', soreness, setSoreness, 'Nada', 'Alta']].map(([label, value, setter, left, right]) => <label key={label as string}><span>{label as string}</span><input type="range" min="1" max="10" value={value as number} onChange={(e) => (setter as (n:number)=>void)(Number(e.target.value))} /><strong>{value as number}/10</strong><small style={{ gridColumn: '2 / 4', display: 'flex', justifyContent: 'space-between' }}><span>{left as string}</span><span>{right as string}</span></small></label>)}
        <form className="form-stack" onSubmit={saveCheckin}><label className="checkbox-row"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Tengo dolor que quiero seguir</label><label>Comentario<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: cansancio post entrenamiento, gemelo cargado, dormí mal..." /></label><button className="primary" disabled={checkinBusy}>{checkinBusy ? 'Guardando…' : 'Guardar check-in y actualizar resumen'}</button></form>
      </section>

      {message && <div className="notice">{message}</div>}
      <footer>V0.3 piloto · Los scores actuales son heurísticos y evolucionarán al conectar datos fisiológicos y entrenamiento.</footer>
    </main>
  );
}
