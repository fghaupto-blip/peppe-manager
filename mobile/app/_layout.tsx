import { Stack } from 'expo-router';

export default function RootLayout() {
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
      <Stack.Screen name="moment" options={{ title: 'Momento Peppe' }} />
      <Stack.Screen name="routine" options={{ title: 'Rutina' }} />
      <Stack.Screen name="connections" options={{ title: 'Conexiones' }} />
    </Stack>
  );
}
