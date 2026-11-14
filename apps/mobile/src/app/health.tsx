import { Ionicons } from '@expo/vector-icons';
import { HEALTH_QUESTIONS, HEALTH_VACCINES } from '@alora/shared';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button, Card, ErrorText, Pill, colors, styles } from '@/components/ui';
import { errorMessage, useAuth } from '@/lib/auth-context';
import { shortDate } from '@/lib/extras';
import { HEALTH_STATUS_TEXT, healthBody, healthFormError, type HealthAnswer, type HealthDetail } from '@/lib/self-service';

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        borderColor: selected ? colors.brand : colors.border,
        backgroundColor: selected ? colors.brand : colors.white,
      }}
    >
      <Text style={{ color: selected ? colors.white : colors.text, fontWeight: '600', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

function Tick({ checked, label, onPress }: { checked: boolean; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 }}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? colors.brand : colors.muted} />
      <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

/** The health questionnaire (S3-06), the same questions as the website. Answers are private to the managers who need them. */
export default function HealthScreen() {
  const { request } = useAuth();
  const scroll = useRef<ScrollView>(null);
  const [current, setCurrent] = useState<HealthDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [answers, setAnswers] = useState<Record<string, HealthAnswer>>({});
  const [vaccines, setVaccines] = useState<Record<string, boolean>>({});
  const [declaration, setDeclaration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await request<HealthDetail>('/staff/me/health');
      setCurrent(data);
      setAnswers(data.answers?.answers ?? {});
      setVaccines(data.answers?.vaccines ?? {});
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [request]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const submit = async () => {
    const problem = healthFormError(answers, declaration);
    setError(problem);
    if (problem) return scroll.current?.scrollTo({ y: 0, animated: true });
    setSaving(true);
    try {
      await request('/staff/me/health', { method: 'PUT', body: healthBody(answers, vaccines) });
      setEditing(false);
      setDeclaration(false);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
      scroll.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const showForm = current && (current.status === 'none' || editing);

  return (
    <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <ErrorText>{error}</ErrorText>

      {current && !showForm && (
        <Card style={{ gap: 10 }}>
          <Pill status={current.status === 'referred' ? 'in_progress' : current.status === 'cleared' ? 'completed' : 'scheduled'} label={HEALTH_STATUS_TEXT[current.status]} />
          {current.submittedAt && <Text style={{ color: colors.muted }}>Sent {shortDate(current.submittedAt.slice(0, 10))}</Text>}
          {current.note && <Text style={{ color: colors.text, fontSize: 15 }}>Note from your manager: {current.note}</Text>}
          <Button title="Something has changed: update my answers" variant="secondary" onPress={() => setEditing(true)} />
        </Card>
      )}

      {showForm && (
        <>
          <Card style={{ backgroundColor: colors.brandSoft }}>
            <Text style={{ color: colors.ink, fontSize: 15 }}>
              Your answers are private: only managers who need to see them can, to agree any support you need. Having a health condition doesn’t stop you working with us.
            </Text>
          </Card>
          {HEALTH_QUESTIONS.map((q) => {
            const a = answers[q.key];
            return (
              <Card key={q.key} style={{ gap: 10 }}>
                <Text style={styles.label} accessibilityRole="header">
                  {q.text}
                </Text>
                <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
                  <Choice label="No" selected={a?.answer === 'no'} onPress={() => setAnswers({ ...answers, [q.key]: { answer: 'no' } })} />
                  <Choice label="Yes" selected={a?.answer === 'yes'} onPress={() => setAnswers({ ...answers, [q.key]: { answer: 'yes', details: a?.details ?? '' } })} />
                </View>
                {a?.answer === 'yes' && (
                  <TextInput
                    accessibilityLabel={`Tell us a little more: ${q.text}`}
                    placeholder="Tell us a little more"
                    placeholderTextColor="#8a93a6"
                    multiline
                    maxLength={2000}
                    value={a.details ?? ''}
                    onChangeText={(details) => setAnswers({ ...answers, [q.key]: { answer: 'yes', details } })}
                    style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                  />
                )}
              </Card>
            );
          })}
          <Card style={{ gap: 6 }}>
            <Text style={styles.label}>Vaccinations you’ve had (optional)</Text>
            {HEALTH_VACCINES.map((v) => (
              <Tick key={v.key} checked={Boolean(vaccines[v.key])} label={v.text} onPress={() => setVaccines({ ...vaccines, [v.key]: !vaccines[v.key] })} />
            ))}
          </Card>
          <Card style={{ gap: 12 }}>
            <Tick checked={declaration} label="My answers are true and complete. I’ll tell my manager if anything changes." onPress={() => setDeclaration(!declaration)} />
            <Button title="Send my answers" icon="send-outline" busy={saving} onPress={() => void submit()} />
            {editing && <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} />}
          </Card>
        </>
      )}
    </ScrollView>
  );
}
