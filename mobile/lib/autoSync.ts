import { Platform } from 'react-native';
import { captureContextIfAuthorized } from './context';
import { syncAppleHealth } from './healthkit';
import { buildPeppeSnapshot } from './intelligence';
import { supabase } from './supabase';

export type PeppeAutoSyncResult = {
  startedAt: string;
  finishedAt: string;
  appleHealth: 'synced' | 'not_connected' | 'unsupported' | 'error';
  context: 'captured' | 'not_authorized' | 'error';
  intelligence: 'updated' | 'error';
};

let inFlight: Promise<PeppeAutoSyncResult> | null = null;
let lastStartedAt = 0;

const MIN_INTERVAL_MS = 15_000;

async function performAutoSync(athleteId: string): Promise<PeppeAutoSyncResult> {
  const startedAt = new Date().toISOString();

  let appleHealth: PeppeAutoSyncResult['appleHealth'] = Platform.OS === 'ios' ? 'not_connected' : 'unsupported';
  let context: PeppeAutoSyncResult['context'] = 'not_authorized';
  let intelligence: PeppeAutoSyncResult['intelligence'] = 'error';

  const integrationPromise = supabase
    .from('integrations')
    .select('provider,status')
    .eq('athlete_id', athleteId)
    .eq('status', 'connected');

  const contextPromise = captureContextIfAuthorized(athleteId)
    .then((snapshot) => {
      context = snapshot ? 'captured' : 'not_authorized';
    })
    .catch(() => {
      context = 'error';
    });

  const { data: integrations } = await integrationPromise;
  const appleConnected = (integrations ?? []).some((row) => row.provider === 'apple_health');

  const healthPromise = Platform.OS === 'ios' && appleConnected
    ? syncAppleHealth(athleteId)
        .then(() => {
          appleHealth = 'synced';
        })
        .catch(() => {
          appleHealth = 'error';
        })
    : Promise.resolve();

  await Promise.all([contextPromise, healthPromise]);

  // El Snapshot se construye después de las fuentes automáticas para que la
  // recomendación use la información más reciente disponible. Los datos
  // históricos/manuales permanecen en sus tablas de origen y no se borran.
  await buildPeppeSnapshot(athleteId, true)
    .then(() => {
      intelligence = 'updated';
    })
    .catch(() => {
      intelligence = 'error';
    });

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    appleHealth,
    context,
    intelligence,
  };
}

export function runPeppeAutoSync(athleteId: string, force = false) {
  const now = Date.now();

  if (inFlight) return inFlight;
  if (!force && now - lastStartedAt < MIN_INTERVAL_MS) return Promise.resolve(null);

  lastStartedAt = now;
  inFlight = performAutoSync(athleteId).finally(() => {
    inFlight = null;
  });

  return inFlight;
}
