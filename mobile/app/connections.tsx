import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { connectAppleHealth, syncAppleHealth, type AppleHealthSnapshot } from '../lib/healthkit';
import { colors } from '../lib/theme';

type IntegrationRow = {
  provider: string;
  status: string;
  last_synced_at: string | null;
};

type ProviderCard = {
  provider: string;
  title: string;
  description: string;
  badge: string;
};

const PROVIDERS: ProviderCard[] = [
  {
    provider: 'apple_health',
    title: 'Apple Health',
    description: 'Peso, grasa, BMI, HRV, frecuencia en reposo y glucosa disponible en HealthKit.',
    badge: 'iPhone · activo',
  },
  {
    provider: 'garmin',
    title: 'Garmin Connect',
    description: 'Health + actividades. Se conectará por OAuth desde el backend cuando tengamos credenciales Garmin.',
    badge: 'API directa · próxima',
  },
  {
    provider: 'trainingpeaks',
    title: 'TrainingPeaks',
    description: 'Plan del entrenador, calendario, zonas y contexto de la carga planificada.',
    badge: 'API directa · próxima',
  },
  {
    provider: 'strava',
    title: 'Strava',
    description: 'Conexión separada para funciones permitidas. La API no alimentará el motor de IA de Peppe.',
    badge: 'Uso limitado · próxima',
  },
];

function formatSync(value: string | null) {
  if (!value) return 'Todavía sin sincronización';
  return `Última sincronización: ${new Date(value).toLocaleString()}`;
}

function openEvidence(provider: string, type: 'training_screenshot' | 'daily_screenshot') {
  router.push(`/evidence?provider=${provider}&type=${type}` as Href);
}

