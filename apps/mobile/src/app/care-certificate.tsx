import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Card, ErrorText, colors, styles } from '@/components/ui';
import { errorMessage, useAuth } from '@/lib/auth-context';
import { shortDate } from '@/lib/extras';
import { careCertificateText, type CareCertificate } from '@/lib/self-service';

/** Care Certificate progress (S3-06): the 16 standards and which a manager has signed off. Read-only. */
export default function CareCertificateScreen() {
  const { request } = useAuth();
  const [cc, setCc] = useState<CareCertificate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const me = (await request<{ id: string }>('/staff/me')).data;
          setCc((await request<CareCertificate>(`/staff/${me.id}/care-certificate`)).data);
        } catch (e) {
          setError(errorMessage(e));
        }
      })();
    }, [request]),
  );

  const summary = careCertificateText(cc);
  const pct = cc && cc.total ? Math.round((cc.completed / cc.total) * 100) : 0;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: 40 }}
      // Awarded without sign-offs here (e.g. a certificate from a previous employer): no empty checklist.
      data={cc && !(cc.awarded && cc.completed === 0) ? cc.standards : []}
      keyExtractor={(s) => String(s.number)}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 6 }}>
          <ErrorText>{error}</ErrorText>
          {cc && (
            <Card style={{ gap: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>{summary ?? 'You don’t need the Care Certificate'}</Text>
              {summary && !cc.awarded && (
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.brandSoft, overflow: 'hidden' }}>
                  <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.brand }} />
                </View>
              )}
              {cc.awarded?.issueDate && <Text style={{ color: colors.success }}>Awarded {shortDate(cc.awarded.issueDate)}</Text>}
              {cc.dueBy && !cc.awarded && <Text style={{ color: cc.overdue ? colors.danger : colors.muted }}>Aim to finish by {shortDate(cc.dueBy)}</Text>}
              <Text style={styles.subtitle}>Your manager signs off each standard once they’ve seen you do it.</Text>
            </Card>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name={item.completedOn ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={item.completedOn ? colors.success : colors.muted} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
              {item.number}. {item.title}
            </Text>
            {item.completedOn && (
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                Signed off {shortDate(item.completedOn)}
                {item.signedOffBy ? ` by ${item.signedOffBy.name}` : ''}
              </Text>
            )}
          </View>
        </Card>
      )}
    />
  );
}
