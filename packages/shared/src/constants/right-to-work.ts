/**
 * Right to Work checks (S2-01), following the Home Office employer guide: an online check with a share code
 * (eVisas, EU Settlement Scheme), a manual check of original documents from List A (permanent) or List B
 * (time-limited), or — later — a digital identity check through a certified provider (IDSP).
 */

export const RTW_METHODS = ['share_code', 'manual_document', 'idsp'] as const;
export type RtwMethod = (typeof RTW_METHODS)[number];
export const RTW_METHOD_LABELS: Record<RtwMethod, string> = {
  share_code: 'Online check with a share code',
  manual_document: 'Manual check of original documents',
  idsp: 'Digital ID check (certified provider)',
};

/**
 * Documents accepted for a manual check (simplified from the Home Office lists). `list` A means permission with no
 * time limit (no follow-up); B1 needs a follow-up when the permission ends; B2 (a Positive Verification Notice)
 * needs a follow-up six months after the check.
 */
export const RTW_DOCUMENTS = {
  british_irish_passport: { list: 'A', label: 'British or Irish passport (can be expired)' },
  birth_certificate_with_ni: { list: 'A', label: 'UK or Irish birth/adoption certificate, with an official document showing the NI number' },
  naturalisation_certificate_with_ni: { list: 'A', label: 'Certificate of naturalisation or registration as a British citizen, with an NI document' },
  endorsed_passport: { list: 'B1', label: 'Current passport endorsed to show permission to do this work' },
  positive_verification_notice: { list: 'B2', label: 'Positive Verification Notice from the Employer Checking Service' },
} as const;
export type RtwDocumentType = keyof typeof RTW_DOCUMENTS;
export const RTW_DOCUMENT_TYPES = Object.keys(RTW_DOCUMENTS) as RtwDocumentType[];

export const RTW_PERMISSIONS = ['unlimited', 'time_limited'] as const;
export type RtwPermission = (typeof RTW_PERMISSIONS)[number];

/** Manual checks: the originals were seen with the holder there in person, or on a live video call. */
export const RTW_SEEN_HOW = ['in_person', 'video_call'] as const;

/** Remind the office this many days before a follow-up check is due. */
export const RTW_ALERT_DAYS = 28;

const addMonths = (date: string, months: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

/**
 * When the next check is due, or null when permission is unlimited. A Positive Verification Notice is good for six
 * months from the check; otherwise the follow-up is due when the permission ends.
 */
export function rtwFollowUpDate(input: {
  method: RtwMethod;
  documentType?: string | null;
  permission: RtwPermission;
  permissionExpiresOn?: string | null;
  checkedOn: string;
}): string | null {
  if (input.method === 'manual_document' && input.documentType === 'positive_verification_notice') return addMonths(input.checkedOn, 6);
  if (input.permission === 'unlimited') return null;
  return input.permissionExpiresOn ?? null;
}

/** A share code: 9 letters and digits, usually written in three groups (e.g. "W2X 4YZ 7AB"). Spaces are dropped. */
export const SHARE_CODE = /^[A-Z0-9]{9}$/;
export const normaliseShareCode = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();
