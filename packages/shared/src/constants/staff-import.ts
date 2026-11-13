/**
 * Staff spreadsheet import (S4-01): bring an agency's existing staff into SHC in one upload — their login, staff
 * record, Right to Work, DBS, training and paper-file checks. The office fills in a CSV template (Excel: "Save as CSV
 * UTF-8"); the API checks every row and shows a preview before anything is saved.
 */
import { TRAINING_MATRIX } from './training.js';

export interface ImportColumn {
  /** Field key used by the API. */
  key: string;
  /** Header in the template (matched ignoring case, spaces and punctuation). */
  header: string;
  /** Shown under the header in the guide. */
  help: string;
  required?: boolean;
  /** Example value for the template's sample row. */
  example: string;
}

/** Credentials imported as "<label> date" / "<label> expires" pairs. */
export const IMPORT_CREDENTIALS: readonly { type: string; label: string }[] = [
  ...TRAINING_MATRIX.map((t) => ({ type: t.type, label: t.label })),
  { type: 'nmc_registration', label: 'NMC registration' },
  { type: 'driving_licence', label: 'Driving licence' },
  { type: 'car_insurance', label: 'Car insurance' },
];

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: 'firstName', header: 'First name', help: 'Required.', required: true, example: 'Sample' },
  { key: 'lastName', header: 'Last name', help: 'Required.', required: true, example: 'Person' },
  { key: 'email', header: 'Email', help: 'Required. Their login; must be unique.', required: true, example: 'sample.person@example.com' },
  { key: 'phone', header: 'Phone', help: 'Mobile number.', example: '07700 900000' },
  { key: 'jobRole', header: 'Job role', help: 'Care worker, Senior care worker, Support worker, Team leader, Nurse, Care coordinator, Manager or Office.', required: true, example: 'Care worker' },
  { key: 'contract', header: 'Contract', help: 'Full time, Part time, Zero hours, Bank or Contractor. Blank = Full time.', example: 'Part time' },
  { key: 'startDate', header: 'Start date', help: 'Date they started, e.g. 14/03/2022.', example: '14/03/2022' },
  { key: 'employeeId', header: 'Employee ID', help: 'Payroll number, if you use one.', example: 'E1001' },
  { key: 'dateOfBirth', header: 'Date of birth', help: 'e.g. 02/07/1990.', example: '' },
  { key: 'addressLine1', header: 'Address', help: 'First line of their address.', example: '' },
  { key: 'town', header: 'Town', help: '', example: '' },
  { key: 'postcode', header: 'Postcode', help: '', example: '' },
  { key: 'hourlyRate', header: 'Hourly rate', help: 'Pounds, e.g. 12.60.', example: '12.60' },
  { key: 'rtwCheckedOn', header: 'Right to Work checked on', help: 'Date of their last Right to Work check.', example: '10/03/2022' },
  { key: 'rtwPermission', header: 'Right to Work type', help: '"No time limit" or "Time-limited".', example: 'No time limit' },
  { key: 'rtwFollowUpOn', header: 'Right to Work follow-up date', help: 'Time-limited only: when their permission ends.', example: '' },
  { key: 'dbsNumber', header: 'DBS certificate number', help: '12 digits.', example: '001234567890' },
  { key: 'dbsIssueDate', header: 'DBS issue date', help: 'Date on the certificate.', example: '01/03/2022' },
  { key: 'dbsLevel', header: 'DBS level', help: '"Enhanced with adults barred list", "Enhanced with both barred lists", "Enhanced", "Standard" or "Basic".', example: 'Enhanced with adults barred list' },
  { key: 'dbsResult', header: 'DBS result', help: '"Clear" or "Information". Information needs a manager decision in SHC afterwards.', example: 'Clear' },
  { key: 'dbsUpdateService', header: 'DBS Update Service', help: '"Yes" if they subscribe to the Update Service.', example: 'Yes' },
  { key: 'referencesChecked', header: 'References checked', help: '"Yes" if two references are on their paper file.', example: 'Yes' },
  { key: 'historyChecked', header: 'Employment history checked', help: '"Yes" if a full work history with gaps explained is on their paper file.', example: 'Yes' },
  ...IMPORT_CREDENTIALS.flatMap((c) => [
    { key: `cred:${c.type}:date`, header: `${c.label} date`, help: 'Date completed or issued.', example: c.type === 'safeguarding' ? '20/03/2022' : '' },
    { key: `cred:${c.type}:expires`, header: `${c.label} expires`, help: 'Renewal date, if it has one.', example: c.type === 'safeguarding' ? '20/03/2025' : '' },
  ]),
];

/** Most rows one upload may hold. */
export const IMPORT_MAX_ROWS = 500;

/** Header text → column key, ignoring case, spaces and punctuation ("first_name", "First Name" and "FIRSTNAME" all match). */
export const importHeaderKey = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Reads CSV text (RFC 4180: quoted fields, doubled quotes, commas and line breaks inside quotes; CRLF or LF; a UTF-8
 * byte-order mark from Excel is dropped). Wholly empty lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const pushRow = () => {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
    field = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      pushRow();
    } else field += ch;
  }
  if (field !== '' || row.length) pushRow();
  return rows;
}

/** One CSV cell, quoted when needed. */
const csvCell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

/** The template: headers and one clearly fake sample row to replace. */
export function importTemplateCsv(): string {
  return [IMPORT_COLUMNS.map((c) => csvCell(c.header)).join(','), IMPORT_COLUMNS.map((c) => csvCell(c.example)).join(',')].join('\r\n') + '\r\n';
}

/**
 * A UK date from a spreadsheet: 14/03/2022, 14-03-2022, 14.03.2022, 4/3/2022 or 2022-03-14. Returns YYYY-MM-DD, or null
 * when it isn't a real date. Day comes first (UK order); two-digit years are refused because they are ambiguous.
 */
export function parseUkDate(value: string): string | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === iso ? iso : null;
}

/** "Yes"/"Y"/"True"/"1"/"x"/"✓" → true; blank or "No" → false; anything else → null (unclear). */
export function parseYesNo(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'x', '✓', '✔'].includes(v)) return true;
  if (['', 'no', 'n', 'false', '0'].includes(v)) return false;
  return null;
}
