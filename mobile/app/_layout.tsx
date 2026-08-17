import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function openFromNotification(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const data = response.notification.request.content.data as Record<string, unknown>;
  const path = typeof data.path === 'string' ? data.path : '/moment';
  router.push(path as never);
}

export default function RootLayout() {
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(openFromNotification);
    const subscription = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => subscription.remove();
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
      <Stack.Screen name="moment" options={{ title: 'Momento Peppe' }} />
      <Stack.Screen name="routine" options={{ title: 'Rutina' }} />
    </Stack>
  );
}
