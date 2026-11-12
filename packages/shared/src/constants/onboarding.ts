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
};

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
    item('emergency_contact', 'Emergency contact', facts.hasEmergencyContact, 'office', 'Who to call if something happens at work.', false),
  ];
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.done).length;
  const percent = required.length ? Math.round((done / required.length) * 100) : 100;
  return { percent, ready: done === required.length, items };
}
