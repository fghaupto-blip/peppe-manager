'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type IntegrationAccount = {
  status: string;
  scopes: string[] | null;
  external_user_id: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  metadata?: Record<string, unknown> | null;
};

type TrainingSession = {
  id: string;
  provider: string;
  title: string | null;
  sport: string | null;
  started_at: string;
  duration_seconds: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  avg_power: number | null;
};

type PlannedWorkout = {
  id: string;
  title: string;
  sport: string | null;
  planned_start: string;
  duration_seconds: number | null;
  distance_m: number | null;
};

const STRAVA_CLIENT_ID = '274597';
const STRAVA_CALLBACK = 'https://dzezeuybcgwzdlgggcuz.supabase.co/functions/v1/strava-oauth-callback';

function formatDistance(meters: number | null) {
  if (!meters) return '—';
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatSync(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('es-CL') : '—';
}

export default function IntegrationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [stravaAccount, setStravaAccount] = useState<IntegrationAccount | null>(null);
  const [garminAccount, setGarminAccount] = useState<IntegrationAccount | null>(null);
  const [trainingPeaksAccount, setTrainingPeaksAccount] = useState<IntegrationAccount | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  const [trainingPeaksUrl, setTrainingPeaksUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingTrainingPeaks, setSyncingTrainingPeaks] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async (currentUser: User) => {
    const [accountsResult, sessionsResult, plannedResult] = await Promise.all([
      supabase
        .from('integration_accounts')
        .select('provider,status,scopes,external_user_id,last_synced_at,last_error,metadata')
        .eq('user_id', currentUser.id)
        .in('provider', ['strava', 'garmin', 'trainingpeaks']),
      supabase
        .from('training_sessions')
        .select('id,provider,title,sport,started_at,duration_seconds,distance_m,avg_hr,avg_power')
        .eq('athlete_id', currentUser.id)
        .in('provider', ['strava', 'garmin'])
        .order('started_at', { ascending: false })
        .limit(8),
      supabase
        .from('planned_workouts')
        .select('id,title,sport,planned_start,duration_seconds,distance_m')
        .eq('athlete_id', currentUser.id)
        .eq('provider', 'trainingpeaks')
        .gte('planned_start', new Date(Date.now() - 86400000).toISOString())
        .order('planned_start', { ascending: true })
        .limit(8),
    ]);

    const accounts = (accountsResult.data ?? []) as Array<IntegrationAccount & { provider: string }>;
    setStravaAccount(accounts.find((a) => a.provider === 'strava') ?? null);
    setGarminAccount(accounts.find((a) => a.provider === 'garmin') ?? null);
    setTrainingPeaksAccount(accounts.find((a) => a.provider === 'trainingpeaks') ?? null);
    setSessions((sessionsResult.data as TrainingSession[] | null) ?? []);
    setPlannedWorkouts((plannedResult.data as PlannedWorkout[] | null) ?? []);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const current = data.user ?? null;
      setUser(current);
      if (current) await load(current);

      const query = new URLSearchParams(window.location.search);
      const strava = query.get('strava');
      if (strava === 'connected') setMessage('Strava quedó conectado. Ahora podemos importar tus actividades automáticamente.');
      if (strava === 'denied') setMessage('La autorización de Strava fue cancelada. No se modificó nada.');
      setLoading(false);
    });
  }, [load]);

  async function connectStrava() {
    if (!user) return;
    setConnecting(true);
    setMessage('');

    const { data, error } = await supabase
      .from('integration_oauth_states')
      .insert({ user_id: user.id, provider: 'strava', redirect_path: '/integrations' })
      .select('state')
      .single();

    if (error || !data?.state) {
      setMessage(error?.message ?? 'No pude iniciar la autorización con Strava.');
      setConnecting(false);
      return;
    }

    const params = new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      redirect_uri: STRAVA_CALLBACK,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read_all',
      state: data.state,
    });

    window.location.assign(`https://www.strava.com/oauth/authorize?${params.toString()}`);
  }

  async function syncStrava() {
    if (!user) return;
    setSyncing(true);
    setMessage('');

    const { data, error } = await supabase.functions.invoke('strava-sync', {
      body: { days: 30 },
    });

    if (error) setMessage(error.message);
    else if (data?.error) setMessage(data.error);
    else {
      setMessage(`Strava sincronizado: ${data?.synced ?? 0} actividades procesadas.`);
      await load(user);
    }
    setSyncing(false);
  }

  async function syncTrainingPeaks() {
    if (!user) return;
    setSyncingTrainingPeaks(true);
    setMessage('');

    const body = trainingPeaksUrl.trim() ? { calendar_url: trainingPeaksUrl.trim() } : {};
    const { data, error } = await supabase.functions.invoke('trainingpeaks-calendar-sync', { body });

    if (error) setMessage(error.message);
    else if (data?.error) setMessage(data.error);
    else {
      setMessage(`TrainingPeaks sincronizado: ${data?.synced ?? 0} entrenamientos planificados.`);
      setTrainingPeaksUrl('');
      await load(user);
    }
    setSyncingTrainingPeaks(false);
  }

  if (loading) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Cargando integraciones…</p></div></main>;
  if (!user) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Primero inicia sesión.</p><Link href="/">Volver</Link></div></main>;

  const stravaConnected = stravaAccount?.status === 'connected';
  const garminConnected = garminAccount?.status === 'connected';
  const trainingPeaksConnected = trainingPeaksAccount?.status === 'connected';
  const garminSessions = sessions.filter((s) => s.provider === 'garmin');
  const stravaSessions = sessions.filter((s) => s.provider === 'strava');

  return (
    <main className="shell narrow">
      <header className="topbar">
        <div>
          <span className="eyebrow">PEPPE · INTEGRACIONES</span>
          <h1>Conecta tus fuentes de datos.</h1>
          <p className="muted">Peppe combina el plan, lo que realmente hiciste y tu recuperación para preguntarte sólo lo que falta.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="ghost link-button" href="/settings">Rutina</Link>
          <Link className="ghost link-button" href="/">Inicio</Link>
        </div>
      </header>

      <section className="card">
        <span className="eyebrow">ENTRENAMIENTO REALIZADO · FUENTE PRINCIPAL</span>
        <h2>Garmin + Fitness AI Connector</h2>
        <p className="muted">Actividad del Forerunner, frecuencia cardíaca y datos diarios de sueño, HRV, estrés y recuperación disponibles a través del puente Garmin.</p>
        <div className="summary-grid" style={{ marginTop: 20 }}>
          <div><span>Estado</span><strong>{garminConnected ? 'Conectado ✓' : 'Pendiente'}</strong></div>
          <div><span>Puente</span><strong>{String(garminAccount?.metadata?.connector ?? 'Fitness AI Connector')}</strong></div>
          <div><span>Última sincronización</span><strong>{formatSync(garminAccount?.last_synced_at)}</strong></div>
          <div><span>Permisos</span><strong>{garminAccount?.scopes?.join(', ') || '—'}</strong></div>
        </div>
        {garminAccount?.last_error && <div className="notice">Último error: {garminAccount.last_error}</div>}
      </section>

      {garminSessions.length > 0 && (
        <section className="card">
          <span className="eyebrow">GARMIN → PEPPE</span>
          <h2>Últimas actividades Garmin</h2>
          <div className="nutrition-history">
            {garminSessions.map((session) => (
              <p key={session.id}>
                <strong>{session.title || session.sport || 'Actividad'}</strong> · {formatDistance(session.distance_m)} · {formatDuration(session.duration_seconds)}
                {session.avg_hr ? ` · FC ${Math.round(session.avg_hr)}` : ''}
                {session.avg_power ? ` · ${Math.round(session.avg_power)} W` : ''}
              </p>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <span className="eyebrow">PLAN DE ENTRENAMIENTO</span>
        <h2>TrainingPeaks</h2>
        <p className="muted">Peppe usa TrainingPeaks para saber qué estaba planificado y después lo compara con lo realmente ejecutado en Garmin.</p>
        <div className="summary-grid" style={{ marginTop: 20 }}>
          <div><span>Estado</span><strong>{trainingPeaksConnected ? 'Conectado ✓' : 'No conectado'}</strong></div>
          <div><span>Modo actual</span><strong>Calendar Export</strong></div>
          <div><span>Última sincronización</span><strong>{formatSync(trainingPeaksAccount?.last_synced_at)}</strong></div>
          <div><span>API oficial</span><strong>En proceso de partner</strong></div>
        </div>

        {!trainingPeaksConnected && (
          <div style={{ marginTop: 20 }}>
            <label className="field-label" htmlFor="trainingpeaks-calendar">TrainingPeaks Calendar Export URL</label>
            <input
              id="trainingpeaks-calendar"
              className="input"
              type="url"
              value={trainingPeaksUrl}
              onChange={(event) => setTrainingPeaksUrl(event.target.value)}
              placeholder="https://…"
              autoComplete="off"
            />
            <p className="muted" style={{ marginTop: 8 }}>En TrainingPeaks: Settings → Calendar → copia el enlace de Calendar Export. Peppe lo guarda como secreto.</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
          <button className="primary" onClick={syncTrainingPeaks} disabled={syncingTrainingPeaks || (!trainingPeaksConnected && !trainingPeaksUrl.trim())}>
            {syncingTrainingPeaks ? 'Sincronizando…' : trainingPeaksConnected ? 'Sincronizar TrainingPeaks' : 'Conectar TrainingPeaks'}
          </button>
        </div>
      </section>

      {plannedWorkouts.length > 0 && (
        <section className="card">
          <span className="eyebrow">TRAININGPEAKS → PEPPE</span>
          <h2>Próximos entrenamientos</h2>
          <div className="nutrition-history">
            {plannedWorkouts.map((workout) => (
              <p key={workout.id}>
                <strong>{workout.title}</strong> · {new Date(workout.planned_start).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' })}
                {workout.sport ? ` · ${workout.sport}` : ''}
                {workout.distance_m ? ` · ${formatDistance(workout.distance_m)}` : ''}
                {workout.duration_seconds ? ` · ${formatDuration(workout.duration_seconds)}` : ''}
              </p>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <span className="eyebrow">ENTRENAMIENTO COMPLEMENTARIO</span>
        <h2>Strava</h2>
        <p className="muted">Se mantiene como fuente complementaria para trazabilidad y actividades externas a Garmin.</p>
        <div className="summary-grid" style={{ marginTop: 20 }}>
          <div><span>Estado</span><strong>{stravaConnected ? 'Conectado ✓' : 'No conectado'}</strong></div>
          <div><span>Atleta Strava</span><strong>{stravaAccount?.external_user_id ?? '—'}</strong></div>
          <div><span>Última sincronización</span><strong>{formatSync(stravaAccount?.last_synced_at)}</strong></div>
          <div><span>Permisos</span><strong>{stravaAccount?.scopes?.join(', ') || '—'}</strong></div>
        </div>
        {stravaAccount?.last_error && <div className="notice">Último error: {stravaAccount.last_error}</div>}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
          {!stravaConnected && <button className="primary" onClick={connectStrava} disabled={connecting}>{connecting ? 'Abriendo Strava…' : 'Conectar Strava'}</button>}
          {stravaConnected && <button className="ghost" onClick={syncStrava} disabled={syncing}>{syncing ? 'Sincronizando…' : 'Sincronizar Strava'}</button>}
          {stravaConnected && <button className="ghost" onClick={connectStrava} disabled={connecting}>Reautorizar permisos</button>}
        </div>
      </section>

      {stravaSessions.length > 0 && (
        <section className="card">
          <span className="eyebrow">STRAVA → PEPPE</span>
          <h2>Últimas actividades Strava</h2>
          <div className="nutrition-history">
            {stravaSessions.slice(0, 3).map((session) => (
              <p key={session.id}>
                <strong>{session.title || session.sport || 'Actividad'}</strong> · {formatDistance(session.distance_m)} · {formatDuration(session.duration_seconds)}
              </p>
            ))}
          </div>
        </section>
      )}

      <section className="grid scores">
        <article className="card score"><span>Garmin</span><strong>{garminConnected ? 'Activo ✓' : 'Pendiente'}</strong><small>Actividad, sueño, HRV, FC reposo, estrés y recuperación.</small></article>
        <article className="card score"><span>TrainingPeaks</span><strong>{trainingPeaksConnected ? 'Activo ✓' : 'Conectar'}</strong><small>Plan semanal y entrenamientos programados.</small></article>
        <article className="card score"><span>Libre / glucosa</span><strong>En desarrollo</strong><small>Glucosa y tendencia para cruzar energía con la sesión.</small></article>
        <article className="card score"><span>COROS</span><strong>Opcional</strong><small>Fuente alternativa para actividad, carga y recuperación.</small></article>
      </section>

      {message && <div className="notice">{message}</div>}

      <section className="card study-explainer">
        <span className="eyebrow">MOTOR PEPPE</span>
        <h2>Plan → ejecución → respuesta.</h2>
        <p>TrainingPeaks dice qué debía ocurrir. Garmin muestra qué ocurrió realmente. Peppe cruza ambos con sueño, HRV, glucosa, molestias, nutrición y clima para decidir qué hacer después sin volver a pedir datos que ya existen.</p>
      </section>
    </main>
  );
}
