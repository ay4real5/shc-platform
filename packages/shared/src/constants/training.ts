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
const CARE_ROLES: Discipline[] = ['care_worker', 'senior_care_worker', 'support_worker', 'team_leader', 'nurse'];
const EVERYONE: Discipline[] = [...CARE_ROLES, 'care_coordinator', 'manager', 'office'];
export const TRAINING_MATRIX: readonly { type: string; label: string; neededBy: readonly Discipline[] }[] = [
  { type: 'care_certificate', label: 'Care Certificate', neededBy: ['care_worker', 'senior_care_worker', 'support_worker', 'team_leader'] },
  { type: 'safeguarding', label: 'Safeguarding', neededBy: EVERYONE },
  { type: 'moving_handling', label: 'Moving & handling', neededBy: CARE_ROLES },
  { type: 'infection_control', label: 'Infection control', neededBy: CARE_ROLES },
  { type: 'first_aid', label: 'First aid / basic life support', neededBy: CARE_ROLES },
  { type: 'health_safety', label: 'Health & safety', neededBy: EVERYONE },
  { type: 'fire_safety', label: 'Fire safety', neededBy: EVERYONE },
  { type: 'medication_training', label: 'Medication', neededBy: ['senior_care_worker', 'team_leader'] },
];

export type TrainingCellState = 'valid' | 'expiring_soon' | 'expired' | 'missing' | 'not_needed';
