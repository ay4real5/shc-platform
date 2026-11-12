import type { Discipline } from './staff.js';

/**
 * Checks each job role needs on file before working (D-101, S-002) — the credential side of CQC Regulation 19 /
 * Schedule 3. Companies can change this per role; these are the defaults. Values are credential types as entered on a
 * staff member's credentials (compared lower-case).
 */
const CARE: string[] = ['right_to_work', 'dbs_enhanced', 'care_certificate'];
const OFFICE: string[] = ['right_to_work', 'dbs_enhanced'];
export const DEFAULT_REQUIRED_CREDENTIALS: Record<Discipline, string[]> = {
  care_worker: CARE,
  senior_care_worker: [...CARE, 'medication_training'],
  support_worker: CARE,
  team_leader: [...CARE, 'medication_training'],
  nurse: ['right_to_work', 'dbs_enhanced', 'nmc_registration'],
  care_coordinator: OFFICE,
  manager: OFFICE,
  office: ['right_to_work'],
};

export const CREDENTIAL_TYPE_LABELS: Record<string, string> = {
  right_to_work: 'Right to Work check',
  dbs_enhanced: 'Enhanced DBS (adult barred list)',
  care_certificate: 'Care Certificate',
  medication_training: 'Medication training',
  nmc_registration: 'NMC registration',
  moving_handling: 'Moving & handling',
  safeguarding: 'Safeguarding adults',
  first_aid: 'First aid',
  driving_licence: 'Driving licence',
  car_insurance: 'Car insurance (business use)',
  employment_history: 'Employment history checked (paper file)',
  references: 'Two references checked (paper file)',
};

/**
 * CQC Regulation 19 / Schedule 3 items on the checklist (S2-06): identity and Right to Work, DBS, conduct in previous
 * care work (references), full employment history, qualifications, and health. Identity is proved by the Right to
 * Work check (passport, share code photo).
 */
export const CQC_SCHEDULE_3_KEYS = ['credential:right_to_work', 'credential:dbs_enhanced', 'references', 'employment_history', 'health_declaration'] as const;

export function credentialTypeLabel(type: string): string {
  return CREDENTIAL_TYPE_LABELS[type] ?? type.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export interface OnboardingFacts {
  signedIn: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  hasHireDate: boolean;
  hasPayRate: boolean;
  hasAvailability: boolean;
  hasEmergencyContact: boolean;
  /** Contracts and policies sent for signature (S2-04), and how many are signed. Optional: 0 when none were sent. */
  documentsToSign?: number;
  documentsSigned?: number;
  /** Health declaration (S2-05). Left out = not tracked (no item). */
  health?: 'none' | 'submitted' | 'cleared' | 'referred';
  /** S2-06. Left out = not tracked. Hired through an application (history with gaps explained), or a paper check. */
  employmentHistory?: boolean;
  /** S2-06. Received and verified references in the system. */
  verifiedReferences?: number;
  /** Credential types (lower-case) with an active, unexpired credential. */
  validCredentialTypes: string[];
  /** Credential types on file but expired. */
  expiredCredentialTypes: string[];
}

export interface OnboardingItem {
  key: string;
  label: string;
  done: boolean;
  /** Optional items are shown but don't count towards "ready". */
  required: boolean;
  detail: string | null;
  /** Who usually fixes it. */
  owner: 'caregiver' | 'office';
  /** Part of CQC Schedule 3 (S2-06). */
  cqc?: boolean;
}

export interface OnboardingChecklist {
  percent: number;
  ready: boolean;
  items: OnboardingItem[];
}

/** The checklist from facts about one staff member (pure; D-101). */
export function onboardingChecklist(facts: OnboardingFacts, requiredCredentials: string[]): OnboardingChecklist {
  const item = (key: string, label: string, done: boolean, owner: OnboardingItem['owner'], detail: string | null = null, required = true): OnboardingItem => ({
    key,
    label,
    done,
    required,
    detail: done ? null : detail,
    owner,
  });
  const valid = new Set(facts.validCredentialTypes);
  const expired = new Set(facts.expiredCredentialTypes);
  const items: OnboardingItem[] = [
    item('signed_in', 'Signed in to the app', facts.signedIn, 'caregiver', 'Send the welcome email again from Users if they lost it.'),
    item('phone', 'Phone number', facts.hasPhone, 'office'),
    item('address', 'Home address', facts.hasAddress, 'office', 'Needed for their staff file and payroll.'),
    item('hire_date', 'Start date', facts.hasHireDate, 'office'),
    item('pay_rate', 'Pay rate', facts.hasPayRate, 'office', 'Hourly rate, for payroll.'),
    item('availability', 'Weekly availability', facts.hasAvailability, 'office', 'When they can work, for rotas.'),
    ...requiredCredentials.map((type) =>
      item(
        `credential:${type}`,
        credentialTypeLabel(type),
        valid.has(type),
        'office',
        expired.has(type) ? 'On file but expired — add the renewed one.' : 'Not on file — add it under Credentials.',
      ),
    ),
    ...((facts.documentsToSign ?? 0) > 0
      ? [
          item(
            'documents_signed',
            'Contracts and policies signed',
            (facts.documentsSigned ?? 0) >= facts.documentsToSign!,
            'caregiver',
            `${facts.documentsToSign! - (facts.documentsSigned ?? 0)} of ${facts.documentsToSign} still to sign.`,
          ),
        ]
      : []),
    ...(facts.health
      ? [
          item(
            'health_declaration',
            'Health questionnaire',
            facts.health === 'cleared',
            facts.health === 'none' ? 'caregiver' : 'office',
            facts.health === 'none'
              ? 'They fill it in from their home page.'
              : facts.health === 'submitted'
                ? 'Waiting for a manager to review it.'
                : 'Referred to occupational health.',
          ),
        ]
      : []),
    ...(facts.employmentHistory !== undefined
      ? [
          item(
            'employment_history',
            'Full employment history, gaps explained',
            facts.employmentHistory || valid.has('employment_history'),
            'office',
            'Comes with a hire through the careers page; for a paper file, add a check of type "employment_history".',
          ),
        ]
      : []),
    ...(facts.verifiedReferences !== undefined
      ? [
          item(
            'references',
            'Two verified references',
            facts.verifiedReferences >= 2 || valid.has('references'),
            'office',
            `${Math.min(facts.verifiedReferences, 2)} of 2 verified. Request them from the application, or add a check of type "references" for a paper file.`,
          ),
        ]
      : []),
    item('emergency_contact', 'Emergency contact', facts.hasEmergencyContact, 'office', 'Who to call if something happens at work.', false),
  ];
  for (const i of items) if ((CQC_SCHEDULE_3_KEYS as readonly string[]).includes(i.key) || (i.key.startsWith('credential:') && i.required)) i.cqc = true;
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.done).length;
  const percent = required.length ? Math.round((done / required.length) * 100) : 100;
  return { percent, ready: done === required.length, items };
}
