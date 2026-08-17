'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type Role = 'athlete' | 'coach' | 'both';

type Profile = {
  id: string;
  full_name: string | null;
  role: Role;
};

type AthleteProfile = {
  user_id: string;
  birth_date: string | null;
  sex: string | null;
  height_cm: number | null;
  primary_sport: string | null;
  primary_goal: string | null;
};

type Scores = {
  readiness: number | null;
  fuel: number | null;
  recovery: number | null;
  load: number | null;
};

type Checkin = {
  energy: number | null;
  hunger: number | null;
  legs: number | null;
  stress: number | null;
  soreness: number | null;
  pain: boolean | null;
  checked_at: string;
};

const emptyScores: Scores = { readiness: null, fuel: null, recovery: null, load: null };

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pilotScores(energy: number, hunger: number, legs: number, stress: number, soreness: number): Scores {
  return {
    readiness: clamp(10 * (0.35 * energy + 0.25 * legs + 0.2 * (11 - stress) + 0.2 * (11 - soreness))),
    recovery: clamp(10 * (0.3 * energy + 0.3 * legs + 0.2 * (11 - stress) + 0.2 * (11 - soreness))),
    fuel: clamp(10 * (0.55 * energy + 0.45 * (11 - hunger))),
    load: clamp(10 * (0.5 * soreness + 0.3 * stress + 0.2 * (11 - energy))),
  };
}

function chileDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date());
}

function scoreNote(label: keyof Scores, value: number | null) {
  if (value === null) return 'Completa tu primer check-in';
  if (label === 'load') {
    if (value >= 75) return 'Carga percibida alta';
    if (value >= 50) return 'Carga percibida moderada';
    return 'Carga percibida baja';
  }
  if (value >= 80) return 'Estado favorable';
  if (value >= 60) return 'Atención moderada';
  return 'Conviene revisar hoy';
}

