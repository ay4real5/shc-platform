import {
  DBS_CERTIFICATE_NUMBER,
  DBS_LEVELS,
  DISCIPLINE_LABELS,
  DISCIPLINES,
  EMPLOYMENT_TYPES,
  IMPORT_COLUMNS,
  IMPORT_CREDENTIALS,
  IMPORT_MAX_ROWS,
  importHeaderKey,
  parseCsv,
  parseUkDate,
  parseYesNo,
  type DbsLevel,
  type Discipline,
  type EmploymentType,
} from '@alora/shared';
import { PHONE, UK_POSTCODE } from '../../common/validators/fields.js';

/**
 * The pure half of the staff import (S4-01): CSV text → one plan per row, with every problem found before anything is
 * saved. No database access; the service passes in who already exists.
 */

export interface ImportPlanRow {
  /** Spreadsheet row number (the header is row 1). */
  row: number;
  firstName: string;
  lastName: string;
  email: string;
  discipline: Discipline | null;
  employmentType: EmploymentType;
  phone: string | null;
  hireDate: string | null;
  employeeId: string | null;
  dateOfBirth: string | null;
  addressLine1: string | null;
  town: string | null;
  postcode: string | null;
  hourlyRate: number | null;
  rtw: { checkedOn: string; permission: 'unlimited' | 'time_limited'; followUpOn: string | null } | null;
  dbs: { certificateNumber: string; issueDate: string; level: DbsLevel; result: 'clear' | 'information'; updateService: boolean } | null;
  referencesChecked: boolean;
  historyChecked: boolean;
  credentials: { type: string; label: string; issueDate: string | null; expiryDate: string | null }[];
  /** Any error means this row is not imported. */
  errors: string[];
  /** Imported, but worth a look. */
  warnings: string[];
  /** Already has a login: left alone (so a sheet can be uploaded again after fixing rows). */
  skip: string | null;
}

export interface ImportPlan {
  /** Problems with the whole file; nothing can be imported while there are any. */
  fileErrors: string[];
  /** Columns that were not recognised (ignored). */
  ignoredColumns: string[];
  rows: ImportPlanRow[];
}

