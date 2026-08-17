import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

type PromptRow = {
  id: string;
  prompt_type: string;
  due_at: string;
  question_set: string[];
  status: string;
};

const titles: Record<string, string> = {
  morning: 'Buenos días. Completemos tu estado.',
  pre_breakfast: 'Antes del desayuno, ¿cómo llegas?',
  pre_lunch: 'Antes del almuerzo, revisemos energía y recuperación.',
  pre_dinner: 'Antes de la cena, cerremos cómo va tu día.',
  pre_sleep: 'Antes de dormir, preparemos mañana.',
  post_training: 'Entrenamiento terminado. ¿Cómo quedaste?',
  manual: 'Cuéntame cómo estás ahora.',
};

export default function MomentScreen() {
  const params = useLocalSearchParams<{ promptId?: string }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [energy, setEnergy] = useState(7);
  const [hunger, setHunger] = useState(5);
  const [legs, setLegs] = useState(7);
  const [stress, setStress] = useState(4);
  const [pain, setPain] = useState(false);
  const [weight, setWeight] = useState('');
  const [glucose, setGlucose] = useState('');
  const [meal, setMeal] = useState('');
  const [hydration, setHydration] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return setLoading(false);
      setUserId(user.id);

      let query = supabase.from('daily_prompts').select('id,prompt_type,due_at,question_set,status').eq('athlete_id', user.id).in('status', ['pending', 'open']);
      if (params.promptId) query = query.eq('id', params.promptId);
      else query = query.lte('due_at', new Date().toISOString()).order('due_at', { ascending: true }).limit(1);

      const { data } = await query.maybeSingle();
      if (data) {
        const row = data as PromptRow;
        setPrompt(row);
        if (row.status === 'pending') {
          await supabase.from('daily_prompts').update({ status: 'open', opened_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id);
        }
      }
      setLoading(false);
    })();
  }, [params.promptId]);

  const questions = useMemo(() => new Set(prompt?.question_set ?? []), [prompt]);
  const showWeight = questions.has('peso_y_composicion');
  const showEnergy = questions.has('energia') || questions.has('fatiga') || questions.has('recuperacion_post_entreno');
  const showHunger = questions.has('hambre');
  const showLegs = questions.has('piernas') || questions.has('fatiga') || questions.has('recuperacion_post_entreno');
  const showPain = questions.has('dolor');
  const showGlucose = questions.has('glucosa_si_disponible');
  const showMeal = questions.has('comida_prevista') || questions.has('ultima_comida');
  const showHydration = questions.has('hidratacion');

  async function submit() {
    if (!userId || !prompt) return;
    setSaving(true);
    setMessage('');
    const answers = {
      energy: showEnergy ? energy : null,
      hunger: showHunger ? hunger : null,
      legs: showLegs ? legs : null,
      stress: showEnergy ? stress : null,
      pain: showPain ? pain : null,
      weight_kg: showWeight && weight ? Number(weight) : null,
      glucose_mg_dl: showGlucose && glucose ? Number(glucose) : null,
      meal: showMeal ? meal.trim() || null : null,
      hydration: showHydration ? hydration.trim() || null : null,
      notes: notes.trim() || null,
    };

    const errors: string[] = [];
    const response = await supabase.from('prompt_responses').upsert({ prompt_id: prompt.id, athlete_id: userId, answers }, { onConflict: 'prompt_id' });
    if (response.error) errors.push(response.error.message);

    if (showEnergy || showHunger || showLegs || showPain) {
      const result = await supabase.from('subjective_checkins').insert({
        athlete_id: userId,
        energy: showEnergy ? energy : null,
        hunger: showHunger ? hunger : null,
        legs: showLegs ? legs : null,
        stress: showEnergy ? stress : null,
        pain: showPain ? pain : null,
        notes: notes.trim() || null,
      });
      if (result.error) errors.push(result.error.message);
    }

    if (showWeight && weight) {
      const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date());
      const result = await supabase.from('daily_metrics').upsert({
        athlete_id: userId, metric_date: localDate, weight_kg: Number(weight), source: 'prompt', updated_at: new Date().toISOString(),
      }, { onConflict: 'athlete_id,metric_date,source' });
      if (result.error) errors.push(result.error.message);
    }

    if (showGlucose && glucose) {
      const result = await supabase.from('glucose_readings').insert({
        athlete_id: userId, measured_at: new Date().toISOString(), glucose_mg_dl: Number(glucose), trend: 'unknown', source: 'prompt_manual', notes: prompt.prompt_type,
      });
      if (result.error) errors.push(result.error.message);
    }

    const update = await supabase.from('daily_prompts').update({ status: 'answered', answered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', prompt.id);
    if (update.error) errors.push(update.error.message);

    setSaving(false);
    if (errors.length) setMessage(errors[0]);
    else {
      setMessage('Listo. Peppe incorporó esta lectura.');
      setTimeout(() => router.replace('/'), 700);
    }
  }

  if (loading) return <View style={styles.center}><Text style={styles.title}>PEPPE</Text><Text style={styles.muted}>Buscando tu próximo momento…</Text></View>;
  if (!userId) return <View style={styles.center}><Text style={styles.title}>Primero inicia sesión.</Text><Pressable onPress={() => router.replace('/')}><Text style={styles.link}>Volver</Text></Pressable></View>;
  if (!prompt) return <View style={styles.center}><Text style={styles.title}>Peppe está al día.</Text><Text style={styles.muted}>No tienes preguntas pendientes ahora.</Text><Pressable onPress={() => router.replace('/')}><Text style={styles.link}>Volver al inicio</Text></Pressable></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>PEPPE · MOMENTO DEL DÍA</Text>
      <Text style={styles.hero}>{titles[prompt.prompt_type] ?? titles.manual}</Text>
      <Text style={styles.muted}>Sólo te pregunto lo que falta. Los datos que ya llegaron desde sensores no deberían repetirse.</Text>

      <View style={styles.card}>
        {showEnergy && <Scale label="Energía" value={energy} setValue={setEnergy} />}
        {showHunger && <Scale label="Hambre" value={hunger} setValue={setHunger} />}
        {showLegs && <Scale label="Piernas / recuperación" value={legs} setValue={setLegs} />}
        {showEnergy && <Scale label="Estrés" value={stress} setValue={setStress} />}

        {showPain && <View style={styles.switchRow}><View style={{ flex: 1 }}><Text style={styles.label}>Molestia o dolor</Text><Text style={styles.small}>Actívalo si Peppe debe considerarlo.</Text></View><Switch value={pain} onValueChange={setPain} /></View>}
        {showWeight && <Field label="Peso de hoy (si no llegó automático)" value={weight} onChangeText={setWeight} placeholder="83.8 kg" keyboardType="decimal-pad" />}
        {showGlucose && <Field label="Glucosa actual (si no está sincronizada)" value={glucose} onChangeText={setGlucose} placeholder="96 mg/dL" keyboardType="numeric" />}
        {showMeal && <Field label={prompt.prompt_type === 'pre_sleep' ? '¿Qué fue lo último que comiste?' : '¿Qué estás por comer?'} value={meal} onChangeText={setMeal} placeholder="Pollo, ensalada, papa y agua" multiline />}
        {showHydration && <Field label="Hidratación del día" value={hydration} onChangeText={setHydration} placeholder="2 L agua + electrolitos" multiline />}
        <Field label="¿Hay algo más que deba saber?" value={notes} onChangeText={setNotes} placeholder="Opcional" multiline />

        <Pressable disabled={saving} style={[styles.primary, saving && { opacity: 0.55 }]} onPress={submit}><Text style={styles.primaryText}>{saving ? 'Actualizando…' : 'Enviar a Peppe'}</Text></Pressable>
        {!!message && <Text style={styles.notice}>{message}</Text>}
      </View>
    </ScrollView>
  );
}

