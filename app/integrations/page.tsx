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
};

type TrainingSession = {
  id: string;
  title: string | null;
  sport: string | null;
  started_at: string;
  duration_seconds: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  avg_power: number | null;
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

export default function IntegrationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<IntegrationAccount | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async (currentUser: User) => {
    const [{ data: accountData }, { data: sessionData }] = await Promise.all([
      supabase
        .from('integration_accounts')
        .select('status,scopes,external_user_id,last_synced_at,last_error')
        .eq('user_id', currentUser.id)
        .eq('provider', 'strava')
        .maybeSingle(),
      supabase
        .from('training_sessions')
        .select('id,title,sport,started_at,duration_seconds,distance_m,avg_hr,avg_power')
        .eq('athlete_id', currentUser.id)
        .eq('provider', 'strava')
        .order('started_at', { ascending: false })
        .limit(3),
    ]);

    setAccount((accountData as IntegrationAccount | null) ?? null);
    setSessions((sessionData as TrainingSession[] | null) ?? []);
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

    if (error) {
      setMessage(error.message);
    } else if (data?.error) {
      setMessage(data.error);
    } else {
      setMessage(`Sincronización lista: ${data?.synced ?? 0} actividades procesadas.`);
      await load(user);
    }
    setSyncing(false);
  }

  if (loading) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Cargando integraciones…</p></div></main>;
  if (!user) return <main className="center-screen"><div className="loader-card"><strong>PEPPE</strong><p>Primero inicia sesión.</p><Link href="/">Volver</Link></div></main>;

  const connected = account?.status === 'connected';

  return (
    <main className="shell narrow">
      <header className="topbar">
        <div>
          <span className="eyebrow">PEPPE · INTEGRACIONES</span>
          <h1>Conecta tus fuentes de datos.</h1>
          <p className="muted">Peppe usa cada fuente para completar automáticamente lo que ya sabe y preguntarte sólo lo que falta.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="ghost link-button" href="/settings">Rutina</Link>
          <Link className="ghost link-button" href="/">Inicio</Link>
        </div>
      </header>

      <section className="card">
        <span className="eyebrow">ENTRENAMIENTO REALIZADO</span>
        <h2>Strava</h2>
        <p className="muted">Distancia, duración, ritmo, frecuencia cardíaca, potencia, desnivel y otras métricas disponibles.</p>

        <div className="summary-grid" style={{ marginTop: 20 }}>
          <div><span>Estado</span><strong>{connected ? 'Conectado ✓' : 'No conectado'}</strong></div>
          <div><span>Atleta Strava</span><strong>{account?.external_user_id ?? '—'}</strong></div>
          <div><span>Última sincronización</span><strong>{account?.last_synced_at ? new Date(account.last_synced_at).toLocaleString('es-CL') : '—'}</strong></div>
          <div><span>Permisos</span><strong>{account?.scopes?.join(', ') || '—'}</strong></div>
        </div>

        {account?.last_error && <div className="notice">Último error: {account.last_error}</div>}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
          {!connected && <button className="primary" onClick={connectStrava} disabled={connecting}>{connecting ? 'Abriendo Strava…' : 'Conectar Strava'}</button>}
          {connected && <button className="primary" onClick={syncStrava} disabled={syncing}>{syncing ? 'Sincronizando…' : 'Sincronizar últimos 30 días'}</button>}
          {connected && <button className="ghost" onClick={connectStrava} disabled={connecting}>Reautorizar permisos</button>}
        </div>
      </section>

      {sessions.length > 0 && (
        <section className="card">
          <span className="eyebrow">STRAVA → PEPPE</span>
          <h2>Últimas actividades importadas</h2>
          <div className="nutrition-history">
            {sessions.map((session) => (
              <p key={session.id}>
                <strong>{session.title || session.sport || 'Actividad'}</strong> · {formatDistance(session.distance_m)} · {formatDuration(session.duration_seconds)}
                {session.avg_hr ? ` · FC ${Math.round(session.avg_hr)}` : ''}
                {session.avg_power ? ` · ${Math.round(session.avg_power)} W` : ''}
              </p>
            ))}
          </div>
        </section>
      )}

      <section className="grid scores">
        <article className="card score"><span>Garmin</span><strong>Próximo</strong><small>Sueño, HRV, FC reposo, recuperación y actividad.</small></article>
        <article className="card score"><span>TrainingPeaks</span><strong>Próximo</strong><small>Plan semanal y entrenamientos programados.</small></article>
        <article className="card score"><span>COROS</span><strong>Próximo</strong><small>Actividad, carga y recuperación.</small></article>
        <article className="card score"><span>Libre / glucosa</span><strong>En estudio</strong><small>Glucosa y tendencia cuando exista una vía de integración adecuada.</small></article>
      </section>

      {message && <div className="notice">{message}</div>}

      <section className="card study-explainer">
        <span className="eyebrow">OBJETIVO PEPPE</span>
        <h2>Menos formularios. Más contexto automático.</h2>
        <p>Cuando Strava entregue el entrenamiento, Peppe no volverá a preguntarte distancia, duración, ritmo o frecuencia cardíaca. La conversación se concentrará en sensaciones, dolor, hambre, alimentación y recuperación.</p>
      </section>
    </main>
  );
}
