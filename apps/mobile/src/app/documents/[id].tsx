import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { Button, Card, ErrorText, Input, colors, styles } from '@/components/ui';
import { errorMessage, useAuth } from '@/lib/auth-context';
import { shortDate } from '@/lib/extras';
import { openSignatureDocument } from '@/lib/open-document';
import type { SignatureRequest } from '@/lib/self-service';

/** Read and sign one document (S3-06): open it, type your name, tick to agree. Same rules as the website. */
export default function SignDocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { request, accessToken, user } = useAuth();
  const [doc, setDoc] = useState<SignatureRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(user ? `${user.firstName} ${user.lastName}` : '');
  const [agreed, setAgreed] = useState(false);
  const [opened, setOpened] = useState(false);
  const [opening, setOpening] = useState(false);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    request<SignatureRequest[]>('/signature-requests/mine')
      .then(({ data }) => {
        const found = data.find((r) => r.id === id);
        if (found) setDoc(found);
        else setError('This document isn’t available any more.');
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id, request]);

  const open = async () => {
    setOpening(true);
    setError(null);
    try {
      await openSignatureDocument(id, await accessToken());
      setOpened(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOpening(false);
    }
  };

  const sign = async () => {
    if (!name.trim()) return setError('Type your full name to sign.');
    if (!agreed) return setError('Tick the box to confirm you have read and agree to it.');
    setSigning(true);
    setError(null);
    try {
      const { data } = await request<SignatureRequest>(`/signature-requests/${id}/sign`, { method: 'POST', body: { typedName: name.trim(), agreed: true } });
      setDoc(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSigning(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: doc?.status === 'pending' ? 'Read and sign' : 'Document' }} />
      {doc && <Text style={styles.title}>{doc.document.title}</Text>}
      <ErrorText>{error}</ErrorText>

      {doc?.status === 'signed' && (
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Ionicons name="checkmark-circle" size={28} color={colors.success} />
          <Text style={{ flex: 1, color: colors.text, fontSize: 16 }}>
            Signed{doc.signedAt ? ` on ${shortDate(doc.signedAt.slice(0, 10))}` : ''}
            {doc.signedName ? ` as “${doc.signedName}”` : ''}. Thank you.
          </Text>
        </Card>
      )}

      {doc && doc.status !== 'cancelled' && <Button title={opened ? 'Open it again' : 'Open the document'} icon="document-text-outline" variant="secondary" busy={opening} onPress={() => void open()} />}

      {doc?.status === 'pending' && (
        <Card style={{ gap: 14 }}>
          {!opened && <Text style={{ color: colors.muted, fontSize: 14 }}>Please open and read the document before you sign.</Text>}
          <Input label="Type your full name to sign" value={name} onChangeText={setName} autoComplete="name" maxLength={200} />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            onPress={() => setAgreed(!agreed)}
            style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}
          >
            <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={26} color={agreed ? colors.brand : colors.muted} />
            <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>
              I have read “{doc.document.title}” and agree to it. I understand typing my name is my signature.
            </Text>
          </Pressable>
          <Button title="Sign" icon="create-outline" busy={signing} onPress={() => void sign()} />
        </Card>
      )}

      {doc?.status === 'signed' && <Button title="Back to my documents" variant="secondary" onPress={() => router.back()} />}
      {doc?.status === 'cancelled' && <Text style={styles.subtitle}>The office cancelled this request. Nothing to do.</Text>}
    </ScrollView>
  );
}
