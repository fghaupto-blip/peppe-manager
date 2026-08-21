import { Platform } from 'react-native';
import { supabase } from './supabase';

const APPLE_HEALTH_PROVIDER = 'apple_health';

const READ_TYPES = [
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierBodyMassIndex',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierBloodGlucose',
] as const;

export type AppleHealthSnapshot = {
  weightKg: number | null;
  bodyFatPct: number | null;
  bmi: number | null;
  restingHrBpm: number | null;
  hrvMs: number | null;
  glucoseMgDl: number | null;
  glucoseMeasuredAt: string | null;
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getHealthKit() {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple Health sólo está disponible en iPhone.');
  }
  return import('@kingstinct/react-native-healthkit');
}

export async function connectAppleHealth(athleteId: string) {
  const healthKit = await getHealthKit();

  if (!healthKit.isHealthDataAvailable()) {
    throw new Error('HealthKit no está disponible en este dispositivo.');
  }

  await healthKit.requestAuthorization({
    toRead: [...READ_TYPES],
  });

  const { error } = await supabase.from('integrations').upsert(
    {
      athlete_id: athleteId,
      provider: APPLE_HEALTH_PROVIDER,
      status: 'connected',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'athlete_id,provider' },
  );

  if (error) throw error;
  return true;
}

export async function syncAppleHealth(athleteId: string): Promise<AppleHealthSnapshot> {
  const healthKit = await getHealthKit();

  if (!healthKit.isHealthDataAvailable()) {
    throw new Error('HealthKit no está disponible en este dispositivo.');
  }

  // No volvemos a abrir la hoja de permisos durante cada sync. El usuario
  // conecta Apple Health explícitamente desde la pantalla Conexiones.
  const [weight, bodyFat, bmi, restingHr, hrv, glucose] = await Promise.all([
    healthKit.getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg').catch(() => undefined),
    healthKit.getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyFatPercentage', '%').catch(() => undefined),
    healthKit.getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyMassIndex', 'count').catch(() => undefined),
    healthKit.getMostRecentQuantitySample('HKQuantityTypeIdentifierRestingHeartRate', 'count/min').catch(() => undefined),
    healthKit.getMostRecentQuantitySample('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms').catch(() => undefined),
    healthKit.getMostRecentQuantitySample('HKQuantityTypeIdentifierBloodGlucose', 'mg/dL').catch(() => undefined),
  ]);

  const snapshot: AppleHealthSnapshot = {
    weightKg: weight?.quantity ?? null,
    bodyFatPct: bodyFat?.quantity ?? null,
    bmi: bmi?.quantity ?? null,
    restingHrBpm: restingHr?.quantity ?? null,
    hrvMs: hrv?.quantity ?? null,
    glucoseMgDl: glucose?.quantity ?? null,
    glucoseMeasuredAt: glucose?.startDate ? new Date(glucose.startDate).toISOString() : null,
  };

  const hasDailyMetrics = [
    snapshot.weightKg,
    snapshot.bodyFatPct,
    snapshot.bmi,
    snapshot.restingHrBpm,
    snapshot.hrvMs,
  ].some((value) => value != null);

  if (hasDailyMetrics) {
    const metricDate = localDateKey();
    const { data: existing } = await supabase
      .from('daily_metrics')
      .select('weight_kg,body_fat_pct,bmi,resting_hr_bpm,hrv_ms')
      .eq('athlete_id', athleteId)
      .eq('metric_date', metricDate)
      .eq('source', APPLE_HEALTH_PROVIDER)
      .maybeSingle();

    const { error } = await supabase.from('daily_metrics').upsert(
      {
        athlete_id: athleteId,
        metric_date: metricDate,
        weight_kg: snapshot.weightKg ?? existing?.weight_kg ?? null,
        body_fat_pct: snapshot.bodyFatPct ?? existing?.body_fat_pct ?? null,
        bmi: snapshot.bmi ?? existing?.bmi ?? null,
        resting_hr_bpm: snapshot.restingHrBpm ?? existing?.resting_hr_bpm ?? null,
        hrv_ms: snapshot.hrvMs ?? existing?.hrv_ms ?? null,
        source: APPLE_HEALTH_PROVIDER,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'athlete_id,metric_date,source' },
    );
    if (error) throw error;
  }

  if (snapshot.glucoseMgDl != null && snapshot.glucoseMeasuredAt) {
    const { error } = await supabase.from('glucose_readings').upsert(
      {
        athlete_id: athleteId,
        measured_at: snapshot.glucoseMeasuredAt,
        glucose_mg_dl: snapshot.glucoseMgDl,
        trend: 'unknown',
        source: APPLE_HEALTH_PROVIDER,
        notes: 'Sincronizado desde Apple Health',
      },
      { onConflict: 'athlete_id,measured_at,source' },
    );
    if (error) throw error;
  }

  const syncedAt = new Date().toISOString();
  const { error: integrationError } = await supabase.from('integrations').upsert(
    {
      athlete_id: athleteId,
      provider: APPLE_HEALTH_PROVIDER,
      status: 'connected',
      last_synced_at: syncedAt,
      updated_at: syncedAt,
    },
    { onConflict: 'athlete_id,provider' },
  );

  if (integrationError) throw integrationError;
  return snapshot;
}
