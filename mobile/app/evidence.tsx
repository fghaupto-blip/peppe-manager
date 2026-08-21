import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { pickEvidenceImage, takeEvidencePhoto, type EvidenceProvider, type EvidenceType } from '../lib/evidence';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

const providers: Array<{ label: string; value: EvidenceProvider }> = [
  { label: 'Garmin', value: 'garmin' },
  { label: 'TrainingPeaks', value: 'trainingpeaks' },
  { label: 'Strava', value: 'strava' },
  { label: 'Apple Health', value: 'apple_health' },
  { label: 'Otro', value: 'other' },
];

function validProvider(value: string | undefined): EvidenceProvider | null {
  if (!value) return null;
  return providers.some((item) => item.value === value) ? value as EvidenceProvider : null;
}

function validType(value: string | undefined): EvidenceType | null {
  if (value === 'training_screenshot' || value === 'daily_screenshot' || value === 'food_photo') return value;
  return null;
}

export default function EvidenceScreen() {
  const params = useLocalSearchParams<{ provider?: string; type?: string }>();
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [provider, setProvider] = useState<EvidenceProvider>(validProvider(params.provider) ?? 'garmin');
  const [type, setType] = useState<EvidenceType>(validType(params.type) ?? 'training_screenshot');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/');
      else setAthleteId(data.user.id);
    });
  }, []);

  useEffect(() => {
    const nextProvider = validProvider(params.provider);
    const nextType = validType(params.type);
    if (nextProvider) setProvider(nextProvider);
    if (nextType) setType(nextType);
  }, [params.provider, params.type]);

  async function upload(mode: 'library' | 'camera') {
    if (!athleteId) return;
    setUploading(true);
    setMessage('');
    try {
      const result = mode === 'library'
        ? await pickEvidenceImage(athleteId, type, provider)
        : await takeEvidencePhoto(athleteId, type, provider);
      if (!result) return;
      setMessage('Listo. Peppe guardó esta evidencia de forma privada y quedó pendiente de análisis visual.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pude guardar la imagen.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>PEPPE · EVIDENCIA MANUAL</Text>
      <Text style={styles.hero}>Cuando una API todavía no está conectada, muéstrame el dato.</Text>
      <Text style={styles.muted}>Puedes subir un pantallazo de entrenamiento o del día. Peppe lo guarda asociado a la fuente para que la capa visual pueda extraer sus variables y pedirte confirmación.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>¿Qué tipo de información es?</Text>
        <View style={styles.choiceRow}>
          <Choice active={type === 'training_screenshot'} label="Entrenamiento" onPress={() => setType('training_screenshot')} />
          <Choice active={type === 'daily_screenshot'} label="Día a día / salud" onPress={() => setType('daily_screenshot')} />
        </View>

        <Text style={styles.label}>¿De dónde viene?</Text>
        <View style={styles.providerWrap}>
          {providers.map((item) => (
            <Pressable key={item.value} onPress={() => setProvider(item.value)} style={[styles.provider, provider === item.value && styles.providerActive]}>
              <Text style={[styles.providerText, provider === item.value && styles.providerTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable disabled={uploading} style={styles.primary} onPress={() => upload('library')}>
          <Text style={styles.primaryText}>{uploading ? 'Guardando…' : 'Elegir pantallazo'}</Text>
        </Pressable>
        <Pressable disabled={uploading} style={styles.secondary} onPress={() => upload('camera')}>
          <Text style={styles.secondaryText}>Tomar foto</Text>
        </Pressable>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Cómo lo usará Peppe</Text>
        <Text style={styles.infoText}>1. Identifica fuente y tipo de evidencia.\n2. Extrae variables visibles cuando activemos el análisis multimodal.\n3. Te muestra qué entendió para confirmar.\n4. Sólo los datos confirmados alimentan la Foto del Momento.</Text>
      </View>

      {provider === 'strava' && (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Strava</Text>
          <Text style={styles.warningText}>Este camino es una carga manual realizada por el usuario durante el piloto. La API de Strava seguirá separada de Peppe Intelligence.</Text>
        </View>
      )}

      {!!message && <View style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View>}

      <Pressable style={styles.backButton} onPress={() => router.back()}><Text style={styles.backText}>Volver</Text></Pressable>
    </ScrollView>
  );
}

function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 50, gap: 16 },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  hero: { color: colors.text, fontSize: 31, lineHeight: 35, fontWeight: '900', letterSpacing: -0.8 },
  muted: { color: colors.muted, lineHeight: 21 },
  card: { backgroundColor: 'white', borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 14 },
  label: { color: colors.text, fontWeight: '900', fontSize: 15 },
  choiceRow: { flexDirection: 'row', gap: 9 },
  choice: { flex: 1, minHeight: 52, borderRadius: 13, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  choiceActive: { backgroundColor: colors.text, borderColor: colors.text },
  choiceText: { color: colors.text, fontWeight: '900', textAlign: 'center' },
  choiceTextActive: { color: 'white' },
  providerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  provider: { borderRadius: 99, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.line },
  providerActive: { backgroundColor: colors.text, borderColor: colors.text },
  providerText: { color: colors.text, fontWeight: '800' },
  providerTextActive: { color: 'white' },
  primary: { backgroundColor: colors.text, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 },
  primaryText: { color: 'white', fontWeight: '900', fontSize: 16 },
  secondary: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 15, alignItems: 'center' },
  secondaryText: { color: colors.text, fontWeight: '900' },
  infoCard: { backgroundColor: colors.dark, borderRadius: 20, padding: 19, gap: 8 },
  infoTitle: { color: 'white', fontWeight: '900', fontSize: 20 },
  infoText: { color: '#BBC4D2', lineHeight: 22 },
  warningCard: { backgroundColor: colors.warning, borderRadius: 18, padding: 16, gap: 5 },
  warningTitle: { color: colors.text, fontWeight: '900' },
  warningText: { color: colors.text, lineHeight: 20 },
  notice: { backgroundColor: colors.success, borderRadius: 14, padding: 14 },
  noticeText: { color: colors.text, fontWeight: '700', lineHeight: 20 },
  backButton: { borderWidth: 1, borderColor: colors.line, backgroundColor: 'white', borderRadius: 13, padding: 14, alignItems: 'center' },
  backText: { color: colors.text, fontWeight: '900' },
});
