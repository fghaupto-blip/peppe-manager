import * as Location from 'expo-location';
import { supabase } from './supabase';

export type PeppeContextSnapshot = {
  id?: string;
  capturedAt: string;
  locality: string | null;
  region: string | null;
  country: string | null;
  timezone: string;
  latitudeRounded: number | null;
  longitudeRounded: number | null;
  accuracyM: number | null;
  isApproximate: boolean;
};

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

function timezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

async function captureGrantedLocation(athleteId: string): Promise<PeppeContextSnapshot | null> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) return null;

  let position = await Location.getLastKnownPositionAsync({
    maxAge: 10 * 60 * 1000,
    requiredAccuracy: 5000,
  });

  if (!position) {
    position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });
  }

  const latitudeRounded = roundCoordinate(position.coords.latitude);
  const longitudeRounded = roundCoordinate(position.coords.longitude);
  const addresses = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  }).catch(() => []);
  const address = addresses[0];
  const capturedAt = new Date(position.timestamp || Date.now()).toISOString();

  const row = {
    athlete_id: athleteId,
    captured_at: capturedAt,
    source: 'mobile_app_open',
    permission_scope: 'foreground',
    latitude_rounded: latitudeRounded,
    longitude_rounded: longitudeRounded,
    accuracy_m: position.coords.accuracy ?? null,
    is_approximate: true,
    locality: address?.city ?? address?.district ?? address?.subregion ?? null,
    region: address?.region ?? null,
    country: address?.country ?? null,
    timezone: timezone(),
    context: {
      altitude_m: position.coords.altitude ?? null,
      speed_m_s: position.coords.speed ?? null,
    },
  };

  const { data, error } = await supabase
    .from('context_snapshots')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;

  return {
    id: data.id,
    capturedAt,
    locality: row.locality,
    region: row.region,
    country: row.country,
    timezone: row.timezone,
    latitudeRounded,
    longitudeRounded,
    accuracyM: row.accuracy_m,
    isApproximate: true,
  };
}

export async function captureContextIfAuthorized(athleteId: string) {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') return null;
  return captureGrantedLocation(athleteId);
}

export async function requestAndCaptureContext(athleteId: string) {
  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    permission = await Location.requestForegroundPermissionsAsync();
  }
  if (permission.status !== 'granted') {
    return { granted: false as const, snapshot: null };
  }
  const snapshot = await captureGrantedLocation(athleteId);
  return { granted: true as const, snapshot };
}
