import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

type Prefs = {
  timezone: string;
  wake_time: string;
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  sleep_time: string;
  meal_prompt_lead_minutes: number;
  sleep_prompt_lead_minutes: number;
  morning_prompts_enabled: boolean;
  meal_prompts_enabled: boolean;
  sleep_prompts_enabled: boolean;
  push_enabled: boolean;
};

const initial: Prefs = {
  timezone: 'America/Santiago',
  wake_time: '05:30',
  breakfast_time: '07:30',
  lunch_time: '13:30',
  dinner_time: '20:30',
  sleep_time: '23:00',
  meal_prompt_lead_minutes: 20,
  sleep_prompt_lead_minutes: 30,
  morning_prompts_enabled: true,
  meal_prompts_enabled: true,
  sleep_prompts_enabled: true,
  push_enabled: true,
};

export default function RoutineScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return setLoading(false);
      setUserId(auth.user.id);
      const { data } = await supabase.from('user_preferences').select('*').eq('athlete_id', auth.user.id).maybeSingle();
      if (data) {
        setPrefs({
          timezone: data.timezone ?? 'America/Santiago',
          wake_time: data.wake_time?.slice(0, 5) ?? '',
          breakfast_time: data.breakfast_time?.slice(0, 5) ?? '',
          lunch_time: data.lunch_time?.slice(0, 5) ?? '',
          dinner_time: data.dinner_time?.slice(0, 5) ?? '',
          sleep_time: data.sleep_time?.slice(0, 5) ?? '',
          meal_prompt_lead_minutes: data.meal_prompt_lead_minutes ?? 20,
          sleep_prompt_lead_minutes: data.sleep_prompt_lead_minutes ?? 30,
          morning_prompts_enabled: data.morning_prompts_enabled ?? true,
          meal_prompts_enabled: data.meal_prompts_enabled ?? true,
          sleep_prompts_enabled: data.sleep_prompts_enabled ?? true,
          push_enabled: data.push_enabled ?? true,
        });
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    if (!userId) return;
    setSaving(true);
    setMessage('');
    const { error } = await supabase.from('user_preferences').upsert({
      athlete_id: userId,
      ...prefs,
      wake_time: prefs.wake_time || null,
      breakfast_time: prefs.breakfast_time || null,
      lunch_time: prefs.lunch_time || null,
      dinner_time: prefs.dinner_time || null,
      sleep_time: prefs.sleep_time || null,
      updated_at: new Date().toISOString(),
    });
    setMessage(error ? error.message : 'Rutina guardada. Peppe usará estos horarios para hablarte.');
    setSaving(false);
  }

  if (loading) return <View style={styles.center}><Text style={styles.hero}>PEPPE</Text><Text style={styles.muted}>Cargando rutina…</Text></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>PEPPE · RUTINA</Text>
      <Text style={styles.hero}>¿Cuándo quieres que Peppe te hable?</Text>
      <Text style={styles.muted}>Configura tus horas habituales. El motor genera los momentos automáticamente y pregunta sólo lo que falte.</Text>

      <View style={styles.card}>
        <Field label="Zona horaria" value={prefs.timezone} onChangeText={(v) => setPrefs({ ...prefs, timezone: v })} />
        <TimeField label="Me despierto" value={prefs.wake_time} onChangeText={(v) => setPrefs({ ...prefs, wake_time: v })} />
        <TimeField label="Desayuno" value={prefs.breakfast_time} onChangeText={(v) => setPrefs({ ...prefs, breakfast_time: v })} />
        <TimeField label="Almuerzo" value={prefs.lunch_time} onChangeText={(v) => setPrefs({ ...prefs, lunch_time: v })} />
        <TimeField label="Cena" value={prefs.dinner_time} onChangeText={(v) => setPrefs({ ...prefs, dinner_time: v })} />
        <TimeField label="Me duermo" value={prefs.sleep_time} onChangeText={(v) => setPrefs({ ...prefs, sleep_time: v })} />
        <Field label="Avisar antes de comer (min)" value={String(prefs.meal_prompt_lead_minutes)} keyboardType="numeric" onChangeText={(v) => setPrefs({ ...prefs, meal_prompt_lead_minutes: Number(v || 0) })} />
        <Field label="Avisar antes de dormir (min)" value={String(prefs.sleep_prompt_lead_minutes)} keyboardType="numeric" onChangeText={(v) => setPrefs({ ...prefs, sleep_prompt_lead_minutes: Number(v || 0) })} />

        <Toggle label="Reporte de mañana" detail="Estado, peso/composición y sensaciones faltantes." value={prefs.morning_prompts_enabled} onValueChange={(v) => setPrefs({ ...prefs, morning_prompts_enabled: v })} />
        <Toggle label="Antes de comidas" detail="Hambre, energía, recuperación y nutrición." value={prefs.meal_prompts_enabled} onValueChange={(v) => setPrefs({ ...prefs, meal_prompts_enabled: v })} />
        <Toggle label="Antes de dormir" detail="Fatiga, dolor, hidratación y preparación de mañana." value={prefs.sleep_prompts_enabled} onValueChange={(v) => setPrefs({ ...prefs, sleep_prompts_enabled: v })} />
        <Toggle label="Notificaciones push" detail="Permite que Peppe te busque sin abrir la app." value={prefs.push_enabled} onValueChange={(v) => setPrefs({ ...prefs, push_enabled: v })} />

        <Pressable style={styles.primary} onPress={save} disabled={saving}><Text style={styles.primaryText}>{saving ? 'Guardando…' : 'Guardar mi rutina'}</Text></Pressable>
        {!!message && <Text style={styles.notice}>{message}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>REGLA DE ORO</Text>
        <Text style={styles.cardTitle}>Si Peppe ya lo sabe, no lo pregunta.</Text>
        <Text style={styles.muted}>Cuando integremos Garmin, HealthKit/Health Connect y TrainingPeaks, esos datos completarán el estudio automáticamente. La conversación se concentrará en sensaciones, hambre, dolor y decisiones nutricionales.</Text>
      </View>
    </ScrollView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...rest } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...rest} style={styles.input} /></View>;
}
function TimeField(props: { label: string; value: string; onChangeText: (v: string) => void }) {
  return <Field {...props} placeholder="HH:MM" maxLength={5} keyboardType="numbers-and-punctuation" />;
}
function Toggle({ label, detail, value, onValueChange }: { label: string; detail: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return <View style={styles.toggle}><View style={{ flex: 1 }}><Text style={styles.label}>{label}</Text><Text style={styles.small}>{detail}</Text></View><Switch value={value} onValueChange={onValueChange} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, container: { padding: 18, paddingBottom: 50, gap: 11 }, center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 9 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: colors.muted }, hero: { fontSize: 32, lineHeight: 36, fontWeight: '900', letterSpacing: -1, color: colors.text }, muted: { color: colors.muted, lineHeight: 21 },
  card: { backgroundColor: 'white', borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 15, marginTop: 6 }, field: { gap: 7 }, label: { fontWeight: '900', color: '#374151' }, input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, fontSize: 16, backgroundColor: 'white' },
  toggle: { flexDirection: 'row', gap: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 }, small: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }, primary: { backgroundColor: colors.text, borderRadius: 12, padding: 15, alignItems: 'center' }, primaryText: { color: 'white', fontWeight: '900' }, notice: { color: '#415477', lineHeight: 20 }, cardTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
});
