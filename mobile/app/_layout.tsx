import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { runPeppeAutoSync } from '../lib/autoSync';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    async function syncCurrentUser(force = false) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      await runPeppeAutoSync(data.session.user.id, force).catch(() => null);
    }

    syncCurrentUser(true);

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appState.current === 'background' || appState.current === 'inactive';
      appState.current = nextState;
      if (wasBackground && nextState === 'active') syncCurrentUser();
    });

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        runPeppeAutoSync(session.user.id, true).catch(() => null);
      }
    });

    return () => {
      appStateSubscription.remove();
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: '#F4F6F8' },
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: '#F4F6F8' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="summary" options={{ title: 'Resumen inteligente' }} />
      <Stack.Screen name="moment" options={{ title: 'Momento Peppe' }} />
      <Stack.Screen name="routine" options={{ title: 'Rutina' }} />
      <Stack.Screen name="connections" options={{ title: 'Conexiones' }} />
    </Stack>
  );
}
