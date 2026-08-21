import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { buildPeppeSnapshot, type PeppeIntelligenceSnapshot } from '../lib/intelligence';
import { captureContextIfAuthorized, requestAndCaptureContext } from '../lib/context';
import { colors } from '../lib/theme';

export default function SummaryScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [snapshot, setSnapshot] = useState<PeppeIntelligenceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function load(userId: string, persist = true) {
    setLoading(true);
    setMessage('');
    try {
      await captureContextIfAuthorized(userId).catch(() => null);
      const next = await buildPeppeSnapshot(userId, persist);
      setSnapshot(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo construir el resumen.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) load(data.session.user.id);
      else setLoading(false);
    });
  }, []);

  async function enableLocation() {
    if (!session) return;
    setLoading(true);
    try {
      const result = await requestAndCaptureContext(session.user.id);
      if (!result.granted) {
        setMessage('Ubicación no autorizada. Peppe seguirá funcionando sin ella.');
        return;
      }
      await load(session.user.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo activar el contexto de ubicación.');
    } finally {
      setLoading(false);
    }
  }

  if (loading && !snapshot) {
    return <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Construyendo tu foto del momento…</Text></View>;
  }

  if (!snapshot) {
    return <View style={styles.center}><Text style={styles.title}>Resumen no disponible</Text><Text style={styles.muted}>{message || 'Inicia sesión para continuar.'}</Text></View>;
  }

  const stateLabel = snapshot.state === 'favorable' ? 'Favorable' : snapshot.state === 'attention' ? 'Atención' : 'Contexto incompleto';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroTextWrap}>
            <Text style={styles.eyebrow}>PEPPE · RESUMEN INTELIGENTE</Text>
            <Text style={styles.title}>{snapshot.headline}</Text>
          </View>
          <View style={styles.statePill}><Text style={styles.stateText}>{stateLabel}</Text></View>
        </View>
        <Text style={styles.heroBody}>{snapshot.explanation}</Text>
        <View style={styles.confidenceRow}>
          <View><Text style={styles.metricLabel}>Contexto completo</Text><Text style={styles.metricValue}>{Math.round(snapshot.completeness)}%</Text></View>
          <View><Text style={styles.metricLabel}>Confianza Peppe</Text><Text style={styles.metricValue}>{Math.round(snapshot.confidence)}%</Text></View>
        </View>
      </View>

      <View style={styles.scoreGrid}>
        <Score label="Readiness" value={snapshot.scores.readiness} />
        <Score label="Fuel" value={snapshot.scores.fuel} />
        <Score label="Recovery" value={snapshot.scores.recovery} />
        <Score label="Load" value={snapshot.scores.load} />
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>QUÉ HACER AHORA</Text>
        <Text style={styles.cardTitle}>{snapshot.recommendationNow}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>COMPARADO CONTIGO</Text>
        <Text style={styles.cardTitle}>{snapshot.comparison}</Text>
        <Text style={styles.muted}>La referencia principal es tu propia historia. Los ciclos comparables ganarán peso a medida que Peppe acumule más momentos.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>OBJETIVO</Text>
        <Text style={styles.cardTitle}>{snapshot.goal || 'Todavía no hay un objetivo de mediano plazo definido.'}</Text>
        <Text style={styles.muted}>Este objetivo será el marco para interpretar carga, nutrición, recuperación y tendencia.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>CONTEXTO</Text>
        <Text style={styles.cardTitle}>{snapshot.locationLabel || 'Ubicación contextual no activa'}</Text>
        <Text style={styles.muted}>Peppe usa ubicación sólo como contexto: viaje, zona horaria y entorno. No necesita seguimiento continuo.</Text>
        {!snapshot.locationLabel && (
          <Pressable style={styles.primary} onPress={enableLocation} disabled={loading}>
            <Text style={styles.primaryText}>{loading ? 'Activando…' : 'Activar contexto de ubicación'}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.nextCard}>
        <Text style={styles.eyebrowLight}>PRÓXIMA PREGUNTA DE MAYOR VALOR</Text>
        <Text style={styles.nextTitle}>{snapshot.nextQuestion}</Text>
        <Text style={styles.nextBody}>Peppe pregunta lo mínimo necesario para aumentar la calidad de la decisión, no para completar un formulario fijo.</Text>
      </View>

      {!!message && <View style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View>}

      <Pressable style={styles.refresh} onPress={() => session && load(session.user.id)} disabled={loading}>
        <Text style={styles.refreshText}>{loading ? 'Actualizando…' : 'Actualizar foto del momento'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.scoreCard}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <Text style={styles.scoreValue}>{value == null ? '—' : Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 60, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10, backgroundColor: colors.bg },
  hero: { backgroundColor: colors.dark, borderRadius: 24, padding: 22, gap: 14 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  heroTextWrap: { flex: 1 },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  eyebrowLight: { color: '#AEB8C9', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: 'white', fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8, marginTop: 6 },
  heroBody: { color: '#C4CDDA', lineHeight: 22, fontSize: 15 },
  statePill: { alignSelf: 'flex-start', backgroundColor: '#1D2A3E', borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7 },
  stateText: { color: 'white', fontSize: 11, fontWeight: '900' },
  confidenceRow: { flexDirection: 'row', gap: 28 },
  metricLabel: { color: '#9EABBD', fontSize: 11, fontWeight: '800' },
  metricValue: { color: 'white', fontSize: 27, fontWeight: '900', marginTop: 3 },
  scoreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  scoreCard: { width: '48%', backgroundColor: 'white', borderRadius: 18, padding: 17, borderWidth: 1, borderColor: colors.line },
  scoreLabel: { color: colors.muted, fontWeight: '800' },
  scoreValue: { color: colors.text, fontSize: 36, fontWeight: '900', marginTop: 5 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 19, borderWidth: 1, borderColor: colors.line, gap: 8 },
  cardTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: '900' },
  muted: { color: colors.muted, lineHeight: 21 },
  primary: { marginTop: 6, backgroundColor: colors.text, borderRadius: 12, padding: 14, alignItems: 'center' },
  primaryText: { color: 'white', fontWeight: '900' },
  nextCard: { backgroundColor: colors.dark, borderRadius: 20, padding: 20, gap: 8 },
  nextTitle: { color: 'white', fontSize: 22, lineHeight: 27, fontWeight: '900' },
  nextBody: { color: '#BBC4D2', lineHeight: 20 },
  notice: { backgroundColor: colors.warning, borderRadius: 14, padding: 14 },
  noticeText: { color: colors.text, fontWeight: '700' },
  refresh: { borderWidth: 1, borderColor: colors.line, backgroundColor: 'white', borderRadius: 13, padding: 14, alignItems: 'center' },
  refreshText: { color: colors.text, fontWeight: '900' },
});
