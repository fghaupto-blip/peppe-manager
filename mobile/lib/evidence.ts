import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export type EvidenceType = 'food_photo' | 'training_screenshot' | 'daily_screenshot';
export type EvidenceProvider = 'camera' | 'apple_health' | 'garmin' | 'trainingpeaks' | 'strava' | 'other';

export type UploadedEvidence = {
  id: string;
  bucket: string;
  path: string;
  mimeType: string;
};

function extensionFor(mimeType?: string | null, fileName?: string | null) {
  const fromName = fileName?.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(fromName)) return fromName;
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  if (mimeType === 'image/heif') return 'heif';
  return 'jpg';
}

async function uploadAsset(
  athleteId: string,
  asset: ImagePicker.ImagePickerAsset,
  evidenceType: EvidenceType,
  provider: EvidenceProvider,
  note?: string,
): Promise<UploadedEvidence> {
  const mimeType = asset.mimeType || 'image/jpeg';
  const extension = extensionFor(mimeType, asset.fileName);
  const bucket = evidenceType === 'food_photo' ? 'nutrition-photos' : 'peppe-evidence';
  const path = `${athleteId}/${evidenceType}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;

  const response = await fetch(asset.uri);
  const body = await response.arrayBuffer();
  const upload = await supabase.storage.from(bucket).upload(path, body, {
    contentType: mimeType,
    upsert: false,
  });
  if (upload.error) throw upload.error;

  const { data, error } = await supabase
    .from('evidence_uploads')
    .insert({
      athlete_id: athleteId,
      evidence_type: evidenceType,
      provider,
      storage_bucket: bucket,
      storage_path: path,
      captured_at: new Date().toISOString(),
      processing_status: 'pending',
      user_note: note?.trim() || null,
    })
    .select('id')
    .single();

  if (error) {
    await supabase.storage.from(bucket).remove([path]).catch(() => null);
    throw error;
  }

  return { id: data.id, bucket, path, mimeType };
}

export async function takeEvidencePhoto(
  athleteId: string,
  evidenceType: EvidenceType,
  provider: EvidenceProvider = 'camera',
  note?: string,
) {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Peppe necesita permiso de cámara para sacar la foto.');

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.82,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return uploadAsset(athleteId, result.assets[0], evidenceType, provider, note);
}

export async function pickEvidenceImage(
  athleteId: string,
  evidenceType: EvidenceType,
  provider: EvidenceProvider,
  note?: string,
) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Peppe necesita permiso para elegir una imagen de tu fototeca.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.88,
    allowsMultipleSelection: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return uploadAsset(athleteId, result.assets[0], evidenceType, provider, note);
}
