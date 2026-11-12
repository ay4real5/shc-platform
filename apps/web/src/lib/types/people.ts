/**
 * Staff and user shapes as returned by the API (see apps/api/src/modules/{staff,users}).
 * Kept in sync by hand for now (DECISIONS D-035).
 */

export interface RoleOption {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface UserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  is2faEnabled: boolean;
  isLocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { id: string; name: string }[];
}

export interface ActivityEntry {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface StaffSummary {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  discipline: string;
  employmentType: string;
  isActive: boolean;
  skills: string[];
  languages: string[];
}

export interface StaffDetail extends StaffSummary {
  email: string;
  phone: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  dateOfBirth: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  postcode: string | null;
  emergencyContact: { name: string | null; phone: string | null; relationship: string | null };
  canDrive: boolean;
  gender: string | null;
  notes: string | null;
  /** Only present for people who can see pay, and the person themselves. */
  pay?: {
    hourlyRate: string | null;
    overtimeRate: string | null;
    mileageRate: string | null;
    /** Last three characters of the NI number, e.g. "56C"; the full number is never sent. */
    niNumberEnding: string | null;
  };
}

export interface Credential {
  id: string;
  credentialType: string;
  credentialName: string;
  credentialNumber: string | null;
  issuingAuthority: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  alertDaysBefore: number;
  state: 'valid' | 'expiring_soon' | 'expired' | 'no_expiry';
  verifiedById: string | null;
  verifiedAt: string | null;
  notes: string | null;
}

export interface ExpiringCredential extends Credential {
  staff: { id: string; firstName: string; lastName: string; discipline: string };
}

export interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface TimeOff {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  notes: string | null;
  approvedById: string | null;
  createdAt: string;
}

export interface StaffCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** A time-off request as returned by `GET /time-off` (D-090). */
export interface TimeOffRequest {
  id: string;
  staff: { id: string; userId: string; firstName: string; lastName: string; discipline: string };
  startDate: string;
  endDate: string;
  days: number;
  type: string;
  status: string;
  notes: string | null;
  decidedBy: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
  /** For approvers on pending requests: the person's visits already booked in those days. */
  bookedVisits?: number;
}
