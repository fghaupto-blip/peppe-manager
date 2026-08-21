import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { runPeppeAutoSync } from '../lib/autoSync';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

const CHECKIN_ROUTE = '/checkin' as Href;

export default function EntryScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');
  const routedUser = useRef<string | null>(null);

  async function preparePeppe(nextSession: Session) {
    if (routedUser.current === nextSession.user.id) return;
    routedUser.current = nextSession.user.id;
    setPreparing(true);
    setMessage('');

    try {
      await runPeppeAutoSync(nextSession.user.id, true).catch(() => null);
      router.replace(CHECKIN_ROUTE);
    } catch (error) {
      routedUser.current = null;
      setMessage(error instanceof Error ? error.message : 'No pude preparar tu momento.');
    } finally {
      setPreparing(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) preparePeppe(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) preparePeppe(nextSession);
      else routedUser.current = null;
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

  if (loading || session || preparing) {
    return (
      <View style={styles.preparingShell}>
        <StatusBar style="light" />
        <Text style={styles.brand}>PEPPE</Text>
        <ActivityIndicator color="white" size="large" />
        <Text style={styles.preparingTitle}>Actualizando tu momento.</Text>
        <Text style={styles.preparingBody}>Reviso salud, entrenamiento disponible, ubicación autorizada, nutrición, sensaciones e historia. Después te preguntaré sólo lo que falta.</Text>
        <View style={styles.steps}>
          <Text style={styles.step}>✓ Conservar tu historia</Text>
          <Text style={styles.step}>✓ Actualizar fuentes autorizadas</Text>
          <Text style={styles.step}>→ Detectar la siguiente pregunta útil</Text>
        </View>
        {!!message && <Text style={styles.error}>{message}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.authShell}>
      <StatusBar style="light" />
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>PEPPE</Text>
        <Text style={styles.hero}>Entender tu momento antes de recomendar.</Text>
        <Text style={styles.heroBody}>Peppe primero recopila lo automático, recuerda tu historia y luego pregunta únicamente lo que puede cambiar tu decisión de entrenamiento, nutrición o recuperación.</Text>
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

const styles = StyleSheet.create({
  preparingShell: { flex: 1, backgroundColor: colors.dark, paddingHorizontal: 28, justifyContent: 'center', gap: 18 },
  brand: { color: 'white', fontSize: 13, letterSpacing: 4, fontWeight: '900' },
  preparingTitle: { color: 'white', fontSize: 36, lineHeight: 40, fontWeight: '900', letterSpacing: -1 },
  preparingBody: { color: '#B9C2D0', fontSize: 16, lineHeight: 24 },
  steps: { marginTop: 6, gap: 8 },
  step: { color: '#D6DEE9', fontWeight: '800' },
  error: { color: '#FFD7D7', lineHeight: 20 },
  authShell: { flex: 1, backgroundColor: colors.dark, padding: 22, justifyContent: 'center', gap: 28 },
  brandBlock: { gap: 12 },
  hero: { color: 'white', fontSize: 42, lineHeight: 44, fontWeight: '900', letterSpacing: -1.5 },
  heroBody: { color: '#B9C2D0', fontSize: 17, lineHeight: 25 },
  authCard: { backgroundColor: 'white', borderRadius: 24, padding: 20, gap: 12 },
  tabs: { flexDirection: 'row', backgroundColor: colors.soft, borderRadius: 12, padding: 4 },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: 'white' },
  tabText: { fontWeight: '800', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: 'white' },
  primary: { marginTop: 5, backgroundColor: colors.text, borderRadius: 12, padding: 15, alignItems: 'center' },
  primaryText: { color: 'white', fontWeight: '900' },
  notice: { color: '#415477', lineHeight: 20 },
});
