import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { pickEvidenceImage, takeEvidencePhoto } from '../lib/evidence';
import { buildPeppeSnapshot } from '../lib/intelligence';
import { buildAdaptiveQuestions, saveAdaptiveAnswers, type AdaptiveQuestionContext, type PeppeQuestion } from '../lib/questionEngine';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

const SUMMARY_ROUTE = '/summary' as Href;
const EVIDENCE_ROUTE = '/evidence' as Href;

type AnswerValue = string | number;

export default function CheckinScreen() {
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [context, setContext] = useState<AdaptiveQuestionContext | null>(null);
  const [questions, setQuestions] = useState<PeppeQuestion[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/');
        return;
      }

      setAthleteId(data.user.id);
      try {
        const nextContext = await buildAdaptiveQuestions(data.user.id);
        setContext(nextContext);
        setQuestions(nextContext.questions);

        if (nextContext.questions.length === 0) {
          await buildPeppeSnapshot(data.user.id, true).catch(() => null);
          router.replace(SUMMARY_ROUTE);
          return;
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No pude preparar tus preguntas.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const current = questions[step] ?? null;
  const currentAnswer = current ? answers[current.id] : undefined;
  const progress = questions.length ? Math.round(((step + 1) / questions.length) * 100) : 100;

  const canContinue = useMemo(() => {
    if (!current) return false;
    if (current.id === 'meal_description') {
      if (answers.meal_recent === 'no') return true;
      const hasText = typeof currentAnswer === 'string' && currentAnswer.trim().length > 0;
      const hasPhoto = typeof answers.meal_photo_path === 'string' && answers.meal_photo_path.length > 0;
      return hasText || hasPhoto;
    }
    if (current.kind === 'text') return typeof currentAnswer === 'string' && currentAnswer.trim().length > 0;
    return currentAnswer !== undefined && currentAnswer !== '';
  }, [current, currentAnswer, answers.meal_recent, answers.meal_photo_path]);

  async function attachMealPhoto(mode: 'camera' | 'library') {
    if (!athleteId) return;
    setPhotoSaving(true);
    setMessage('');
    try {
      const result = mode === 'camera'
        ? await takeEvidencePhoto(athleteId, 'food_photo', 'camera')
        : await pickEvidenceImage(athleteId, 'food_photo', 'other');
      if (!result) return;
      setAnswers((prev) => ({ ...prev, meal_photo_path: result.path, meal_photo_evidence_id: result.id }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pude guardar la foto.');
    } finally {
      setPhotoSaving(false);
    }
  }

  async function continueFlow() {
    if (!current || !context || !athleteId) return;

    let nextStep = step + 1;
    if (current.id === 'meal_recent' && currentAnswer === 'no' && questions[nextStep]?.id === 'meal_description') nextStep += 1;

    if (nextStep < questions.length) {
      setStep(nextStep);
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await saveAdaptiveAnswers(athleteId, context, answers);
      await buildPeppeSnapshot(athleteId, true);
      router.replace(SUMMARY_ROUTE);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pude guardar este momento.');
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (step === 0) {
      router.replace('/');
      return;
    }
    setStep((value) => Math.max(0, value - 1));
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.eyebrow}>PEPPE · PREPARANDO TU MOMENTO</Text>
        <Text style={styles.centerTitle}>Primero reviso lo que ya sé.</Text>
        <Text style={styles.muted}>Después te preguntaré sólo lo que pueda cambiar la recomendación.</Text>
      </View>
    );
  }

  if (!current || !context) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>No pude preparar este momento.</Text>
        <Text style={styles.muted}>{message || 'Vuelve a intentarlo desde el inicio.'}</Text>
        <Pressable style={styles.primary} onPress={() => router.replace('/')}><Text style={styles.primaryText}>Volver</Text></Pressable>
      </View>
    );
  }

  const mealPhotoSaved = typeof answers.meal_photo_path === 'string' && answers.meal_photo_path.length > 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <Pressable onPress={goBack}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.progressLabel}>Pregunta {step + 1} de {questions.length}</Text>
      </View>

      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>

      <View style={styles.contextCard}>
        <Text style={styles.eyebrowLight}>{context.postTraining ? 'POST ENTRENAMIENTO' : 'PEPPE · AHORA'}</Text>
        <Text style={styles.contextTitle}>{context.postTraining ? `Ya detecté tu ${context.activitySport || 'entrenamiento'}.` : 'Ya revisé tus datos automáticos.'}</Text>
        <Text style={styles.contextBody}>No voy a repetirte preguntas que Apple Health, tu historial o las futuras integraciones ya puedan responder.</Text>
        <Pressable style={styles.evidenceLink} onPress={() => router.push(EVIDENCE_ROUTE)}>
          <Text style={styles.evidenceLinkText}>＋ Agregar pantallazo de Garmin, TrainingPeaks, Strava o Salud</Text>
        </Pressable>
      </View>

      <View style={styles.questionCard}>
        <Text style={styles.category}>{categoryLabel(current.category)}</Text>
        <Text style={styles.question}>{current.title}</Text>
        {!!current.helper && <Text style={styles.helper}>{current.helper}</Text>}

        {current.kind === 'scale' && (
          <View style={styles.scaleGrid}>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => {
              const active = currentAnswer === value;
              return (
                <Pressable key={value} style={[styles.scaleButton, active && styles.scaleButtonActive]} onPress={() => setAnswers((prev) => ({ ...prev, [current.id]: value }))}>
                  <Text style={[styles.scaleText, active && styles.scaleTextActive]}>{value}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {current.kind === 'choice' && (
          <View style={styles.choiceWrap}>
            {(current.options ?? []).map((option) => {
              const active = currentAnswer === option.value;
              return (
                <Pressable key={option.value} style={[styles.choice, active && styles.choiceActive]} onPress={() => setAnswers((prev) => ({ ...prev, [current.id]: option.value }))}>
                  <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {current.id === 'meal_description' && answers.meal_recent !== 'no' && (
          <View style={styles.photoBlock}>
            <View style={styles.photoActions}>
              <Pressable disabled={photoSaving} style={styles.photoPrimary} onPress={() => attachMealPhoto('camera')}>
                <Text style={styles.photoPrimaryText}>{photoSaving ? 'Guardando…' : '📷 Sacar foto'}</Text>
              </Pressable>
              <Pressable disabled={photoSaving} style={styles.photoSecondary} onPress={() => attachMealPhoto('library')}>
                <Text style={styles.photoSecondaryText}>Elegir foto</Text>
              </Pressable>
            </View>
            {mealPhotoSaved && <View style={styles.photoSaved}><Text style={styles.photoSavedText}>✓ Foto guardada. Peppe la usará como evidencia nutricional.</Text></View>}
          </View>
        )}

        {current.kind === 'text' && !(current.id === 'meal_description' && answers.meal_recent === 'no') && (
          <TextInput
            value={typeof currentAnswer === 'string' ? currentAnswer : ''}
            onChangeText={(value) => setAnswers((prev) => ({ ...prev, [current.id]: value }))}
            placeholder={current.placeholder}
            placeholderTextColor="#9CA3AF"
            multiline
            style={styles.textarea}
          />
        )}

        {current.id === 'meal_description' && answers.meal_recent === 'no' && (
          <View style={styles.skipNotice}><Text style={styles.skipNoticeText}>Entendido. No necesitas describir una comida que no ocurrió.</Text></View>
        )}
      </View>

      {!!message && <View style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View>}

      <Pressable disabled={!canContinue || saving || photoSaving} style={[styles.primary, (!canContinue || saving || photoSaving) && styles.primaryDisabled]} onPress={continueFlow}>
        <Text style={styles.primaryText}>{saving ? 'Construyendo tu recomendación…' : step === questions.length - 1 ? 'Ver mi recomendación' : 'Continuar'}</Text>
      </Pressable>

      <Text style={styles.footer}>Cada respuesta y evidencia se combina con tus datos automáticos y tu historia. Los pantallazos quedan pendientes de análisis/confirmación antes de convertirse en métricas. Peppe no diagnostica ni reemplaza a tu entrenador o a profesionales de salud.</Text>
    </ScrollView>
  );
}

function categoryLabel(category: PeppeQuestion['category']) {
  if (category === 'training') return 'ENTRENAMIENTO';
  if (category === 'nutrition') return 'NUTRICIÓN';
  if (category === 'goal') return 'OBJETIVO';
  return 'SENSACIONES';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingTop: 54, paddingBottom: 50, gap: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 28, gap: 12 },
  centerTitle: { fontSize: 30, lineHeight: 34, fontWeight: '900', color: colors.text, textAlign: 'center' },
  muted: { color: colors.muted, lineHeight: 21, textAlign: 'center' },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  eyebrowLight: { color: '#AEB8C9', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: 28, color: colors.text, fontWeight: '700' },
  progressLabel: { color: colors.muted, fontWeight: '800', fontSize: 12 },
  progressTrack: { height: 7, borderRadius: 99, backgroundColor: '#E3E7EC', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.text, borderRadius: 99 },
  contextCard: { backgroundColor: colors.dark, borderRadius: 22, padding: 20, gap: 8 },
  contextTitle: { color: 'white', fontSize: 25, lineHeight: 29, fontWeight: '900' },
  contextBody: { color: '#BBC4D2', lineHeight: 20 },
  evidenceLink: { marginTop: 7, borderTopWidth: 1, borderTopColor: '#263244', paddingTop: 12 },
  evidenceLinkText: { color: 'white', fontWeight: '800', lineHeight: 20 },
  questionCard: { backgroundColor: 'white', borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 16 },
  category: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  question: { color: colors.text, fontSize: 31, lineHeight: 35, fontWeight: '900', letterSpacing: -0.8 },
  helper: { color: colors.muted, lineHeight: 20 },
  scaleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scaleButton: { width: '17%', minHeight: 48, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  scaleButtonActive: { backgroundColor: colors.text },
  scaleText: { fontWeight: '900', color: colors.muted, fontSize: 16 },
  scaleTextActive: { color: 'white' },
  choiceWrap: { gap: 10 },
  choice: { minHeight: 56, borderRadius: 14, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', paddingHorizontal: 16 },
  choiceActive: { backgroundColor: colors.text, borderColor: colors.text },
  choiceText: { color: colors.text, fontWeight: '900', fontSize: 17 },
  choiceTextActive: { color: 'white' },
  photoBlock: { gap: 10 },
  photoActions: { flexDirection: 'row', gap: 8 },
  photoPrimary: { flex: 1, backgroundColor: colors.text, borderRadius: 13, padding: 14, alignItems: 'center' },
  photoPrimaryText: { color: 'white', fontWeight: '900' },
  photoSecondary: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: 'white', borderRadius: 13, padding: 14, alignItems: 'center' },
  photoSecondaryText: { color: colors.text, fontWeight: '900' },
  photoSaved: { backgroundColor: colors.success, borderRadius: 12, padding: 12 },
  photoSavedText: { color: colors.text, fontWeight: '800', lineHeight: 18 },
  textarea: { minHeight: 105, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: '#FAFBFC', padding: 15, fontSize: 16, color: colors.text, textAlignVertical: 'top' },
  skipNotice: { backgroundColor: colors.soft, borderRadius: 12, padding: 14 },
  skipNoticeText: { color: colors.muted, fontWeight: '700' },
  primary: { backgroundColor: colors.text, borderRadius: 14, padding: 16, alignItems: 'center' },
  primaryDisabled: { opacity: 0.38 },
  primaryText: { color: 'white', fontWeight: '900', fontSize: 16 },
  notice: { backgroundColor: colors.warning, borderRadius: 14, padding: 14 },
  noticeText: { color: colors.text, fontWeight: '700' },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
