import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Card, ErrorText, Pill, SectionTitle, colors, styles } from '@/components/ui';
import { errorMessage, useAuth } from '@/lib/auth-context';
import { shortDate } from '@/lib/extras';
import type { SignatureRequest } from '@/lib/self-service';

/** Contracts and policies sent to this person (S3-06): what's waiting to sign, and what they've signed. */
export default function DocumentsScreen() {
  const { request } = useAuth();
  const [list, setList] = useState<SignatureRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList((await request<SignatureRequest[]>('/signature-requests/mine')).data.filter((r) => r.status !== 'cancelled'));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [request]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const pending = list?.filter((r) => r.status === 'pending') ?? [];
  const signed = list?.filter((r) => r.status === 'signed') ?? [];
  const rows = [...pending, ...signed];

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 32 }}
      data={rows}
      keyExtractor={(r) => r.id}
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
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <ErrorText>{error}</ErrorText>
          {list && (
            <Text style={styles.subtitle}>
              {pending.length ? `${pending.length} waiting for your signature.` : 'Nothing waiting for your signature.'}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        list ? (
          <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
            <Ionicons name="document-text-outline" size={34} color={colors.brand} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>No documents yet</Text>
            <Text style={[styles.subtitle, { textAlign: 'center' }]}>Your contract and policies will appear here when the office sends them.</Text>
          </Card>
        ) : null
      }
      renderItem={({ item, index }) => (
        <>
          {index === pending.length && signed.length > 0 && <SectionTitle>Signed</SectionTitle>}
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.document.title}, ${item.status === 'pending' ? 'to sign' : 'signed'}`} onPress={() => router.push(`/documents/${item.id}`)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name={item.status === 'pending' ? 'create-outline' : 'checkmark-done-outline'} size={22} color={item.status === 'pending' ? colors.accent : colors.success} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{item.document.title}</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  {item.status === 'pending'
                    ? item.dueOn
                      ? `Please sign by ${shortDate(item.dueOn)}`
                      : `Sent ${shortDate(item.requestedAt.slice(0, 10))}`
                    : `Signed ${item.signedAt ? shortDate(item.signedAt.slice(0, 10)) : ''}`}
                </Text>
              </View>
              {item.status === 'pending' ? <Pill status="in_progress" label="To sign" /> : <Pill status="completed" label="Signed" />}
            </Card>
          </Pressable>
        </>
      )}
    />
  );
}
