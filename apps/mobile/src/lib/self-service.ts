import { HEALTH_QUESTIONS } from '@alora/shared';
import type { IconName } from '@/components/ui';

/** Staff self-service in the app (S3-06): the same API the website uses, no logic of its own beyond display. */

export interface SignatureRequest {
  id: string;
  document: { id: string; title: string; documentType: string; personal: boolean };
  status: 'pending' | 'signed' | 'cancelled' | string;
  dueOn: string | null;
  requestedAt: string;
  signedAt: string | null;
  signedName: string | null;
}

export interface HealthAnswer {
  answer: 'yes' | 'no';
  details?: string;
}

export interface HealthDetail {
  status: 'none' | 'submitted' | 'cleared' | 'referred';
  submittedAt: string | null;
  reviewedAt: string | null;
  note: string | null;
  answers: { answers: Record<string, HealthAnswer>; vaccines: Record<string, boolean> } | null;
}

export const HEALTH_STATUS_TEXT: Record<HealthDetail['status'], string> = {
  none: 'Not filled in yet',
  submitted: 'Sent. A manager will review it.',
  cleared: 'Reviewed: fit for the role',
  referred: 'Referred to occupational health',
};

export interface HolidaySummary {
  leaveYear: { start: string; end: string };
  entitlement: number;
  taken: number;
  booked: number;
  pending: number;
  remaining: number;
}

export interface SupervisionSession {
  id: string;
  type: string;
  typeLabel: string;
  status: 'scheduled' | 'completed' | 'cancelled' | string;
  scheduledFor: string | null;
  heldOn: string | null;
  supervisor: { id: string; name: string } | null;
  notes: string | null;
  acknowledgedAt: string | null;
  staffComment: string | null;
}

export interface SupervisionDue {
  type: string;
  label: string;
  lastHeld: string | null;
  dueOn: string;
  overdue: boolean;
  scheduled: { id: string; scheduledFor: string | null } | null;
}

export interface CareCertificate {
  needed: boolean;
  startedOn: string | null;
  dueBy: string | null;
  overdue: boolean;
  completed: number;
  total: number;
  awarded: { credentialId: string; issueDate: string | null } | null;
  standards: { number: number; title: string; completedOn: string | null; signedOffBy: { id: string; name: string } | null }[];
}

/** "1 day", "2.5 days" — holiday can be in half days. */
export function daysText(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

/** The health form check, mirroring the API: every question answered, a few words for each "yes", the declaration ticked. */
export function healthFormError(answers: Record<string, HealthAnswer | undefined>, declaration: boolean): string | null {
  for (const q of HEALTH_QUESTIONS) {
    const a = answers[q.key];
    if (!a) return 'Please answer every question.';
    if (a.answer === 'yes' && !a.details?.trim()) return 'Please add a few words for each "yes" so we know how to help.';
  }
  if (!declaration) return 'Please tick the declaration at the bottom.';
  return null;
}

/** The body the API expects (details only sent for "yes"). */
export function healthBody(answers: Record<string, HealthAnswer>, vaccines: Record<string, boolean>) {
  const clean = Object.fromEntries(
    HEALTH_QUESTIONS.map((q) => {
      const a = answers[q.key]!;
      return [q.key, a.answer === 'yes' ? { answer: 'yes', details: a.details!.trim() } : { answer: 'no' }];
    }),
  );
  return { answers: clean, vaccines, declaration: true };
}

export interface StaffTask {
  key: string;
  icon: IconName;
  text: string;
  route: string;
}

/** What the person needs to do, most important first, for the top of the home screen. */
export function staffTasks(input: { toSign: SignatureRequest[]; health: HealthDetail | null; supervisionsToSign: { id: string; typeLabel: string }[] }): StaffTask[] {
  const tasks: StaffTask[] = [];
  const pending = input.toSign.filter((r) => r.status === 'pending');
  if (pending.length === 1) tasks.push({ key: 'sign', icon: 'create-outline', text: `Sign "${pending[0]!.document.title}"`, route: `/documents/${pending[0]!.id}` });
  else if (pending.length > 1) tasks.push({ key: 'sign', icon: 'create-outline', text: `Sign ${pending.length} documents`, route: '/documents' });
  if (input.health?.status === 'none') tasks.push({ key: 'health', icon: 'heart-outline', text: 'Fill in your health questionnaire', route: '/health' });
  const sup = input.supervisionsToSign;
  if (sup.length === 1) tasks.push({ key: 'supervision', icon: 'clipboard-outline', text: `Read and sign your ${sup[0]!.typeLabel.toLowerCase()} record`, route: '/supervisions' });
  else if (sup.length > 1) tasks.push({ key: 'supervision', icon: 'clipboard-outline', text: `Read and sign ${sup.length} supervision records`, route: '/supervisions' });
  return tasks;
}

/** One line about where the Care Certificate is up to, or null when the person doesn't need one. */
export function careCertificateText(c: CareCertificate | null): string | null {
  if (!c || (!c.needed && !c.awarded && c.completed === 0)) return null;
  if (c.awarded) return 'Care Certificate complete';
  return `${c.completed} of ${c.total} standards signed off${c.overdue ? ' (past the 12 weeks)' : ''}`;
}