export interface ImportContext {
  /** Agency's today, YYYY-MM-DD. */
  today: string;
  /** Lower-case emails that already have a login (any company: logins are unique across SHC). */
  existingEmails: Set<string>;
  /** Employee IDs already used in this company (lower-case). */
  existingEmployeeIds: Set<string>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');

const DISCIPLINE_BY_TEXT = new Map<string, Discipline>(
  DISCIPLINES.flatMap((d) => [
    [norm(d), d],
    [norm(DISCIPLINE_LABELS[d]), d],
  ]),
);
DISCIPLINE_BY_TEXT.set('carer', 'care_worker');
DISCIPLINE_BY_TEXT.set('seniorcarer', 'senior_care_worker');
DISCIPLINE_BY_TEXT.set('registeredmanager', 'manager');
DISCIPLINE_BY_TEXT.set('coordinator', 'care_coordinator');

const CONTRACT_BY_TEXT = new Map<string, EmploymentType>(EMPLOYMENT_TYPES.map((t) => [norm(t), t]));
CONTRACT_BY_TEXT.set('fulltime', 'full_time');
CONTRACT_BY_TEXT.set('ft', 'full_time');
CONTRACT_BY_TEXT.set('parttime', 'part_time');
CONTRACT_BY_TEXT.set('pt', 'part_time');
CONTRACT_BY_TEXT.set('zerohour', 'zero_hours');
CONTRACT_BY_TEXT.set('zhc', 'zero_hours');
CONTRACT_BY_TEXT.set('relief', 'bank');

/** "Enhanced with adults barred list" and similar wording → a DBS level. */
export function parseDbsLevel(value: string): DbsLevel | null {
  const v = norm(value);
  if (!v) return null;
  if ((DBS_LEVELS as readonly string[]).includes(value.trim())) return value.trim() as DbsLevel;
  if (v.includes('basic')) return 'basic';
  if (v.includes('standard')) return 'standard';
  if (!v.includes('enhanced')) return null;
  if (v.includes('both') || (v.includes('adult') && v.includes('child'))) return 'enhanced_barred_both';
  if (v.includes('adult') || v.includes('barred')) return 'enhanced_barred_adults';
  return 'enhanced';
}

export function planImport(csv: string, ctx: ImportContext): ImportPlan {
  const table = parseCsv(csv);
  const plan: ImportPlan = { fileErrors: [], ignoredColumns: [], rows: [] };
  if (!table.length) {
    plan.fileErrors.push('The file is empty. Download the template, fill it in and save it as CSV.');
    return plan;
  }
  const [headers, ...body] = table;
  const byHeader = new Map(IMPORT_COLUMNS.map((c) => [importHeaderKey(c.header), c]));
  const index = new Map<string, number>();
  headers.forEach((h, i) => {
    const column = byHeader.get(importHeaderKey(h));
    if (column && !index.has(column.key)) index.set(column.key, i);
    else if (h.trim()) plan.ignoredColumns.push(h.trim());
  });
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !index.has(c.key)).map((c) => c.header);
  if (missing.length) plan.fileErrors.push(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Use the template's headers.`);
  if (body.length > IMPORT_MAX_ROWS) plan.fileErrors.push(`Too many rows: ${body.length}. Upload at most ${IMPORT_MAX_ROWS} at a time.`);
  if (!body.length) plan.fileErrors.push('There are no staff rows under the headers.');
  if (plan.fileErrors.length) return plan;

  const seenEmails = new Map<string, number>();
  const seenIds = new Map<string, number>();
  body.forEach((cells, i) => {
    const rowNumber = i + 2;
    const get = (key: string) => {
      const at = index.get(key);
      return at === undefined ? '' : (cells[at] ?? '').trim();
    };
    const errors: string[] = [];
    const warnings: string[] = [];
    const date = (key: string, label: string, opts: { notFuture?: boolean } = {}) => {
      const raw = get(key);
      if (!raw) return null;
      const iso = parseUkDate(raw);
      if (!iso) {
        errors.push(`${label}: "${raw}" isn't a date (use day/month/year, e.g. 14/03/2022)`);
        return null;
      }
      if (opts.notFuture && iso > ctx.today) {
        errors.push(`${label} is in the future`);
        return null;
      }
      return iso;
    };

    const firstName = get('firstName');
    const lastName = get('lastName');
    const email = get('email').toLowerCase();
    if (!firstName) errors.push('First name is blank');
    if (!lastName) errors.push('Last name is blank');
    if (firstName.length > 100 || lastName.length > 100) errors.push('Name is too long');
    let skip: string | null = null;
    if (!email) errors.push('Email is blank');
    else if (!EMAIL.test(email) || email.length > 255) errors.push(`Email "${email}" doesn't look right`);
    else if (seenEmails.has(email)) errors.push(`Same email as row ${seenEmails.get(email)}`);
    else {
      seenEmails.set(email, rowNumber);
      if (ctx.existingEmails.has(email)) skip = 'Already has a login in SHC, so left as it is';
    }

    const roleText = get('jobRole');
    const discipline = DISCIPLINE_BY_TEXT.get(norm(roleText)) ?? null;
    if (!roleText) errors.push('Job role is blank');
    else if (!discipline) errors.push(`Job role "${roleText}" isn't one SHC knows (see the guide)`);

    const contractText = get('contract');
    let employmentType: EmploymentType = 'full_time';
    if (contractText) {
      const found = CONTRACT_BY_TEXT.get(norm(contractText));
      if (found) employmentType = found;
      else errors.push(`Contract "${contractText}" should be Full time, Part time, Zero hours, Bank or Contractor`);
    }

    const phone = get('phone') || null;
    if (phone && !PHONE.test(phone)) errors.push(`Phone "${phone}" doesn't look like a phone number`);

    const employeeId = get('employeeId') || null;
    if (employeeId) {
      const key = employeeId.toLowerCase();
      if (employeeId.length > 50) errors.push('Employee ID is too long');
      else if (seenIds.has(key)) errors.push(`Same employee ID as row ${seenIds.get(key)}`);
      else if (ctx.existingEmployeeIds.has(key) && !skip) errors.push(`Employee ID ${employeeId} is already used by someone in SHC`);
      if (!seenIds.has(key)) seenIds.set(key, rowNumber);
    }

    const postcodeRaw = get('postcode').toUpperCase().replace(/\s+/g, ' ');
    const postcode = postcodeRaw || null;
    if (postcode && !UK_POSTCODE.test(postcode)) errors.push(`Postcode "${postcode}" isn't a UK postcode`);

    const rateText = get('hourlyRate').replace(/^£/, '');
    let hourlyRate: number | null = null;
    if (rateText) {
      const n = Number(rateText);
      if (!/^\d+(\.\d{1,2})?$/.test(rateText) || n > 1000) errors.push(`Hourly rate "${get('hourlyRate')}" should be pounds, e.g. 12.60`);
      else hourlyRate = n;
    }

    const hireDate = date('startDate', 'Start date');
    const dateOfBirth = date('dateOfBirth', 'Date of birth', { notFuture: true });

    // Right to Work
    let rtw: ImportPlanRow['rtw'] = null;
    if (get('rtwCheckedOn') || get('rtwPermission') || get('rtwFollowUpOn')) {
      const checkedOn = date('rtwCheckedOn', 'Right to Work checked on', { notFuture: true });
      const followUpOn = date('rtwFollowUpOn', 'Right to Work follow-up date');
      const typeText = norm(get('rtwPermission'));
      const permission = ['notimelimit', 'unlimited', 'permanent', 'indefinite', 'british', 'irish'].some((w) => typeText.includes(w))
        ? 'unlimited'
        : typeText.includes('time') || typeText.includes('limited')
          ? 'time_limited'
          : null;
      if (!get('rtwCheckedOn')) errors.push('Right to Work: the check date is blank');
      if (!permission) errors.push('Right to Work type should be "No time limit" or "Time-limited"');
      if (permission === 'time_limited' && !get('rtwFollowUpOn')) errors.push('Right to Work: time-limited needs the follow-up date (when their permission ends)');
      if (permission === 'unlimited' && followUpOn) warnings.push('Right to Work: no time limit, so the follow-up date was ignored');
      if (checkedOn && followUpOn && permission === 'time_limited' && followUpOn < checkedOn) errors.push('Right to Work: the follow-up date is before the check');
      if (permission === 'time_limited' && followUpOn && followUpOn < ctx.today) warnings.push('Right to Work follow-up is overdue: do a new check');
      if (checkedOn && permission) rtw = { checkedOn, permission, followUpOn: permission === 'time_limited' ? followUpOn : null };
    }

    // DBS
    let dbs: ImportPlanRow['dbs'] = null;
    if (get('dbsNumber') || get('dbsIssueDate') || get('dbsLevel') || get('dbsResult')) {
      const certificateNumber = get('dbsNumber').replace(/[\s-]/g, '');
      const issueDate = date('dbsIssueDate', 'DBS issue date', { notFuture: true });
      const level = parseDbsLevel(get('dbsLevel'));
      const resultText = norm(get('dbsResult'));
      const result = resultText === 'clear' || resultText === 'clean' ? 'clear' : resultText.startsWith('info') ? 'information' : null;
      const updateService = parseYesNo(get('dbsUpdateService'));
      if (!DBS_CERTIFICATE_NUMBER.test(certificateNumber)) errors.push('DBS certificate number should be 12 digits');
      if (!get('dbsIssueDate')) errors.push('DBS issue date is blank');
      if (!level) errors.push('DBS level should be e.g. "Enhanced with adults barred list"');
      if (!result) errors.push('DBS result should be "Clear" or "Information"');
      if (updateService === null) errors.push('DBS Update Service should be Yes or No');
      if (result === 'information') warnings.push('DBS shows information: a manager must decide on it in SHC before they count as cleared');
      if (level && !['enhanced_barred_adults', 'enhanced_barred_both'].includes(level)) warnings.push('DBS level is not enough for care work (needs enhanced with the adults barred list)');
      if (DBS_CERTIFICATE_NUMBER.test(certificateNumber) && issueDate && level && result && updateService !== null) {
        dbs = { certificateNumber, issueDate, level, result, updateService };
      }
    }

    const yes = (key: string, label: string) => {
      const v = parseYesNo(get(key));
      if (v === null) errors.push(`${label} should be Yes or No`);
      return v === true;
    };
    const referencesChecked = yes('referencesChecked', 'References checked');
    const historyChecked = yes('historyChecked', 'Employment history checked');

    const credentials: ImportPlanRow['credentials'] = [];
    for (const c of IMPORT_CREDENTIALS) {
      const issueDate = date(`cred:${c.type}:date`, `${c.label} date`, { notFuture: true });
      const expiryDate = date(`cred:${c.type}:expires`, `${c.label} expires`);
      if (issueDate && expiryDate && expiryDate < issueDate) errors.push(`${c.label}: expires before its date`);
      else if (issueDate || expiryDate) {
        credentials.push({ type: c.type, label: c.label, issueDate, expiryDate });
        if (expiryDate && expiryDate < ctx.today) warnings.push(`${c.label} has expired`);
      }
    }

    plan.rows.push({
      row: rowNumber,
      firstName,
      lastName,
      email,
      discipline,
      employmentType,
      phone,
      hireDate,
      employeeId,
      dateOfBirth,
      addressLine1: get('addressLine1').slice(0, 255) || null,
      town: get('town').slice(0, 100) || null,
      postcode,
      hourlyRate,
      rtw,
      dbs,
      referencesChecked,
      historyChecked,
      credentials,
      errors,
      warnings,
      skip: errors.length ? null : skip,
    });
  });
  return plan;
}

/** One line for the preview: what will go on their file. */
export function planSummary(row: ImportPlanRow): string[] {
  const out: string[] = [];
  if (row.rtw) out.push(row.rtw.permission === 'unlimited' ? 'Right to Work (no time limit)' : `Right to Work (follow-up ${row.rtw.followUpOn})`);
  if (row.dbs) out.push(`DBS${row.dbs.updateService ? ' (Update Service)' : ''}`);
  if (row.referencesChecked) out.push('References (paper file)');
  if (row.historyChecked) out.push('Employment history (paper file)');
  if (row.credentials.length) out.push(`${row.credentials.length} training/other check${row.credentials.length > 1 ? 's' : ''}`);
  return out;
}
