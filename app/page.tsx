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
type MomentStatus = 'done' | 'now' | 'next' | 'optional';
type PeppeMoment = {
  id: string;
  title: string;
  short: string;
  icon: string;
  status: MomentStatus;
  detail: string;
  action?: string;
  mealType?: string;
};

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
function hasMeal(entries: NutritionEntry[], label: string) {
  return entries.some((entry) => entry.description.toLowerCase().startsWith(label.toLowerCase()));
}
function statusLabel(status: MomentStatus) {
  if (status === 'done') return 'Listo';
  if (status === 'now') return 'Ahora';
  if (status === 'optional') return 'Si hace falta';
  return 'Después';
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
      if (c.energy) setEnergy(c.energy);
      if (c.hunger) setHunger(c.hunger);
      if (c.legs) setLegs(c.legs);
      if (c.stress) setStress(c.stress);
      if (c.soreness) setSoreness(c.soreness);
      setPain(Boolean(c.pain));
    }
    setBooting(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      if (data.user) loadUserData(data.user); else setBooting(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) loadUserData(nextUser);
      else { setProfile(null); setAthleteProfile(null); setScores(emptyScores); setNutrition([]); setBooting(false); }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadUserData]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setMessage('');
    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { data: { full_name: signupName.trim(), role: signupRole }, emailRedirectTo: 'https://peppe-manager.vercel.app' } });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage('Cuenta creada. Revisa tu correo para confirmar y vuelve a Peppe.');
      else setMessage('Cuenta creada. Bienvenido a Peppe.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
      if (error) setMessage(error.message);
    }
    setAuthBusy(false);
  }

  async function saveOnboarding(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setOnboardingBusy(true);
    setMessage('');
    const { error: profileError } = await supabase.from('profiles').update({ full_name: fullName.trim(), updated_at: new Date().toISOString() }).eq('id', user.id);
    const { error: athleteError } = await supabase.from('athlete_profiles').upsert({ user_id: user.id, birth_date: birthDate || null, sex, height_cm: height ? Number(height) : null, primary_sport: sport, primary_goal: goal.trim(), updated_at: new Date().toISOString() });
    let weightError = null;
    if (weight) {
      const result = await supabase.from('daily_metrics').upsert({ athlete_id: user.id, metric_date: chileDate(), weight_kg: Number(weight), source: 'manual', updated_at: new Date().toISOString() }, { onConflict: 'athlete_id,metric_date,source' });
      weightError = result.error;
    }
    const error = profileError || athleteError || weightError;
    if (error) setMessage(error.message);
    else { setMessage('Perfil guardado. Peppe ya puede comenzar a construir tu baseline.'); await loadUserData(user); }
    setOnboardingBusy(false);
  }

  async function saveCheckin(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setCheckinBusy(true);
    setMessage('');
    const calculated = pilotScores(energy, hunger, legs, stress, soreness);
    const { error: checkinError } = await supabase.from('subjective_checkins').insert({ athlete_id: user.id, energy, hunger, legs, stress, soreness, pain, notes: notes.trim() || null });
    const { error: scoreError } = await supabase.from('scores').upsert({ athlete_id: user.id, score_date: chileDate(), readiness: calculated.readiness, fuel: calculated.fuel, recovery: calculated.recovery, load: calculated.load, algorithm_version: 'pilot-v0.1' }, { onConflict: 'athlete_id,score_date,algorithm_version' });
    const error = checkinError || scoreError;
    if (error) setMessage(error.message);
    else {
      setScores(calculated);
      setLatestCheckin({ energy, hunger, legs, stress, soreness, pain, checked_at: new Date().toISOString() });
      setMessage('Check-in guardado. Peppe reordenó el resto de tu día.');
      setNotes('');
    }
    setCheckinBusy(false);
  }

  async function saveNutrition(event: FormEvent) {
    event.preventDefault();
    if (!user || (!mealPhoto && !mealDescription.trim())) return;
    setNutritionBusy(true);
    setMessage('');
    let photoPath: string | null = null;
    if (mealPhoto) {
      if (mealPhoto.size > 8 * 1024 * 1024) {
        setMessage('La foto supera 8 MB. Elige una imagen más liviana.');
        setNutritionBusy(false);
        return;
      }
      const extension = mealPhoto.name.split('.').pop()?.toLowerCase() || 'jpg';
      photoPath = `${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('nutrition-photos').upload(photoPath, mealPhoto, { upsert: false, contentType: mealPhoto.type || 'image/jpeg' });
      if (uploadError) {
        setMessage(`No pude subir la foto: ${uploadError.message}`);
        setNutritionBusy(false);
        return;
      }
    }
    const description = `${mealType}: ${mealDescription.trim() || 'Foto de comida pendiente de análisis IA'}`;
    const { error } = await supabase.from('nutrition_entries').insert({ athlete_id: user.id, description, photo_path: photoPath, source: mealPhoto ? 'photo' : 'manual' });
    if (error) setMessage(error.message);
    else {
      setMealDescription('');
      setMealPhoto(null);
      setMessage(`${mealType} registrado. Peppe lo incorporó al contexto del día.`);
      await loadUserData(user);
    }
    setNutritionBusy(false);
  }

  async function signOut() { await supabase.auth.signOut(); setMessage(''); }

  const scoreCards = useMemo(() => [
    { label: 'readiness' as const, title: 'Readiness', value: scores.readiness },
    { label: 'fuel' as const, title: 'Fuel', value: scores.fuel },
    { label: 'recovery' as const, title: 'Recovery', value: scores.recovery },
    { label: 'load' as const, title: 'Load', value: scores.load },
  ], [scores]);

  const moments = useMemo<PeppeMoment[]>(() => {
    const hour = new Date().getHours();
    const hasBreakfast = hasMeal(nutrition, 'Desayuno');
    const hasPre = hasMeal(nutrition, 'Pre entrenamiento');
    const hasPost = hasMeal(nutrition, 'Post entrenamiento');
    const hasLunch = hasMeal(nutrition, 'Almuerzo');
    const hasSnack = hasMeal(nutrition, 'Colación');
    const hasDinner = hasMeal(nutrition, 'Cena');

    const checkinDone = Boolean(latestCheckin);
    const currentSlot = hour < 8 ? 'despertar' : hour < 10 ? 'desayuno' : hour < 13 ? 'media' : hour < 16 ? 'almuerzo' : hour < 19 ? 'colacion' : hour < 22 ? 'cena' : 'cierre';
    const statusFor = (id: string, done: boolean): MomentStatus => done ? 'done' : currentSlot === id ? 'now' : 'next';

    return [
      {
        id: 'despertar', title: 'Despertar', short: 'Estado del cuerpo', icon: '☀️',
        status: statusFor('despertar', checkinDone),
        detail: checkinDone ? `Energía ${latestCheckin?.energy ?? '—'}/10 · Piernas ${latestCheckin?.legs ?? '—'}/10 · Hambre ${latestCheckin?.hunger ?? '—'}/10` : 'Peppe necesita sólo lo que los dispositivos todavía no saben.',
        action: checkinDone ? undefined : 'Completar check-in',
      },
      {
        id: 'pre', title: 'Pre-entreno', short: 'Preparar la sesión', icon: '⚡',
        status: hasPre ? 'done' : hour < 8 ? 'now' : 'optional',
        detail: hasPre ? 'Ingesta pre-entreno registrada.' : 'Se activa alrededor del entrenamiento. Registra sólo lo que comiste o bebiste.',
        action: hasPre ? undefined : 'Registrar pre-entreno', mealType: 'Pre entrenamiento',
      },
      {
        id: 'post', title: 'Post-entreno', short: 'Recuperar', icon: '🏃',
        status: hasPost ? 'done' : hour >= 7 && hour < 11 ? 'now' : 'optional',
        detail: hasPost ? 'Recuperación post-entreno registrada.' : 'Piernas, esfuerzo percibido, molestias y primera recuperación nutricional.',
        action: hasPost ? undefined : 'Registrar post-entreno', mealType: 'Post entrenamiento',
      },
      {
        id: 'desayuno', title: 'Desayuno', short: 'Primera comida', icon: '🍳',
        status: statusFor('desayuno', hasBreakfast),
        detail: hasBreakfast ? 'Desayuno registrado.' : 'Muéstrame qué vas a comer. Peppe revisa el contexto antes de recomendar.',
        action: hasBreakfast ? undefined : 'Registrar desayuno', mealType: 'Desayuno',
      },
      {
        id: 'media', title: 'Media mañana', short: 'Sólo si hace falta', icon: '○',
        status: hasSnack ? 'done' : 'optional',
        detail: 'No obliga a comer. Se activa por hambre, recuperación o demanda del siguiente entrenamiento.',
        action: hasSnack ? undefined : 'Tengo hambre', mealType: 'Colación',
      },
      {
        id: 'almuerzo', title: 'Almuerzo', short: 'Comer con contexto', icon: '🍽️',
        status: statusFor('almuerzo', hasLunch),
        detail: hasLunch ? 'Almuerzo registrado.' : 'Foto o texto antes de comer. Peppe contrasta recuperación, carga y próxima sesión.',
        action: hasLunch ? undefined : 'Mostrar almuerzo', mealType: 'Almuerzo',
      },
      {
        id: 'colacion', title: 'Tarde', short: 'Colación condicional', icon: '◌',
        status: hasSnack ? 'done' : currentSlot === 'colacion' ? 'now' : 'optional',
        detail: 'Sólo aparece como prioridad si hambre, combustible o entrenamiento de mañana lo justifican.',
        action: hasSnack ? undefined : 'Evaluar colación', mealType: 'Colación',
      },
      {
        id: 'cena', title: 'Cena', short: 'Preparar mañana', icon: '🌙',
        status: statusFor('cena', hasDinner),
        detail: hasDinner ? 'Cena registrada.' : 'La recomendación cambia según la carga y el entrenamiento del día siguiente.',
        action: hasDinner ? undefined : 'Mostrar cena', mealType: 'Cena',
      },
      {
        id: 'cierre', title: 'Cierre', short: 'Aprender del día', icon: '✓',
        status: currentSlot === 'cierre' ? 'now' : 'next',
        detail: 'Energía, piernas y molestias. Tres respuestas para cerrar y preparar mañana.',
        action: 'Cerrar el día',
      },
    ];
  }, [latestCheckin, nutrition]);

  const activeMoment = useMemo(() => moments.find((m) => m.status === 'now') ?? moments.find((m) => m.status === 'next') ?? moments[0], [moments]);

  const dailyDecision = useMemo(() => {
    if (!latestCheckin) return { title: 'Primero, dime cómo amaneciste.', text: 'Peppe ya puede ordenar la jornada por momentos. Completa energía, hambre, piernas y molestias; después desaparecen las preguntas innecesarias.' };
    if (latestCheckin.pain) return { title: 'La molestia manda hoy.', text: 'Registraste dolor. Peppe mantendrá esa señal visible y priorizará recuperación antes de sugerir más carga.' };
    if ((scores.fuel ?? 100) < 60) return { title: 'La próxima decisión es combustible.', text: 'Tu Fuel está bajo. Revisaremos la siguiente comida en función de la demanda del entrenamiento y no por una pauta genérica.' };
    if ((scores.recovery ?? 100) < 65) return { title: 'Hoy gana la recuperación.', text: 'Tu recuperación está por debajo de lo deseable. La secuencia del día prioriza hidratación, alimentación y descanso.' };
    return { title: 'Buen contexto para seguir el plan.', text: 'Peppe mantendrá la pauta simple: preguntar sólo lo que falta y ajustar cada comida según lo que viene después.' };
  }, [latestCheckin, scores.fuel, scores.recovery]);

  function openMealComposer(type?: string) {
    if (type) setMealType(type);
    window.setTimeout(() => document.getElementById('nutrition-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function openCheckin() {
    window.setTimeout(() => document.getElementById('peppe-checkin')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

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
    <main className="shell peppe-home">
      <header className="topbar peppe-topbar">
        <div>
          <span className="eyebrow">PEPPE · HOY</span>
          <h1>Hola, {profile?.full_name?.split(' ')[0] || 'atleta'}.</h1>
          <p className="muted">{athleteProfile.primary_sport} · {athleteProfile.primary_goal}</p>
        </div>
        <button className="ghost" onClick={signOut}>Salir</button>
      </header>

      <section className="peppe-now card">
        <div className="peppe-now-copy">
          <span className="moment-badge">AHORA · {activeMoment.title.toUpperCase()}</span>
          <h2>{dailyDecision.title}</h2>
          <p>{dailyDecision.text}</p>
          <div className="context-chips">
            <span>{latestCheckin ? `Energía ${latestCheckin.energy}/10` : 'Falta check-in'}</span>
            <span>{latestCheckin ? `Piernas ${latestCheckin.legs}/10` : 'Piernas —'}</span>
            <span>{nutrition.length} registros / 24 h</span>
          </div>
        </div>
        <div className="peppe-now-action">
          <span className="moment-icon-large">{activeMoment.icon}</span>
          <strong>{activeMoment.short}</strong>
          <p>{activeMoment.detail}</p>
          {activeMoment.action && <button className="primary" onClick={() => activeMoment.mealType ? openMealComposer(activeMoment.mealType) : openCheckin()}>{activeMoment.action}</button>}
        </div>
      </section>

      <section className="section-heading">
        <div><span className="eyebrow">ITINERARIO ADAPTATIVO</span><h2>Tu día, momento a momento.</h2></div>
        <p>Peppe activa sólo lo que corresponde. Las comidas se ordenan alrededor del entrenamiento, recuperación y hambre.</p>
      </section>

      <section className="moments-card card">
        <div className="moments-list">
          {moments.map((moment, index) => (
            <div className={`moment-row ${moment.status}`} key={moment.id}>
              <div className="moment-rail">
                <span className="moment-dot">{moment.status === 'done' ? '✓' : moment.icon}</span>
                {index < moments.length - 1 && <span className="moment-line" />}
              </div>
              <div className="moment-main">
                <div className="moment-heading">
                  <div><strong>{moment.title}</strong><span>{moment.short}</span></div>
                  <span className={`status-pill ${moment.status}`}>{statusLabel(moment.status)}</span>
                </div>
                <p>{moment.detail}</p>
                {moment.action && moment.status !== 'done' && <button className="moment-action" onClick={() => moment.mealType ? openMealComposer(moment.mealType) : openCheckin()}>{moment.action} →</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid scores compact-scores">
        {scoreCards.map((s) => <article className="card score" key={s.title}><span>{s.title}</span><strong>{s.value ?? '—'}</strong><small>{scoreNote(s.label, s.value)}</small></article>)}
      </section>

      <section id="nutrition-composer" className="card moment-composer">
        <span className="eyebrow">ALIMENTACIÓN · MOMENTO ACTUAL</span>
        <h2>Muéstrame qué vas a comer.</h2>
        <p className="muted">Foto, texto o ambos. Peppe lo guarda en el contexto del día para que la siguiente indicación no parta de cero.</p>
        <form className="form-grid" onSubmit={saveNutrition}>
          <label>Momento<select value={mealType} onChange={(e) => setMealType(e.target.value)}><option>Desayuno</option><option>Pre entrenamiento</option><option>Durante entrenamiento</option><option>Post entrenamiento</option><option>Almuerzo</option><option>Colación</option><option>Cena</option><option>Comida</option></select></label>
          <label>Foto<input type="file" accept="image/*" capture="environment" onChange={(e) => setMealPhoto(e.target.files?.[0] ?? null)} /></label>
          <label className="full">Cuéntame qué tienes<textarea rows={3} value={mealDescription} onChange={(e) => setMealDescription(e.target.value)} placeholder="Ej: pollo, ensalada, papa pequeña, café..." /></label>
          <button className="primary full" disabled={nutritionBusy || (!mealPhoto && !mealDescription.trim())}>{nutritionBusy ? 'Guardando…' : `Guardar ${mealType.toLowerCase()}`}</button>
        </form>
        {mealPhoto && <p className="muted">Foto seleccionada: {mealPhoto.name}</p>}
        {nutrition.length > 0 && <div className="nutrition-history"><strong>Hoy ya registraste</strong>{nutrition.slice(0, 5).map((n) => <p key={n.id}>• {new Date(n.eaten_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} — {n.description}{n.photo_path ? ' · 📷' : ''}</p>)}</div>}
      </section>

      <section id="peppe-checkin" className="card checkin moment-checkin">
        <span className="eyebrow">PEPPE PREGUNTA SÓLO LO QUE FALTA</span>
        <h2>¿Cómo estás ahora?</h2>
        <p className="muted">Estas respuestas completan lo que todavía no llega desde Garmin, Strava, TrainingPeaks o tus sensores.</p>
        {[["Energía", energy, setEnergy, 'Vacío', 'Excelente'], ['Hambre', hunger, setHunger, 'Nada', 'Mucha'], ['Piernas', legs, setLegs, 'Pesadas', 'Frescas'], ['Estrés', stress, setStress, 'Bajo', 'Alto'], ['Molestia muscular', soreness, setSoreness, 'Nada', 'Alta']].map(([label, value, setter, left, right]) => <label className="range-row" key={label as string}><span className="range-heading"><span>{label as string}</span><strong>{value as number}/10</strong></span><input type="range" min="1" max="10" value={value as number} onChange={(e) => (setter as (n:number)=>void)(Number(e.target.value))} /><small className="range-scale"><span>{left as string}</span><span>{right as string}</span></small></label>)}
        <form className="form-stack" onSubmit={saveCheckin}><label className="pain-row"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Tengo dolor que quiero seguir</label><label>Comentario<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: aductor cargado, dormí mal, piernas muy frescas..." /></label><button className="primary" disabled={checkinBusy}>{checkinBusy ? 'Guardando…' : 'Guardar y reordenar mi día'}</button></form>
      </section>

      <section className="card day-summary">
        <span className="eyebrow">MEMORIA PEPPE</span>
        <h2>Lo importante queda ordenado.</h2>
        <div className="summary-grid">
          <div><span>Estado</span><strong>{latestCheckin ? 'Registrado' : 'Pendiente'}</strong></div>
          <div><span>Nutrición</span><strong>{nutrition.length} registros</strong></div>
          <div><span>Recuperación</span><strong>{scores.recovery ?? '—'}</strong></div>
          <div><span>Próxima decisión</span><strong>{activeMoment.title}</strong></div>
        </div>
        <p className="muted">La siguiente capa conectará entrenamiento programado/realizado, sueño, HRV, frecuencia cardíaca y glucosa para que este resumen se genere automáticamente.</p>
      </section>

      {message && <div className="notice sticky-notice">{message}</div>}
      <footer>V0.4 · Momentos Peppe. El flujo adapta alimentación, recuperación y preguntas al contexto del día.</footer>
    </main>
  );
}