export default function ConnectionsScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [snapshot, setSnapshot] = useState<AppleHealthSnapshot | null>(null);

  const integrationMap = useMemo(() => new Map(rows.map((row) => [row.provider, row])), [rows]);

  async function loadIntegrations(userId: string) {
    const { data, error } = await supabase
      .from('integrations')
      .select('provider,status,last_synced_at')
      .eq('athlete_id', userId);
    if (error) throw error;
    setRows((data as IntegrationRow[]) ?? []);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadIntegrations(data.session.user.id).catch((error) => setMessage(error.message));
    });
  }, []);

  async function handleAppleConnect() {
    if (!session) return;
    setBusy(true);
    setMessage('Abriendo permisos de Apple Health…');
    try {
      await connectAppleHealth(session.user.id);
      await loadIntegrations(session.user.id);
      setMessage('Apple Health quedó vinculado a Peppe. Ahora puedes sincronizar.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo conectar Apple Health.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAppleSync() {
    if (!session) return;
    setBusy(true);
    setMessage('Sincronizando datos disponibles…');
    try {
      const nextSnapshot = await syncAppleHealth(session.user.id);
      setSnapshot(nextSnapshot);
      await loadIntegrations(session.user.id);
      setMessage('Sincronización terminada. Peppe guardó sólo los datos disponibles y autorizados.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo sincronizar Apple Health.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>PEPPE · CONEXIONES</Text>
        <Text style={styles.title}>Tus datos, en un solo contexto.</Text>
        <Text style={styles.heroText}>
          Conecta cada fuente una vez. Mientras una API aún no esté habilitada, puedes subir un pantallazo para que Peppe conserve esa evidencia y luego la procese con análisis visual.
        </Text>
      </View>

      {PROVIDERS.map((provider) => {
        const current = integrationMap.get(provider.provider);
        const isApple = provider.provider === 'apple_health';
        const connected = current?.status === 'connected';
        return (
          <View key={provider.provider} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>{provider.title}</Text>
                <Text style={styles.badge}>{provider.badge}</Text>
              </View>
              <Text style={[styles.status, connected && styles.statusConnected]}>
                {connected ? 'Conectado' : 'No conectado'}
              </Text>
            </View>
            <Text style={styles.body}>{provider.description}</Text>
            {current && <Text style={styles.syncText}>{formatSync(current.last_synced_at)}</Text>}

            {isApple ? (
              <View style={styles.actions}>
                <Pressable
                  disabled={busy || Platform.OS !== 'ios'}
                  style={[styles.primary, (busy || Platform.OS !== 'ios') && styles.disabled]}
                  onPress={handleAppleConnect}
                >
                  <Text style={styles.primaryText}>{connected ? 'Revisar permisos' : 'Conectar Apple Health'}</Text>
                </Pressable>
                {connected && (
                  <Pressable disabled={busy} style={[styles.secondary, busy && styles.disabled]} onPress={handleAppleSync}>
                    <Text style={styles.secondaryText}>Sincronizar ahora</Text>
                  </Pressable>
                )}
                <Pressable style={styles.secondary} onPress={() => openEvidence('apple_health', 'daily_screenshot')}>
                  <Text style={styles.secondaryText}>Subir pantallazo de Salud</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.manualBridge}>
                <Text style={styles.pendingText}>API pendiente. Mientras tanto puedes cargar la información manualmente con un pantallazo.</Text>
                <Pressable style={styles.primary} onPress={() => openEvidence(provider.provider, 'training_screenshot')}>
                  <Text style={styles.primaryText}>Subir pantallazo de entrenamiento</Text>
                </Pressable>
                <Pressable style={styles.secondary} onPress={() => openEvidence(provider.provider, 'daily_screenshot')}>
                  <Text style={styles.secondaryText}>Subir pantallazo del día / salud</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      {!!message && <View style={styles.messageBox}><Text style={styles.message}>{message}</Text></View>}

      {snapshot && (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>ÚLTIMO SNAPSHOT APPLE HEALTH</Text>
          <View style={styles.metricGrid}>
            <Metric label="Peso" value={snapshot.weightKg == null ? '—' : `${snapshot.weightKg.toFixed(1)} kg`} />
            <Metric label="Grasa" value={snapshot.bodyFatPct == null ? '—' : `${snapshot.bodyFatPct.toFixed(1)} %`} />
            <Metric label="BMI" value={snapshot.bmi == null ? '—' : snapshot.bmi.toFixed(1)} />
            <Metric label="HRV" value={snapshot.hrvMs == null ? '—' : `${Math.round(snapshot.hrvMs)} ms`} />
            <Metric label="FC reposo" value={snapshot.restingHrBpm == null ? '—' : `${Math.round(snapshot.restingHrBpm)} bpm`} />
            <Metric label="Glucosa" value={snapshot.glucoseMgDl == null ? '—' : `${Math.round(snapshot.glucoseMgDl)} mg/dL`} />
          </View>
        </View>
      )}

      <View style={styles.note}>
        <Text style={styles.noteTitle}>Privacidad por diseño</Text>
        <Text style={styles.body}>
          Las imágenes y pantallazos se guardan de forma privada por usuario. Sólo los datos confirmados deberían convertirse en métricas del atleta.
        </Text>
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 60, gap: 14 },
  hero: { paddingTop: 10, gap: 8, marginBottom: 4 },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -1 },
  heroText: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.line, gap: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cardHeaderText: { flex: 1, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
  badge: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  status: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden', backgroundColor: colors.soft, color: colors.muted, fontSize: 11, fontWeight: '900' },
  statusConnected: { backgroundColor: colors.success, color: '#176B3A' },
  body: { color: colors.muted, lineHeight: 21 },
  syncText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  actions: { gap: 9, marginTop: 4 },
  manualBridge: { backgroundColor: colors.soft, borderRadius: 14, padding: 13, gap: 9, marginTop: 4 },
  primary: { backgroundColor: colors.dark, borderRadius: 12, padding: 14, alignItems: 'center' },
  primaryText: { color: 'white', fontWeight: '900', textAlign: 'center' },
  secondary: { borderWidth: 1, borderColor: colors.line, backgroundColor: 'white', borderRadius: 12, padding: 13, alignItems: 'center' },
  secondaryText: { color: colors.text, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  pendingText: { color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  messageBox: { backgroundColor: colors.warning, borderRadius: 14, padding: 14 },
  message: { color: colors.text, lineHeight: 20, fontWeight: '700' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  metric: { width: '48%', backgroundColor: colors.soft, borderRadius: 13, padding: 12 },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  metricValue: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
  note: { backgroundColor: colors.dark, borderRadius: 18, padding: 18, gap: 7 },
  noteTitle: { color: 'white', fontSize: 18, fontWeight: '900' },
});
