import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export async function registerPeppePushToken(userId: string) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('peppe', {
      name: 'Peppe',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    return { ok: false, reason: 'permission_denied' as const };
  }

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return { ok: false, reason: 'missing_eas_project' as const };
  }

  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const native = await Notifications.getDevicePushTokenAsync().catch(() => null);

  const { error } = await supabase.from('device_push_tokens').upsert(
    {
      athlete_id: userId,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      expo_push_token: expoPushToken,
      native_push_token: native ? String(native.data) : null,
      device_name: Device.deviceName ?? null,
      app_version: Constants.expoConfig?.version ?? '0.1.0',
      enabled: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'athlete_id,expo_push_token' },
  );

  if (error) throw error;
  return { ok: true, token: expoPushToken };
}