export default function Home() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile | null>(null);
  const [scores, setScores] = useState<Scores>(emptyScores);
  const [latestCheckin, setLatestCheckin] = useState<Checkin | null>(null);
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

  const loadUserData = useCallback(async (currentUser: User) => {
    setBooting(true);
    setMessage('');

    const [{ data: profileData }, { data: athleteData }, { data: scoreData }, { data: checkinData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role').eq('id', currentUser.id).maybeSingle(),
      supabase.from('athlete_profiles').select('*').eq('user_id', currentUser.id).maybeSingle(),
      supabase
        .from('scores')
        .select('readiness, fuel, recovery, load')
        .eq('athlete_id', currentUser.id)
        .order('score_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('subjective_checkins')
        .select('energy, hunger, legs, stress, soreness, pain, checked_at')
        .eq('athlete_id', currentUser.id)
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const loadedProfile = profileData as Profile | null;
    const loadedAthlete = athleteData as AthleteProfile | null;
    setProfile(loadedProfile);
    setAthleteProfile(loadedAthlete);
    setScores((scoreData as Scores | null) ?? emptyScores);
    setLatestCheckin((checkinData as Checkin | null) ?? null);
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
      if (data.user) loadUserData(data.user);
      else setBooting(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) loadUserData(nextUser);
      else {
        setProfile(null);
        setAthleteProfile(null);
        setScores(emptyScores);
        setBooting(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadUserData]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setMessage('');

    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
        options: { data: { full_name: signupName.trim(), role: signupRole } },
      });

      if (error) setMessage(error.message);
      else if (!data.session) setMessage('Cuenta creada. Revisa tu correo para confirmar y luego vuelve a Peppe.');
      else setMessage('Cuenta creada. Bienvenido a Peppe.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) setMessage(error.message);
    }

    setAuthBusy(false);
  }

  async function saveOnboarding(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setOnboardingBusy(true);
    setMessage('');

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), updated_at: new Date().toISOString() })
      .eq('id', user.id);

    const { error: athleteError } = await supabase.from('athlete_profiles').upsert({
      user_id: user.id,
      birth_date: birthDate || null,
      sex,
      height_cm: height ? Number(height) : null,
      primary_sport: sport,
      primary_goal: goal.trim(),
      updated_at: new Date().toISOString(),
    });

    let weightError = null;
    if (weight) {
      const result = await supabase.from('daily_metrics').upsert(
        {
          athlete_id: user.id,
          metric_date: chileDate(),
          weight_kg: Number(weight),
          source: 'manual',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'athlete_id,metric_date,source' },
      );
      weightError = result.error;
    }

    const error = profileError || athleteError || weightError;
    if (error) setMessage(error.message);
    else {
      setMessage('Perfil guardado. Peppe ya puede comenzar a construir tu baseline.');
      await loadUserData(user);
    }
    setOnboardingBusy(false);
  }

  async function saveCheckin(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setCheckinBusy(true);
    setMessage('');

    const calculated = pilotScores(energy, hunger, legs, stress, soreness);
    const { error: checkinError } = await supabase.from('subjective_checkins').insert({
      athlete_id: user.id,
      energy,
      hunger,
      legs,
      stress,
      soreness,
      pain,
      notes: notes.trim() || null,
    });

    const { error: scoreError } = await supabase.from('scores').upsert(
      {
        athlete_id: user.id,
        score_date: chileDate(),
        readiness: calculated.readiness,
        fuel: calculated.fuel,
        recovery: calculated.recovery,
        load: calculated.load,
        algorithm_version: 'pilot-v0.1',
      },
      { onConflict: 'athlete_id,score_date,algorithm_version' },
    );

    const error = checkinError || scoreError;
    if (error) setMessage(error.message);
    else {
      setScores(calculated);
      setLatestCheckin({ energy, hunger, legs, stress, soreness, pain, checked_at: new Date().toISOString() });
      setMessage('Check-in guardado. Los scores piloto se actualizaron.');
      setNotes('');
    }
    setCheckinBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMessage('');
  }

  const scoreCards = useMemo(
    () => [
      { label: 'readiness' as const, title: 'Readiness', value: scores.readiness },
      { label: 'fuel' as const, title: 'Fuel', value: scores.fuel },
      { label: 'recovery' as const, title: 'Recovery', value: scores.recovery },
      { label: 'load' as const, title: 'Load', value: scores.load },
    ],
    [scores],
  );

  if (booting) {
    return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Preparando tu información…</p></div></main>;
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-brand">
          <span className="eyebrow light">PEPPE MANAGER · PILOTO</span>
          <h1>Entrena con contexto, no sólo con datos.</h1>
          <p>Peppe combina entrenamiento, recuperación, nutrición y tus sensaciones para ayudarte a tomar la próxima decisión.</p>
          <div className="pilot-points"><span>Readiness</span><span>Fuel</span><span>Recovery</span><span>Load</span></div>
        </section>

        <section className="auth-card">
          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Entrar</button>
            <button className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>Crear cuenta</button>
          </div>
          <h2>{authMode === 'login' ? 'Bienvenido de vuelta' : 'Únete al piloto'}</h2>
          <p className="muted">Cada participante tiene una cuenta y datos completamente separados.</p>

          <form className="form-stack" onSubmit={submitAuth}>
            {authMode === 'signup' && (
              <>
                <label>Nombre completo<input required value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="Tu nombre" /></label>
                <label>Perfil inicial<select value={signupRole} onChange={(e) => setSignupRole(e.target.value as Role)}><option value="athlete">Atleta</option><option value="coach">Coach</option><option value="both">Atleta + Coach</option></select></label>
              </>
            )}
            <label>Correo<input required type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="tu@correo.com" /></label>
            <label>Contraseña<input required minLength={8} type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Mínimo 8 caracteres" /></label>
            <button className="primary wide" disabled={authBusy}>{authBusy ? 'Procesando…' : authMode === 'login' ? 'Entrar a Peppe' : 'Crear mi cuenta'}</button>
          </form>
          {message && <div className="notice">{message}</div>}
        </section>
      </main>
    );
  }

  const isCoachOnly = profile?.role === 'coach';
  const needsAthleteOnboarding = !isCoachOnly && !athleteProfile;

  if (needsAthleteOnboarding) {
    return (
      <main className="shell narrow">
        <header className="topbar"><div><span className="eyebrow">PEPPE · ONBOARDING</span><h1>Construyamos tu perfil deportivo.</h1></div><button className="ghost" onClick={signOut}>Salir</button></header>
        <section className="card onboarding-card">
          <p className="muted">Necesitamos una base mínima para interpretar tus entrenamientos. Más adelante Garmin y otras fuentes completarán gran parte de esto automáticamente.</p>
          <form className="form-grid" onSubmit={saveOnboarding}>
            <label className="full">Nombre completo<input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
            <label>Fecha de nacimiento<input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></label>
            <label>Sexo<select value={sex} onChange={(e) => setSex(e.target.value)}><option value="male">Masculino</option><option value="female">Femenino</option><option value="other">Otro</option><option value="prefer_not_to_say">Prefiero no indicar</option></select></label>
            <label>Altura (cm)<input type="number" min="120" max="230" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="184" /></label>
            <label>Peso actual (kg)<input type="number" min="35" max="250" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="84.5" /></label>
            <label>Deporte principal<select value={sport} onChange={(e) => setSport(e.target.value)}><option value="running">Running</option><option value="cycling">Ciclismo</option><option value="triathlon">Triatlón</option><option value="other">Otro</option></select></label>
            <label>Objetivo<input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ej: Maratón sub 3h" /></label>
            <button className="primary wide full" disabled={onboardingBusy}>{onboardingBusy ? 'Guardando…' : 'Crear mi perfil Peppe'}</button>
          </form>
          {message && <div className="notice">{message}</div>}
        </section>
      </main>
    );
  }

  if (isCoachOnly) {
    return (
      <main className="shell">
        <header className="topbar"><div><span className="eyebrow">PEPPE COACH · PILOTO</span><h1>Hola, {profile?.full_name || 'Coach'}.</h1></div><button className="ghost" onClick={signOut}>Salir</button></header>
        <section className="card empty-state"><h2>Tu espacio Coach está activo.</h2><p>La cuenta ya funciona y está aislada de los datos de otros usuarios. El próximo módulo permitirá invitar atletas, aceptar vínculos y ver el semáforo del equipo.</p></section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div><span className="eyebrow">PEPPE MANAGER · PILOTO</span><h1>Hola, {profile?.full_name?.split(' ')[0] || 'atleta'}.</h1><p className="muted">{athleteProfile?.primary_sport || 'Deporte'} · {athleteProfile?.primary_goal || 'Objetivo en construcción'}</p></div>
        <button className="ghost" onClick={signOut}>Salir</button>
      </header>

      <section className="grid scores">
        {scoreCards.map((score) => (
          <article className="card score" key={score.label}>
            <span>{score.title}</span>
            <strong>{score.value ?? '—'}</strong>
            <small>{scoreNote(score.label, score.value)}</small>
          </article>
        ))}
      </section>

      <section className="grid content">
        <article className="card workout">
          <span className="eyebrow">BASELINE PERSONAL</span>
          <h2>Estamos aprendiendo cómo respondes.</h2>
          <p>Durante el piloto, cada check-in alimenta tu historial. Después sumaremos sueño, HRV, frecuencia cardíaca y entrenamiento automático.</p>
          <div className="metrics"><span>{athleteProfile?.primary_sport || 'Atleta'}</span><span>Perfil individual</span><span>Datos privados</span></div>
        </article>

        <article className="card recommendation">
          <span className="eyebrow">ÚLTIMA LECTURA</span>
          <h2>{latestCheckin ? `Energía ${latestCheckin.energy}/10` : 'Falta tu primer check-in'}</h2>
          <p>{latestCheckin ? `Hambre ${latestCheckin.hunger}/10 · Piernas ${latestCheckin.legs}/10 · Estrés ${latestCheckin.stress}/10.` : 'Completa el bloque de abajo para generar tus primeros scores personales.'}</p>
        </article>
      </section>

      <section className="card checkin">
        <span className="eyebrow">CHECK-IN · 30 SEGUNDOS</span>
        <h2>¿Cómo estás ahora?</h2>
        <form onSubmit={saveCheckin}>
          <Range label="Energía" value={energy} setValue={setEnergy} low="Vacío" high="Excelente" />
          <Range label="Hambre" value={hunger} setValue={setHunger} low="Nada" high="Mucha" />
          <Range label="Piernas" value={legs} setValue={setLegs} low="Pesadas" high="Frescas" />
          <Range label="Estrés" value={stress} setValue={setStress} low="Bajo" high="Alto" />
          <Range label="Molestia muscular" value={soreness} setValue={setSoreness} low="Nada" high="Alta" />
          <label className="pain-row"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Tengo dolor o una molestia que quiero registrar</label>
          <label className="notes-label">Comentario opcional<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: gemelo derecho cargado, dormí mal, mucha hambre…" /></label>
          <button className="primary" disabled={checkinBusy}>{checkinBusy ? 'Guardando…' : 'Guardar y actualizar Peppe'}</button>
        </form>
        {message && <div className="notice">{message}</div>}
      </section>

      <footer>PEPPE V0.2 PILOTO · Los scores actuales son una primera heurística de prueba; no son evaluación médica ni reemplazan al entrenador.</footer>
    </main>
  );
}

function Range({ label, value, setValue, low, high }: { label: string; value: number; setValue: (value: number) => void; low: string; high: string }) {
  return (
    <div className="range-row">
      <div className="range-heading"><span>{label}</span><strong>{value}/10</strong></div>
      <input type="range" min="1" max="10" value={value} onChange={(e) => setValue(Number(e.target.value))} />
      <div className="range-scale"><small>{low}</small><small>{high}</small></div>
    </div>
  );
}
