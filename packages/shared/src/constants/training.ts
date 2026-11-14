import { DEFAULT_REQUIRED_CREDENTIALS } from './onboarding.js';
import type { Discipline } from './staff.js';

/**
 * The 16 Care Certificate standards (Skills for Care, 2025 update), signed off one by one by an assessor (S3-02).
 * New care staff should complete them within 12 weeks of starting. Check the titles against the current Skills for
 * Care list when it changes.
 */
export const CARE_CERTIFICATE_STANDARDS: readonly { number: number; title: string }[] = [
  { number: 1, title: 'Understand your role' },
  { number: 2, title: 'Your personal development' },
  { number: 3, title: 'Duty of care' },
  { number: 4, title: 'Equality, diversity, inclusion and human rights' },
  { number: 5, title: 'Work in a person-centred way' },
  { number: 6, title: 'Communication' },
  { number: 7, title: 'Privacy and dignity' },
  { number: 8, title: 'Fluids and nutrition' },
  { number: 9, title: 'Awareness of mental health and dementia' },
  { number: 10, title: 'Safeguarding adults' },
  { number: 11, title: 'Safeguarding children' },
  { number: 12, title: 'Basic life support' },
  { number: 13, title: 'Health and safety' },
  { number: 14, title: 'Handling information' },
  { number: 15, title: 'Infection prevention and control' },
  { number: 16, title: 'Awareness of learning disability and autism' },
];

/** Weeks a new care worker has to complete the Care Certificate. */
export const CARE_CERTIFICATE_WEEKS = 12;

/** Roles that do the Care Certificate (those whose required checks include it). */
export function needsCareCertificate(discipline: string): boolean {
  return (DEFAULT_REQUIRED_CREDENTIALS[discipline as Discipline] ?? []).includes('care_certificate');
}

/** Columns of the training matrix: training types (credential types) and who needs each (S3-02). */
const NURSES: Discipline[] = ['nurse', 'nurse_rmn', 'nurse_rnld'];
const CARE_ROLES: Discipline[] = ['care_worker', 'senior_care_worker', 'support_worker', 'team_leader', 'hca', ...NURSES];
const EVERYONE: Discipline[] = [...CARE_ROLES, 'ahp', 'doctor', 'care_coordinator', 'manager', 'office'];
/** Supported living roles (S-030): people who may support someone whose behaviour can challenge. */
const SUPPORTED_LIVING: Discipline[] = ['support_worker', 'senior_care_worker', 'team_leader', 'nurse_rmn', 'nurse_rnld'];
export const TRAINING_MATRIX: readonly { type: string; label: string; neededBy: readonly Discipline[] }[] = [
  { type: 'care_certificate', label: 'Care Certificate', neededBy: ['care_worker', 'senior_care_worker', 'support_worker', 'team_leader', 'hca'] },
  { type: 'safeguarding', label: 'Safeguarding', neededBy: EVERYONE },
  { type: 'moving_handling', label: 'Moving & handling', neededBy: CARE_ROLES },
  { type: 'infection_control', label: 'Infection control', neededBy: CARE_ROLES },
  { type: 'first_aid', label: 'First aid / basic life support', neededBy: CARE_ROLES },
  { type: 'health_safety', label: 'Health & safety', neededBy: EVERYONE },
  { type: 'fire_safety', label: 'Fire safety', neededBy: EVERYONE },
  { type: 'medication_training', label: 'Medication', neededBy: ['senior_care_worker', 'team_leader', ...NURSES] },
  // Complex care (S5-03, S-030): Support Health Care Ltd's supported living covers learning disability, autism, mental
  // health, DoLS and the Mental Health Act.
  // The Health and Care Act 2022 requires CQC-registered providers to train staff in learning disability and autism
  // appropriate to their role; the Oliver McGowan Mandatory Training is the government's recommended package.
  { type: 'oliver_mcgowan', label: 'Oliver McGowan (learning disability & autism)', neededBy: EVERYONE },
  { type: 'mca_dols', label: 'Mental Capacity Act & DoLS', neededBy: [...CARE_ROLES, 'ahp', 'doctor', 'manager'] },
  { type: 'mental_health', label: 'Mental health awareness', neededBy: CARE_ROLES },
  // Restrictive practice training should be certified against the Restraint Reduction Network (RRN) standards.
  { type: 'pbs_restrictive', label: 'Positive behaviour support & restrictive practice (RRN)', neededBy: SUPPORTED_LIVING },
  { type: 'epilepsy', label: 'Epilepsy & rescue medication', neededBy: ['support_worker', 'senior_care_worker', 'team_leader', 'nurse_rnld'] },
  // Only for people whose care plan needs it, so nobody needs it by default: it shows when recorded.
  { type: 'clinical_skills', label: 'Clinical skills (PEG, catheter, tracheostomy)', neededBy: [] },
];

export type TrainingCellState = 'valid' | 'expiring_soon' | 'expired' | 'missing' | 'not_needed';
