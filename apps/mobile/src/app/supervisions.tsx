import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, ErrorText, Pill, SectionTitle, colors, styles } from '@/components/ui';
import { errorMessage, useAuth } from '@/lib/auth-context';
import { shortDate } from '@/lib/extras';
import type { SupervisionDue, SupervisionSession } from '@/lib/self-service';

/** Supervisions, appraisals and spot checks (S3-06): what's booked, and records to read and sign. */
export default function SupervisionsScreen() {
  const { request } = useAuth();
  const [data, setData] = useState<{ due: SupervisionDue[]; sessions: SupervisionSession[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [signing, setSigning] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = (await request<{ id: string }>('/staff/me')).data;
      setData((await request<{ due: SupervisionDue[]; sessions: SupervisionSession[] }>(`/staff/${me.id}/supervisions`)).data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [request]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const sign = async (id: string) => {
    setSigning(true);
    setError(null);
    try {
      const text = comment.trim();
      await request(`/supervisions/${id}/acknowledge`, { method: 'POST', body: text ? { comment: text } : {} });
      setComment('');
      setOpen(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSigning(false);
    }
  };

  const booked = data?.sessions.filter((s) => s.status === 'scheduled') ?? [];
  const held = data?.sessions.filter((s) => s.status === 'completed') ?? [];
  const toSign = held.filter((s) => !s.acknowledgedAt);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          tintColor={colors.brand}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <ErrorText>{error}</ErrorText>
      {data && (
        <Text style={styles.subtitle}>
          {toSign.length ? `${toSign.length} record${toSign.length === 1 ? '' : 's'} to read and sign.` : 'Your manager writes up each one; you read it and sign it here.'}
        </Text>
      )}

      {booked.length > 0 && (
        <>
          <SectionTitle>Booked</SectionTitle>
          {booked.map((s) => (
            <Card key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="calendar-outline" size={22} color={colors.brand} />
              <Text style={{ flex: 1, color: colors.text, fontSize: 16 }}>
                {s.typeLabel} on {s.scheduledFor ? shortDate(s.scheduledFor) : ''}
                {s.supervisor ? ` with ${s.supervisor.name}` : ''}
              </Text>
            </Card>
          ))}
        </>
      )}

      {held.length > 0 && <SectionTitle>Records</SectionTitle>}
      {held.map((s) => {
        const isOpen = open === s.id;
        return (
          <Card key={s.id} style={{ gap: 10 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? null : s.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                  {s.typeLabel} · {s.heldOn ? shortDate(s.heldOn) : ''}
                </Text>
                {s.supervisor && <Text style={{ color: colors.muted, fontSize: 13 }}>with {s.supervisor.name}</Text>}
              </View>
              {s.acknowledgedAt ? <Pill status="completed" label="Signed" /> : <Pill status="in_progress" label="To sign" />}
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#94a3b8" />
            </Pressable>
            {isOpen && (
              <>
                <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>{s.notes ?? 'No notes recorded.'}</Text>
                {s.staffComment && <Text style={{ color: colors.muted, fontSize: 14 }}>Your comment: {s.staffComment}</Text>}
                {!s.acknowledgedAt && (
                  <>
                    <TextInput
                      accessibilityLabel="Your comment (optional)"
                      placeholder="Your comment (optional)"
                      placeholderTextColor="#8a93a6"
                      multiline
                      maxLength={3000}
                      value={comment}
                      onChangeText={setComment}
                      style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                    />
                    <Button title="I have read this record" icon="checkmark-done-outline" busy={signing} onPress={() => void sign(s.id)} />
                  </>
                )}
              </>
            )}
          </Card>
        );
      })}

      {data && booked.length === 0 && held.length === 0 && (
        <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
          <Ionicons name="clipboard-outline" size={34} color={colors.brand} />
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Nothing yet</Text>
          <Text style={[styles.subtitle, { textAlign: 'center' }]}>Your supervisions and appraisals will appear here.</Text>
        </Card>
      )}

      {data && data.due.length > 0 && (
        <>
          <SectionTitle>Next due</SectionTitle>
          <Card style={{ gap: 8 }}>
            {data.due.map((d) => (
              <View key={d.type} style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>{d.label}</Text>
                <Text style={{ color: d.scheduled ? colors.brand : colors.muted, fontSize: 15 }}>
                  {d.scheduled ? `Booked ${d.scheduled.scheduledFor ? shortDate(d.scheduled.scheduledFor) : ''}` : `Due ${shortDate(d.dueOn)}`}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}
