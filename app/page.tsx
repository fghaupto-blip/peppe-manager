'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type Role = 'athlete' | 'coach' | 'both';
type Profile = { id: string; full_name: string | null; role: Role };
type AthleteProfile = {
  user_id: string;
  birth_date: string | null;
  sex: string | null;
  height_cm: number | null;
  primary_sport: string | null;
  primary_goal: string | null;
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
type TrainingSession = {
  title: string | null;
  sport: string | null;
  started_at: string;
  duration_seconds: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  avg_power: number | null;
};
type IntegrationAccount = { status: string; last_synced_at: string | null };

const feelings = [
  { value: 3, label: 'Muy cansado', icon: '○' },
  { value: 5, label: 'Cansado', icon: '◔' },
  { value: 7, label: 'Normal', icon: '◐' },
  { value: 8, label: 'Bien', icon: '◕' },
  { value: 10, label: 'Muy bien', icon: '●' },
];

function chileDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date());
}

function formatDistance(meters: number | null) {
  return meters ? `${(meters / 1000).toFixed(1)} km` : null;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes} min`;
}

export default function Home() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile | null>(null);
  const [latestCheckin, setLatestCheckin] = useState<Checkin | null>(null);
  const [latestSession, setLatestSession] = useState<TrainingSession | null>(null);
  const [strava, setStrava] = useState<IntegrationAccount | null>(null);
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

  const [feeling, setFeeling] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [contextBusy, setContextBusy] = useState(false);

  const loadUserData = useCallback(async (currentUser: User) => {
    setBooting(true);
    const [profileResult, athleteResult, checkinResult, sessionResult, integrationResult] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role').eq('id', currentUser.id).maybeSingle(),
      supabase.from('athlete_profiles').select('*').eq('user_id', currentUser.id).maybeSingle(),
      supabase.from('subjective_checkins').select('energy,hunger,legs,stress,soreness,pain,checked_at').eq('athlete_id', currentUser.id).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('training_sessions').select('title,sport,started_at,duration_seconds,distance_m,avg_hr,avg_power').eq('athlete_id', currentUser.id).eq('provider', 'strava').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('integration_accounts').select('status,last_synced_at').eq('user_id', currentUser.id).eq('provider', 'strava').maybeSingle(),
    ]);

    const loadedProfile = profileResult.data as Profile | null;
    const loadedAthlete = athleteResult.data as AthleteProfile | null;
    setProfile(loadedProfile);
    setAthleteProfile(loadedAthlete);
    setLatestCheckin((checkinResult.data as Checkin | null) ?? null);
    setLatestSession((sessionResult.data as TrainingSession | null) ?? null);
    setStrava((integrationResult.data as IntegrationAccount | null) ?? null);
    setFullName(loadedProfile?.full_name ?? currentUser.user_metadata?.full_name ?? '');
    if (loadedAthlete) {
      setBirthDate(loadedAthlete.birth_date ?? '');
      setSex(loadedAthlete.sex ?? 'prefer_not_to_say');
      setHeight(loadedAthlete.height_cm ? String(loadedAthlete.height_cm) : '');
      setSport(loadedAthlete.primary_sport ?? 'running');
      setGoal(loadedAthlete.primary_goal ?? 'Mejorar rendimiento');
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
        options: {
          data: { full_name: signupName.trim(), role: signupRole },
          emailRedirectTo: 'https://peppe-manager.vercel.app',
        },
      });
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
      const result = await supabase.from('daily_metrics').upsert({
        athlete_id: user.id,
        metric_date: chileDate(),
        weight_kg: Number(weight),
        source: 'manual',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'athlete_id,metric_date,source' });
      weightError = result.error;
    }
    const error = profileError || athleteError || weightError;
    if (error) setMessage(error.message);
    else await loadUserData(user);
    setOnboardingBusy(false);
  }

  async function continueWithPeppe(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setContextBusy(true);
    setMessage('');

    try {
      if (feeling !== null || note.trim()) {
        const { error } = await supabase.from('subjective_checkins').insert({
          athlete_id: user.id,
          energy: feeling,
          legs: feeling,
          hunger: latestCheckin?.hunger ?? null,
          stress: latestCheckin?.stress ?? null,
          soreness: latestCheckin?.soreness ?? null,
          pain: latestCheckin?.pain ?? false,
          notes: note.trim() || 'Lectura rápida desde inicio',
        });
        if (error) throw error;
      }

      if (photo) {
        if (photo.size > 8 * 1024 * 1024) throw new Error('La foto supera 8 MB. Elige una imagen más liviana.');
        const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('context-evidence').upload(path, photo, {
          upsert: false,
          contentType: photo.type || 'image/jpeg',
        });
        if (uploadError) throw uploadError;
        const { error: evidenceError } = await supabase.from('context_evidence').insert({
          athlete_id: user.id,
          kind: 'photo',
          note: note.trim() || 'Foto aportada desde inicio',
          storage_path: path,
          source: 'home',
        });
        if (evidenceError) throw evidenceError;
      }

      window.location.assign('/peppe?from=home');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pude incorporar este contexto.');
      setContextBusy(false);
    }
  }

  if (booting) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Buscando lo que ya sabemos…</p></div></main>;

  if (!user) return (
    <main className="auth-shell">
      <section className="auth-brand">
        <span className="eyebrow light">PEPPE MANAGER · PILOTO</span>
        <h1>Un Pepe Grillo para tus hábitos y tus metas.</h1>
        <p>Peppe combina tu plan, tus aplicaciones y lo que tú sientes para ayudarte a decidir qué hacer ahora.</p>
      </section>
      <section className="auth-card">
        <div className="auth-tabs">
          <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Entrar</button>
          <button className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>Crear cuenta</button>
        </div>
        <h2>{authMode === 'login' ? 'Bienvenido de vuelta' : 'Únete al piloto'}</h2>
        <form className="form-stack" onSubmit={submitAuth}>
          {authMode === 'signup' && <>
            <label>Nombre completo<input required value={signupName} onChange={(e) => setSignupName(e.target.value)} /></label>
            <label>Perfil<select value={signupRole} onChange={(e) => setSignupRole(e.target.value as Role)}><option value="athlete">Atleta</option><option value="coach">Coach</option><option value="both">Atleta + Coach</option></select></label>
          </>}
          <label>Correo<input required type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} /></label>
          <label>Contraseña<input required minLength={8} type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} /></label>
          <button className="primary wide" disabled={authBusy}>{authBusy ? 'Procesando…' : authMode === 'login' ? 'Entrar a Peppe' : 'Crear mi cuenta'}</button>
        </form>
        {message && <div className="notice">{message}</div>}
      </section>
    </main>
  );

  if (profile?.role === 'coach') return (
    <main className="shell narrow"><section className="card"><span className="eyebrow">PEPPE COACH</span><h1>Panel Coach en construcción.</h1><p>Tu cuenta está lista. El módulo para definir el plan y acompañar atletas será la siguiente capa.</p></section></main>
  );

  if (!athleteProfile) return (
    <main className="shell narrow">
      <header className="topbar"><div><span className="eyebrow">PEPPE · PRIMERA VEZ</span><h1>Primero entendamos tu meta.</h1></div></header>
      <section className="card onboarding-card">
        <form className="form-grid" onSubmit={saveOnboarding}>
          <label className="full">Nombre completo<input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
          <label>Fecha de nacimiento<input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></label>
          <label>Sexo<select value={sex} onChange={(e) => setSex(e.target.value)}><option value="male">Masculino</option><option value="female">Femenino</option><option value="other">Otro</option><option value="prefer_not_to_say">Prefiero no indicar</option></select></label>
          <label>Altura (cm)<input type="number" min="120" max="230" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
          <label>Peso actual (kg)<input type="number" step="0.1" min="35" max="250" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
          <label>Deporte<select value={sport} onChange={(e) => setSport(e.target.value)}><option value="running">Running</option><option value="cycling">Ciclismo</option><option value="triathlon">Triatlón</option><option value="other">Otro</option></select></label>
          <label>Objetivo<input value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
          <button className="primary full" disabled={onboardingBusy}>{onboardingBusy ? 'Guardando…' : 'Empezar con Peppe'}</button>
        </form>
        {message && <div className="notice">{message}</div>}
      </section>
    </main>
  );

  const sessionParts = latestSession ? [
    formatDistance(latestSession.distance_m),
    formatDuration(latestSession.duration_seconds),
    latestSession.avg_hr ? `FC ${Math.round(latestSession.avg_hr)}` : null,
  ].filter(Boolean).join(' · ') : null;

  return (
    <main className="shell simple-home">
      <header className="simple-home-head">
        <div>
          <span className="eyebrow">PEPPE</span>
          <h1>Hola, {profile?.full_name?.split(' ')[0] || 'atleta'}.</h1>
          <p>{athleteProfile.primary_goal || 'Tu objetivo está definido.'}</p>
        </div>
      </header>

      <section className="home-conversation card">
        <span className="home-orbit">✦</span>
        <div className="home-question-copy">
          <span className="eyebrow">AHORA</span>
          <h2>¿Cómo te sientes ahora?</h2>
          <p>No necesito que completes un formulario. Dime sólo lo que tú sabes; Peppe buscará el resto en tus fuentes conectadas.</p>
        </div>

        <form onSubmit={continueWithPeppe}>
          <div className="feeling-grid" aria-label="Cómo te sientes">
            {feelings.map((item) => <button
              className={feeling === item.value ? 'feeling-option selected' : 'feeling-option'}
              type="button"
              onClick={() => setFeeling(item.value)}
              key={item.value}
            ><span>{item.icon}</span><strong>{item.label}</strong></button>)}
          </div>

          <label className="home-note">
            <span>¿Hay algo que quieras contarme?</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional · Ej: piernas cargadas, dormí poco, tengo hambre…" rows={3} />
          </label>

          <div className="photo-prompt">
            <div><strong>¿Quieres aportar una foto?</strong><span>Comida, captura de entrenamiento, glucosa, cuerpo o cualquier contexto que ayude.</span></div>
            <label className={photo ? 'photo-action selected' : 'photo-action'}>
              {photo ? 'Foto lista ✓' : '+ Foto'}
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <button className="primary wide home-continue" disabled={contextBusy}>{contextBusy ? 'Ordenando tu contexto…' : (feeling !== null || note.trim() || photo) ? 'Guardar y seguir con Peppe' : 'Seguir con lo que Peppe ya sabe'}</button>
        </form>
      </section>

      <section className="auto-context">
        <span className="auto-context-dot" />
        <div>
          <strong>Peppe está buscando contexto automáticamente.</strong>
          <p>{strava?.status === 'connected' ? `Strava conectado${sessionParts ? ` · último entrenamiento: ${sessionParts}` : ''}.` : 'Conecta tus fuentes una vez y Peppe dejará de preguntarte datos repetidos.'}</p>
        </div>
      </section>

      <section className="home-next card">
        <span className="eyebrow">DESPUÉS DE ESTO</span>
        <h2>Peppe decide qué falta.</h2>
        <p>Tu sensación + entrenamiento + plan + alimentación + recuperación → sólo las preguntas necesarias → una indicación concreta para este momento.</p>
        {latestCheckin && <small>Última lectura humana: energía {latestCheckin.energy ?? '—'}/10 · piernas {latestCheckin.legs ?? '—'}/10.</small>}
      </section>

      {message && <div className="notice">{message}</div>}
      <footer>V0.6 · Inicio conversacional. Menos pantallas, más contexto automático.</footer>
    </main>
  );
}
