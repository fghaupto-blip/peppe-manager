import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

type Scores = { readiness: number | null; fuel: number | null; recovery: number | null; load: number | null };

const emptyScores: Scores = { readiness: null, fuel: null, recovery: null, load: null };

export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('Atleta');
  const [scores, setScores] = useState<Scores>(emptyScores);
  const [pendingPromptId, setPendingPromptId] = useState<string | null>(null);
  const [pendingPromptType, setPendingPromptType] = useState<string | null>(null);

  async function loadHome(userId: string) {
    const [{ data: profile }, { data: score }, { data: prompt }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
      supabase.from('scores').select('readiness,fuel,recovery,load').eq('athlete_id', userId).order('score_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('daily_prompts').select('id,prompt_type,due_at').eq('athlete_id', userId).eq('status', 'pending').lte('due_at', new Date().toISOString()).order('due_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setName(profile?.full_name || 'Atleta');
    setScores((score as Scores | null) ?? emptyScores);
    setPendingPromptId(prompt?.id ?? null);
    setPendingPromptType(prompt?.prompt_type ?? null);
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>PEPPE · HOY</Text><Text style={styles.title}>Hola, {name}.</Text></View>
        <Pressable onPress={() => supabase.auth.signOut()}><Text style={styles.link}>Salir</Text></Pressable>
      </View>

      <View style={styles.scoreGrid}>
        {cards.map(([label, value]) => (
          <View style={styles.scoreCard} key={label}>
            <Text style={styles.scoreLabel}>{label}</Text>
            <Text style={styles.scoreValue}>{value == null ? '—' : Math.round(value)}</Text>
          </View>
        ))}
      </View>

      {pendingPromptId ? (
        <Pressable style={styles.momentCard} onPress={() => router.push({ pathname: '/moment', params: { promptId: pendingPromptId } })}>
          <Text style={styles.eyebrowLight}>MOMENTO PEPPE</Text>
          <Text style={styles.momentTitle}>Tengo unas preguntas para completar tu estado.</Text>
          <Text style={styles.momentBody}>Momento: {pendingPromptType?.replaceAll('_', ' ')} · Toca para responder sólo lo que falta.</Text>
        </Pressable>
      ) : (
        <View style={styles.card}><Text style={styles.eyebrow}>PRÓXIMA DECISIÓN</Text><Text style={styles.cardTitle}>Peppe está al día.</Text><Text style={styles.muted}>Cuando llegue tu próximo momento o termine una sesión, aparecerá aquí.</Text></View>
      )}

      <View style={styles.card}>
        <Text style={styles.eyebrow}>DATOS AUTOMÁTICOS</Text>
        <Text style={styles.cardTitle}>Conecta tus fuentes.</Text>
        <Text style={styles.muted}>Apple Health es la primera conexión nativa. Garmin Connect y TrainingPeaks se sumarán mediante API directa; Strava quedará separado del motor de IA.</Text>
        <Pressable style={styles.primary} onPress={() => router.push('/connections')}><Text style={styles.primaryText}>Abrir conexiones</Text></Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>PILOTO IPHONE</Text>
        <Text style={styles.cardTitle}>Primero validamos Apple Health.</Text>
        <Text style={styles.muted}>Las notificaciones push quedan temporalmente desactivadas mientras usamos un Apple Personal Team. Se reactivarán al pasar a una membresía Apple Developer con APNs.</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={() => router.push('/routine')}><Text style={styles.secondaryText}>Configurar rutina</Text></Pressable>
        <Pressable style={styles.secondary} onPress={() => router.push('/moment')}><Text style={styles.secondaryText}>Abrir Peppe Moment</Text></Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>AUTOMATIZACIÓN</Text>
        <Text style={styles.cardTitle}>El objetivo: escribir menos.</Text>
        <Text style={styles.muted}>Las fuentes autorizadas alimentarán Peppe. La app sólo preguntará lo que no pueda obtener automáticamente.</Text>
      </View>
    </ScrollView>
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
  scoreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, scoreCard: { width: '48%', backgroundColor: 'white', borderRadius: 18, padding: 17, borderWidth: 1, borderColor: colors.line }, scoreLabel: { color: colors.muted, fontWeight: '800' }, scoreValue: { color: colors.text, fontSize: 38, fontWeight: '900', marginTop: 6 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.line, gap: 8 }, cardTitle: { fontSize: 23, fontWeight: '900', color: colors.text, letterSpacing: -0.5 }, muted: { color: colors.muted, lineHeight: 21 },
  momentCard: { backgroundColor: colors.dark, borderRadius: 22, padding: 22, gap: 9 }, eyebrowLight: { color: '#AEB8C9', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 }, momentTitle: { color: 'white', fontSize: 25, fontWeight: '900', lineHeight: 29 }, momentBody: { color: '#BBC4D2', lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 10 }, secondary: { flex: 1, backgroundColor: 'white', borderRadius: 13, borderWidth: 1, borderColor: colors.line, padding: 14, alignItems: 'center' }, secondaryText: { fontWeight: '900', color: colors.text, textAlign: 'center' },
});