function Scale({ label, value, setValue }: { label: string; value: number; setValue: (v: number) => void }) {
  return <View style={styles.scaleBlock}><View style={styles.scaleHeader}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}/10</Text></View><View style={styles.scaleButtons}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <Pressable key={n} onPress={() => setValue(n)} style={[styles.scaleButton, n === value && styles.scaleActive]}><Text style={[styles.scaleText, n === value && styles.scaleTextActive]}>{n}</Text></Pressable>)}</View></View>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, multiline, ...rest } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...rest} multiline={multiline} style={[styles.input, multiline && styles.textarea]} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, container: { padding: 18, paddingBottom: 50, gap: 10 }, center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: colors.muted }, hero: { fontSize: 32, lineHeight: 36, fontWeight: '900', letterSpacing: -1, color: colors.text }, title: { fontSize: 25, fontWeight: '900', color: colors.text }, muted: { color: colors.muted, lineHeight: 21 }, link: { color: colors.text, fontWeight: '900', padding: 10 },
  card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, gap: 18, marginTop: 8 }, scaleBlock: { gap: 10 }, scaleHeader: { flexDirection: 'row', justifyContent: 'space-between' }, label: { fontWeight: '900', color: '#374151' }, value: { fontWeight: '900', color: colors.text },
  scaleButtons: { flexDirection: 'row', gap: 4 }, scaleButton: { flex: 1, minHeight: 34, borderRadius: 8, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }, scaleActive: { backgroundColor: colors.text }, scaleText: { fontSize: 11, fontWeight: '800', color: colors.muted }, scaleTextActive: { color: 'white' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }, small: { color: colors.muted, marginTop: 3, fontSize: 12 }, field: { gap: 7 }, input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, backgroundColor: 'white', fontSize: 16 }, textarea: { minHeight: 80, textAlignVertical: 'top' },
  primary: { backgroundColor: colors.text, borderRadius: 12, padding: 15, alignItems: 'center' }, primaryText: { color: 'white', fontWeight: '900' }, notice: { color: '#415477', lineHeight: 20 },
});
