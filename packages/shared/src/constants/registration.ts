import type { Discipline } from './staff.js';

/**
 * Professional registration (S5-01, S-027). Nurses, allied health professionals and doctors may only work while on
 * their professional register. Before they start, and when the registration renews, someone checks the public online
 * register and records the number, the renewal date and that they checked. Stored as an ordinary staff credential
 * (type below): number = PIN/registration number, expiry = renewal date, verified = register checked.
 */
export type RegistrationType = 'nmc_registration' | 'hcpc_registration' | 'gmc_registration';

export interface ProfessionalRegister {
  type: RegistrationType;
  body: 'NMC' | 'HCPC' | 'GMC';
  /** Full name of the register body. */
  bodyName: string;
  label: string;
  numberLabel: string;
  /** Example of a well-formed number, for the form's hint. FAKE. */
  example: string;
  pattern: RegExp;
  /** Where to check the public register. */
  registerUrl: string;
  /** What the "renewal date" means for this register, shown next to the date field. */
  renewalHelp: string;
  roles: readonly Discipline[];
}

export const PROFESSIONAL_REGISTERS: readonly ProfessionalRegister[] = [
  {
    type: 'nmc_registration',
    body: 'NMC',
    bodyName: 'Nursing and Midwifery Council',
    label: 'NMC registration',
    numberLabel: 'NMC PIN',
    example: '12A3456E',
    pattern: /^\d{2}[A-Z]\d{4}[A-Z]$/,
    registerUrl: 'https://www.nmc.org.uk/registration/search-the-register/',
    renewalHelp: 'The renewal date on the NMC register. Nurses pay a fee every year and revalidate every 3 years.',
    roles: ['nurse', 'nurse_rmn', 'nurse_rnld'],
  },
  {
    type: 'hcpc_registration',
    body: 'HCPC',
    bodyName: 'Health and Care Professions Council',
    label: 'HCPC registration',
    numberLabel: 'HCPC registration number',
    example: 'OT12345',
    pattern: /^[A-Z]{2}\d{4,6}$/,
    registerUrl: 'https://www.hcpc-uk.org/check-the-register/',
    renewalHelp: 'The "registered until" date on the HCPC register. Each profession renews every 2 years.',
    roles: ['ahp'],
  },
  {
    type: 'gmc_registration',
    body: 'GMC',
    bodyName: 'General Medical Council',
    label: 'GMC registration and licence to practise',
    numberLabel: 'GMC reference number',
    example: '1234567',
    pattern: /^\d{7}$/,
    registerUrl: 'https://www.gmc-uk.org/registrants',
    renewalHelp: 'The next revalidation date (every 5 years). Check the licence to practise is shown on the register.',
    roles: ['doctor'],
  },
];

/** The register a role must be on, or null for roles that don't need one. */
export function registerFor(discipline: string): ProfessionalRegister | null {
  return PROFESSIONAL_REGISTERS.find((r) => (r.roles as readonly string[]).includes(discipline)) ?? null;
}

export function registerByType(type: string): ProfessionalRegister | null {
  return PROFESSIONAL_REGISTERS.find((r) => r.type === type) ?? null;
}

/** Tidies a registration number as typed (spaces, lower case) into the register's form. */
export function normaliseRegistrationNumber(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** A problem with a registration number for this credential type, or null when it's fine (or not a register type). */
export function registrationNumberProblem(type: string, number: string | null | undefined): string | null {
  const register = registerByType(type);
  if (!register || !number) return null;
  return register.pattern.test(normaliseRegistrationNumber(number))
    ? null
    : `${register.numberLabel} should look like ${register.example}. Check it against the ${register.body} register.`;
}
