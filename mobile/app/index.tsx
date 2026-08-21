import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { runPeppeAutoSync, type PeppeAutoSyncResult } from '../lib/autoSync';
import { buildPeppeSnapshot, type PeppeIntelligenceSnapshot } from '../lib/intelligence';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

type Scores = { readiness: number | null; fuel: number | null; recovery: number | null; load: number | null };

const emptyScores: Scores = { readiness: null, fuel: null, recovery: null, load: null };
const SUMMARY_ROUTE = '/summary' as Href;

export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('Atleta');
  const [scores, setScores] = useState<Scores>(emptyScores);
  const [snapshot, setSnapshot] = useState<PeppeIntelligenceSnapshot | null>(null);
  const [syncResult, setSyncResult] = useState<PeppeAutoSyncResult | null>(null);
  const [pendingPromptId, setPendingPromptId] = useState<string | null>(null);
  const [pendingPromptType, setPendingPromptType] = useState<string | null>(null);

  async function loadHome(userId: string) {
    setSyncing(true);
    try {
      const autoSync = await runPeppeAutoSync(userId, true).catch(() => null);
      if (autoSync) setSyncResult(autoSync);

      const [{ data: profile }, { data: prompt }, intelligence] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
        supabase.from('daily_prompts').select('id,prompt_type,due_at').eq('athlete_id', userId).eq('status', 'pending').lte('due_at', new Date().toISOString()).order('due_at', { ascending: false }).limit(1).maybeSingle(),
        buildPeppeSnapshot(userId, false).catch(() => null),
      ]);

      setName(profile?.full_name || 'Atleta');
      setPendingPromptId(prompt?.id ?? null);
      setPendingPromptType(prompt?.prompt_type ?? null);
      if (intelligence) {
        setSnapshot(intelligence);
        setScores(intelligence.scores);
      }
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadHome(data.session.user.id);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) loadHome(nextSession.user.id);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function submitAuth() {
    setMessage('');
    setLoading(true);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage('Cuenta creada. Confirma tu correo y luego entra a Peppe.');
    }
    setLoading(false);
  }

  if (loading && !session) {
    return <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Preparando Peppe…</Text></View>;
  }

  if (!session) {
    return (
      <View style={styles.authShell}>
        <StatusBar style="light" />
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>PEPPE</Text>
          <Text style={styles.hero}>Tu segunda voz para entrenar mejor.</Text>
          <Text style={styles.heroBody}>Datos automáticos + sensaciones + nutrición para decidir qué hacer ahora.</Text>
        </View>
        <View style={styles.authCard}>
          <View style={styles.tabs}>
            <Pressable style={[styles.tab, mode === 'login' && styles.tabActive]} onPress={() => setMode('login')}><Text style={styles.tabText}>Entrar</Text></Pressable>
            <Pressable style={[styles.tab, mode === 'signup' && styles.tabActive]} onPress={() => setMode('signup')}><Text style={styles.tabText}>Crear cuenta</Text></Pressable>
          </View>
          <TextInput autoCapitalize="none" keyboardType="email-address" placeholder="Correo" value={email} onChangeText={setEmail} style={styles.input} />
          <TextInput secureTextEntry placeholder="Contraseña" value={password} onChangeText={setPassword} style={styles.input} />
          <Pressable style={styles.primary} onPress={submitAuth}><Text style={styles.primaryText}>{mode === 'login' ? 'Entrar a Peppe' : 'Crear cuenta'}</Text></Pressable>
          {!!message && <Text style={styles.notice}>{message}</Text>}
        </View>
      </View>
    );
  }

  const cards = [
    ['Readiness', scores.readiness],
    ['Fuel', scores.fuel],
    ['Recovery', scores.recovery],
    ['Load', scores.load],
  ] as const;

  const contextReady = snapshot ? Math.round(snapshot.completeness) : 0;
  const confidence = snapshot ? Math.round(snapshot.confidence) : 0;
  const needsInput = snapshot?.state === 'incomplete' || Boolean(pendingPromptId);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>PEPPE · AHORA</Text><Text style={styles.title}>Hola, {name}.</Text></View>
        <Pressable onPress={() => supabase.auth.signOut()}><Text style={styles.link}>Salir</Text></Pressable>
      </View>

      <View style={styles.openingCard}>
        <View style={styles.openingTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrowLight}>{syncing ? 'ACTUALIZANDO TU MOMENTO' : needsInput ? 'COMPLETEMOS TU FOTO' : 'TENGO TU FOTO'}</Text>
            <Text style={styles.openingTitle}>{syncing ? 'Estoy revisando tus fuentes…' : snapshot?.headline || 'Estoy construyendo tu contexto personal.'}</Text>
          </View>
          {syncing ? <ActivityIndicator color="white" /> : <View style={styles.contextPill}><Text style={styles.contextPillText}>{contextReady}%</Text></View>}
        </View>

        {!syncing && snapshot && <Text style={styles.openingBody}>{snapshot.explanation}</Text>}

        <View style={styles.sourceRow}>
          <SourceChip label="Apple Health" ok={syncResult?.appleHealth === 'synced'} pending={syncResult?.appleHealth === 'not_connected'} />
          <SourceChip label="Contexto" ok={syncResult?.context === 'captured'} pending={syncResult?.context === 'not_authorized'} />
          <SourceChip label="Peppe" ok={syncResult?.intelligence === 'updated' || Boolean(snapshot)} />
        </View>

        {!syncing && snapshot && (
          <View style={styles.openingDecision}>
            <Text style={styles.decisionLabel}>{needsInput ? 'LO QUE MÁS ME AYUDA AHORA' : 'QUÉ HACER AHORA'}</Text>
            <Text style={styles.decisionText}>{needsInput ? snapshot.nextQuestion : snapshot.recommendationNow}</Text>
          </View>
        )}

        {!syncing && (
          pendingPromptId ? (
            <Pressable style={styles.openingButton} onPress={() => router.push({ pathname: '/moment', params: { promptId: pendingPromptId } })}>
              <Text style={styles.openingButtonText}>Completar mi momento →</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.openingButton} onPress={() => router.push(SUMMARY_ROUTE)}>
              <Text style={styles.openingButtonText}>{needsInput ? 'Completar contexto →' : 'Ver Resumen Inteligente →'}</Text>
            </Pressable>
          )
        )}
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaCard}><Text style={styles.metaLabel}>Contexto</Text><Text style={styles.metaValue}>{contextReady}%</Text></View>
        <View style={styles.metaCard}><Text style={styles.metaLabel}>Confianza Peppe</Text><Text style={styles.metaValue}>{confidence}%</Text></View>
      </View>

      <View style={styles.scoreGrid}>
        {cards.map(([label, value]) => (
          <View style={styles.scoreCard} key={label}>
            <Text style={styles.scoreLabel}>{label}</Text>
            <Text style={styles.scoreValue}>{value == null ? '—' : Math.round(value)}</Text>
          </View>
        ))}
      </View>

      {pendingPromptId && (
        <Pressable style={styles.momentCard} onPress={() => router.push({ pathname: '/moment', params: { promptId: pendingPromptId } })}>
          <Text style={styles.eyebrowLight}>MOMENTO PEPPE</Text>
          <Text style={styles.momentTitle}>Sólo falta información que los sensores no pueden saber.</Text>
          <Text style={styles.momentBody}>Momento: {pendingPromptType?.replaceAll('_', ' ')} · responde lo mínimo para mejorar la recomendación.</Text>
        </Pressable>
      )}

      <View style={styles.card}>
        <Text style={styles.eyebrow}>FUENTES AUTOMÁTICAS</Text>
        <Text style={styles.cardTitle}>Peppe debe escribir cada vez menos.</Text>
        <Text style={styles.muted}>Apple Health y ubicación autorizada ya pueden actualizarse al abrir la app. Garmin y TrainingPeaks se conectarán al mismo flujo cuando tengamos acceso a sus APIs.</Text>
        <Pressable style={styles.primary} onPress={() => router.push('/connections')}><Text style={styles.primaryText}>Revisar conexiones</Text></Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={() => router.push('/routine')}><Text style={styles.secondaryText}>Rutina</Text></Pressable>
        <Pressable style={styles.secondary} onPress={() => router.push('/moment')}><Text style={styles.secondaryText}>Momento manual</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function SourceChip({ label, ok, pending = false }: { label: string; ok: boolean; pending?: boolean }) {
  return (
    <View style={[styles.sourceChip, ok && styles.sourceChipOk]}>
      <Text style={[styles.sourceChipText, ok && styles.sourceChipTextOk]}>{ok ? '✓' : pending ? '○' : '·'} {label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, container: { padding: 20, paddingTop: 58, paddingBottom: 60, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.bg },
  authShell: { flex: 1, backgroundColor: colors.dark, padding: 22, justifyContent: 'center', gap: 28 }, brandBlock: { gap: 12 }, brand: { color: 'white', fontSize: 14, letterSpacing: 4, fontWeight: '900' },
  hero: { color: 'white', fontSize: 43, lineHeight: 45, fontWeight: '900', letterSpacing: -1.5 }, heroBody: { color: '#B9C2D0', fontSize: 17, lineHeight: 25 },
  authCard: { backgroundColor: 'white', borderRadius: 24, padding: 20, gap: 12 }, tabs: { flexDirection: 'row', backgroundColor: colors.soft, borderRadius: 12, padding: 4 }, tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 9 }, tabActive: { backgroundColor: 'white' }, tabText: { fontWeight: '800', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: 'white' }, primary: { marginTop: 5, backgroundColor: colors.text, borderRadius: 12, padding: 15, alignItems: 'center' }, primaryText: { color: 'white', fontWeight: '900' }, notice: { color: '#415477', lineHeight: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 }, title: { color: colors.text, fontSize: 36, fontWeight: '900', letterSpacing: -1.1, marginTop: 5 }, link: { fontWeight: '800', color: colors.muted, paddingTop: 8 },
  openingCard: { backgroundColor: colors.dark, borderRadius: 24, padding: 22, gap: 14 }, openingTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, openingTitle: { color: 'white', fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -0.7, marginTop: 5 }, openingBody: { color: '#C4CDDA', lineHeight: 21 },
  contextPill: { backgroundColor: '#1D2A3E', borderRadius: 99, paddingHorizontal: 11, paddingVertical: 8 }, contextPillText: { color: 'white', fontWeight: '900', fontSize: 12 },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, sourceChip: { backgroundColor: '#1A2434', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6 }, sourceChipOk: { backgroundColor: '#17372B' }, sourceChipText: { color: '#AEB8C9', fontSize: 11, fontWeight: '800' }, sourceChipTextOk: { color: '#BDEECC' },
  openingDecision: { borderTopWidth: 1, borderTopColor: '#263244', paddingTop: 13, gap: 5 }, decisionLabel: { color: '#AEB8C9', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, decisionText: { color: 'white', fontSize: 18, lineHeight: 24, fontWeight: '800' },
  openingButton: { backgroundColor: 'white', borderRadius: 12, padding: 14, alignItems: 'center' }, openingButtonText: { color: colors.text, fontWeight: '900' },
  metaRow: { flexDirection: 'row', gap: 10 }, metaCard: { flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: colors.line }, metaLabel: { color: colors.muted, fontSize: 11, fontWeight: '800' }, metaValue: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 3 },
  scoreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, scoreCard: { width: '48%', backgroundColor: 'white', borderRadius: 18, padding: 17, borderWidth: 1, borderColor: colors.line }, scoreLabel: { color: colors.muted, fontWeight: '800' }, scoreValue: { color: colors.text, fontSize: 38, fontWeight: '900', marginTop: 6 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.line, gap: 8 }, cardTitle: { fontSize: 23, fontWeight: '900', color: colors.text, letterSpacing: -0.5 }, muted: { color: colors.muted, lineHeight: 21 },
  momentCard: { backgroundColor: '#142033', borderRadius: 22, padding: 22, gap: 9 }, eyebrowLight: { color: '#AEB8C9', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 }, momentTitle: { color: 'white', fontSize: 24, fontWeight: '900', lineHeight: 29 }, momentBody: { color: '#BBC4D2', lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 10 }, secondary: { flex: 1, backgroundColor: 'white', borderRadius: 13, borderWidth: 1, borderColor: colors.line, padding: 14, alignItems: 'center' }, secondaryText: { fontWeight: '900', color: colors.text, textAlign: 'center' },
});
