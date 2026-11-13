import { Ionicons } from '@expo/vector-icons';
import { todayInTimeZone } from '@alora/shared';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Card, ErrorText, GradientHeader, Pill, SectionTitle, colors, type IconName } from '@/components/ui';
import { errorMessage, useAuth } from '@/lib/auth-context';
import {
  careCertificateText,
  daysText,
  staffTasks,
  type CareCertificate,
  type HealthDetail,
  type HolidaySummary,
  type SignatureRequest,
  type StaffTask,
} from '@/lib/self-service';
import { greeting, longDate } from '@/lib/visits';

interface Onboarding {
  percent: number;
  ready: boolean;
  items: { key: string; label: string; done: boolean; required: boolean; owner: 'caregiver' | 'office' }[];
}

interface Credential {
  id: string;
  credentialName: string;
  expiryDate: string | null;
  state: 'valid' | 'expiring_soon' | 'expired' | 'no_expiry';
}

interface Course {
  id: string;
  title: string;
  status: 'not_started' | 'failed' | 'passed' | 'expired';
}

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A settled optional call's data, or a fallback: extras never break the home screen. */
const settled = <T,>(r: PromiseSettledResult<{ data: T }>, fallback: T): T => (r.status === 'fulfilled' ? r.value.data : fallback);

function QuickLink({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1 }}>
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 16 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={22} color={colors.brandDark} />
        </View>
        <Text style={{ color: colors.text, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
      </Card>
    </Pressable>
  );
}

/** Home: what this member of staff needs to do — getting started, checks to renew, training — and quick links. */
export default function HomeScreen() {
  const { user, request } = useAuth();
  const insets = useSafeAreaInsets();
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [holiday, setHoliday] = useState<HolidaySummary | null>(null);
  const [careCertificate, setCareCertificate] = useState<CareCertificate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const today = user ? todayInTimeZone(user.agencyTimezone) : null;

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = (await request<{ id: string }>('/staff/me')).data;
      const [o, c, t] = await Promise.all([
        request<Onboarding | null>('/staff/me/onboarding'),
        request<Credential[]>(`/staff/${me.id}/credentials`),
        request<Course[]>('/training/my'),
      ]);
      setOnboarding(o.data);
      setCredentials(c.data);
      setCourses(t.data);
      const [sign, health, sup, hol, cc] = await Promise.allSettled([
        request<SignatureRequest[]>('/signature-requests/mine'),
        request<HealthDetail>('/staff/me/health'),
        request<{ id: string; typeLabel: string }[]>('/supervisions/mine/to-sign'),
        request<HolidaySummary>(`/staff/${me.id}/holiday`),
        request<CareCertificate>(`/staff/${me.id}/care-certificate`),
      ]);
      setTasks(staffTasks({ toSign: settled(sign, []), health: settled<HealthDetail | null>(health, null), supervisionsToSign: settled(sup, []) }));
      setHoliday(settled<HolidaySummary | null>(hol, null));
      setCareCertificate(settled<CareCertificate | null>(cc, null));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [request]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!user) return null;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: user.agencyTimezone }).format(new Date()));
  const toRenew = credentials.filter((c) => c.state === 'expired' || c.state === 'expiring_soon');
  const training = courses.filter((c) => c.status !== 'passed');
  const todo = onboarding && !onboarding.ready ? onboarding.items.filter((i) => i.required && !i.done) : [];
  const allGood = onboarding?.ready && !toRenew.length && !training.length && !tasks.length;
  const ccText = careCertificate?.awarded ? null : careCertificateText(careCertificate);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 32 }}
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
      <GradientHeader style={{ paddingTop: insets.top + 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar first={user.firstName} last={user.lastName} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.headerSubtle, fontSize: 14, fontWeight: '600' }}>{today ? longDate(today) : ''}</Text>
            <Text style={{ color: colors.white, fontSize: 24, fontWeight: '800' }}>
              {greeting(hour)}, {user.firstName}
            </Text>
          </View>
        </View>
        {onboarding && !onboarding.ready && (
          <View style={{ marginTop: 18 }}>
            <Text style={{ color: colors.white, fontWeight: '700' }}>Getting started — {onboarding.percent}% ready</Text>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 8, overflow: 'hidden' }}>
              <View style={{ width: `${onboarding.percent}%`, height: '100%', backgroundColor: colors.accent }} />
            </View>
          </View>
        )}
      </GradientHeader>

      <View style={{ padding: 20, gap: 12 }}>
        <ErrorText>{error}</ErrorText>

        {allGood && (
          <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={28} color={colors.success} />
            <Text style={{ flex: 1, color: colors.text, fontSize: 16 }}>You&apos;re all up to date. Nothing needs doing right now.</Text>
          </Card>
        )}

        {tasks.length > 0 && (
          <>
            <SectionTitle>Needs doing</SectionTitle>
            <Card style={{ gap: 4 }}>
              {tasks.map((t) => (
                <Pressable
                  key={t.key}
                  accessibilityRole="button"
                  onPress={() => router.push(t.route as Href)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={t.icon} size={18} color={colors.accent} />
                  </View>
                  <Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' }}>{t.text}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                </Pressable>
              ))}
            </Card>
          </>
        )}

        {todo.length > 0 && (
          <>
            <SectionTitle>Still to do before you start</SectionTitle>
            <Card style={{ gap: 10 }}>
              {todo.map((i) => (
                <View key={i.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="ellipse-outline" size={18} color={colors.muted} />
                  <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>{i.label}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{i.owner === 'office' ? 'Office' : 'You'}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {toRenew.length > 0 && (
          <>
            <SectionTitle>Checks to renew</SectionTitle>
            <Card style={{ gap: 10 }}>
              {toRenew.map((c) => (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>{c.credentialName}</Text>
                  <Pill status={c.state === 'expired' ? 'missed' : 'in_progress'} label={c.state === 'expired' ? 'Expired' : `Due ${c.expiryDate ? shortDate(c.expiryDate) : ''}`} />
                </View>
              ))}
              <Text style={{ color: colors.muted, fontSize: 13 }}>Your office will help you renew these.</Text>
            </Card>
          </>
        )}

        {training.length > 0 && (
          <>
            <SectionTitle>Training</SectionTitle>
            <Card style={{ gap: 10 }}>
              {training.map((c) => (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => router.push(`/training/${c.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="school-outline" size={20} color={colors.brand} />
                  <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>{c.title}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                </Pressable>
              ))}
            </Card>
          </>
        )}

        {ccText && (
          <Pressable accessibilityRole="button" onPress={() => router.push('/care-certificate')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="ribbon-outline" size={24} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Care Certificate</Text>
                <Text style={{ color: careCertificate?.overdue ? colors.danger : colors.muted, fontSize: 14 }}>{ccText}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Card>
          </Pressable>
        )}

        <SectionTitle>Quick links</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <QuickLink icon="sunny-outline" label={holiday ? `Holiday
${daysText(holiday.remaining)} left` : 'Holiday'} onPress={() => router.push('/time-off')} />
          <QuickLink icon="school-outline" label="Training" onPress={() => router.push('/training')} />
          <QuickLink icon="document-text-outline" label="Documents" onPress={() => router.push('/documents')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <QuickLink icon="clipboard-outline" label="Supervisions" onPress={() => router.push('/supervisions')} />
          <QuickLink icon="heart-outline" label="Health form" onPress={() => router.push('/health')} />
          <QuickLink icon="chatbubbles-outline" label="Messages" onPress={() => router.push('/messages')} />
        </View>
      </View>
    </ScrollView>
  );
}
