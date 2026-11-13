/**
 * CQC inspection pack (S4-02). For each person, the staff-file items an inspector checks under Regulation 19 /
 * Schedule 3 (Health and Social Care Act 2008 (Regulated Activities) Regulations 2014), plus Right to Work (the law)
 * and supervision (Regulation 18). Pure: the API gathers the facts, this decides what's in order.
 */
import { DEFAULT_REQUIRED_CREDENTIALS, credentialTypeLabel } from './onboarding.js';
import type { HealthStatus } from './health.js';
import { credentialState, type Discipline } from './staff.js';
import { DEFAULT_SUPERVISION_INTERVALS, supervisionDueOn } from './supervisions.js';
import { CARE_CERTIFICATE_WEEKS, TRAINING_MATRIX } from './training.js';

/** ok = in order; paper = recorded, evidence held outside SHC (have it ready); attention = act soon; missing = gap. */
export type InspectionStatus = 'ok' | 'paper' | 'attention' | 'missing';

export interface InspectionItem {
  key: 'identity' | 'right_to_work' | 'dbs' | 'conduct' | 'history' | 'qualifications' | 'health' | 'supervision';
  title: string;
  /** Schedule 3 paragraph, or null when it isn't a Schedule 3 item. */
  schedule3: number | null;
  status: InspectionStatus;
  summary: string;
  details: string[];
}

export interface InspectionCredential {
  type: string;
  name: string;
  number: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  /** Someone in SHC checked it (false = imported or added without checking). */
  verified: boolean;
  hasDocument: boolean;
  notes: string | null;
}

export interface InspectionFacts {
  discipline: string;
  hireDate: string | null;
  /** Latest passed Right to Work check. */
  rightToWork: { method: string; methodLabel: string; checkedOn: string; permission: string; followUpOn: string | null; hasDocument: boolean } | null;
  /** Latest DBS certificate. */
  dbs: { certificateNumber: string; issueDate: string; levelLabel: string; result: string; decision: string | null; updateService: boolean; statusChanged: boolean; nextDueOn: string; lastStatusCheckOn: string | null } | null;
  /** Active credentials (one per type: the newest). */
  credentials: InspectionCredential[];
  /** References received and verified in SHC. */
  verifiedReferences: number;
  /** Hired through SHC's application form (full history with gaps explained). */
  fromApplication: boolean;
  health: HealthStatus;
  /** Last completed sessions. */
  lastSupervision: string | null;
  lastAppraisal: string | null;
  /** Staff documents by type (counts), for evidence. */
  documentTypes: Record<string, number>;
}

const fmt = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function inspectionItems(f: InspectionFacts, today: string): InspectionItem[] {
  const cred = (type: string) => f.credentials.find((c) => c.type === type) ?? null;
  const docs = (type: string) => f.documentTypes[type] ?? 0;
  const items: InspectionItem[] = [];

  // 1. Identity, with a recent photograph: proved by the Right to Work check (passport / share code photo).
  const rtw = f.rightToWork;
  const imported = rtw?.method === 'imported';
  items.push({
    key: 'identity',
    title: 'Proof of identity and a recent photograph',
    schedule3: 1,
    status: !rtw ? 'missing' : imported && !docs('identification') && !docs('right_to_work') ? 'paper' : 'ok',
    summary: !rtw
      ? 'Not proven: there is no Right to Work check.'
      : imported
        ? `Checked before SHC (${fmt(rtw.checkedOn)}). Keep the ID copy with a photo on file.`
        : `Confirmed with the photo during the Right to Work check on ${fmt(rtw.checkedOn)}.`,
    details: docs('identification') ? [`${docs('identification')} ID document${docs('identification') > 1 ? 's' : ''} on file`] : [],
  });

  // Right to Work (Immigration, Asylum and Nationality Act 2006).
  {
    let status: InspectionStatus = 'ok';
    let summary = '';
    const details: string[] = [];
    if (!rtw) {
      status = 'missing';
      summary = 'No Right to Work check recorded. They must not work until one is done.';
    } else {
      summary = `${rtw.methodLabel}, ${fmt(rtw.checkedOn)}. ${rtw.permission === 'unlimited' ? 'No time limit.' : `Permission ends ${rtw.followUpOn ? fmt(rtw.followUpOn) : 'on a date not recorded'}.`}`;
      if (rtw.followUpOn && rtw.followUpOn < today) {
        status = 'missing';
        details.push(`Follow-up check overdue since ${fmt(rtw.followUpOn)}.`);
      } else if (rtw.followUpOn && rtw.followUpOn <= addDays(today, 28)) {
        status = 'attention';
        details.push(`Follow-up check due ${fmt(rtw.followUpOn)}.`);
      }
      const evidence = rtw.hasDocument || docs('right_to_work') > 0;
      if (!evidence && status === 'ok') status = imported ? 'paper' : 'attention';
      details.push(evidence ? 'Copy of the check on file.' : imported ? 'Evidence is on the paper file: have it ready.' : 'No copy of the check saved: upload it to their file.');
    }
    items.push({ key: 'right_to_work', title: 'Right to Work', schedule3: null, status, summary, details });
  }

  // 2. Enhanced DBS with the adults' barred list.
  {
    const c = cred('dbs_enhanced');
    const d = f.dbs;
    let status: InspectionStatus = 'ok';
    let summary: string;
    const details: string[] = [];
    if (!d || !c) {
      status = 'missing';
      summary = 'No DBS certificate recorded.';
    } else {
      summary = `${d.levelLabel}, certificate ${d.certificateNumber}, issued ${fmt(d.issueDate)}${d.updateService ? ', on the Update Service' : ''}.`;
      if (d.result === 'information' && !d.decision) {
        status = 'missing';
        details.push('Shows information: waiting for a manager’s risk-assessed decision.');
      } else if (d.result === 'information' && d.decision === 'not_approved') {
        status = 'missing';
        details.push('Shows information and was not approved.');
      } else if (d.statusChanged) {
        status = 'missing';
        details.push('The Update Service reported new information: a new check is needed.');
      } else if (c.expiryDate && c.expiryDate < today) {
        status = 'missing';
        details.push(`${d.updateService ? 'Status check' : 'New check'} overdue since ${fmt(c.expiryDate)}.`);
      } else {
        if (d.result === 'information') details.push('Shows information: approved by a manager after a risk assessment.');
        if (c.expiryDate && c.expiryDate <= addDays(today, 30)) {
          status = 'attention';
          details.push(`${d.updateService ? 'Status check' : 'New check'} due ${fmt(c.expiryDate)}.`);
        } else details.push(`Next ${d.updateService ? 'status check' : 'check'} ${fmt(d.nextDueOn)}.`);
        if (d.lastStatusCheckOn) details.push(`Last Update Service check ${fmt(d.lastStatusCheckOn)}.`);
        if (!c.verified && status === 'ok') {
          status = 'paper';
          details.push('Recorded before SHC: check it on the Update Service or keep the certificate details on file.');
        }
      }
    }
    items.push({ key: 'dbs', title: 'Enhanced DBS check', schedule3: 2, status, summary, details });
  }

  // 3 & 4. Conduct in previous care work and why it ended: references.
  {
    const paper = cred('references');
    const refDocs = docs('reference');
    let status: InspectionStatus;
    let summary: string;
    if (f.verifiedReferences >= 2) {
      status = 'ok';
      summary = `${f.verifiedReferences} references received and verified in SHC.`;
    } else if (paper) {
      status = 'paper';
      summary = 'References checked and held on the paper file: have them ready.';
    } else if (f.verifiedReferences === 1) {
      status = 'attention';
      summary = 'Only 1 of 2 references received and verified.';
    } else {
      status = 'missing';
      summary = 'No references on record.';
    }
    items.push({
      key: 'conduct',
      title: 'Conduct in previous care work (references)',
      schedule3: 3,
      status,
      summary,
      details: refDocs ? [`${refDocs} reference document${refDocs > 1 ? 's' : ''} on file`] : [],
    });
  }

  // 6. Full employment history with written explanations of gaps.
  items.push({
    key: 'history',
    title: 'Full employment history, gaps explained',
    schedule3: 6,
    status: f.fromApplication ? 'ok' : cred('employment_history') ? 'paper' : 'missing',
    summary: f.fromApplication
      ? 'Given on their SHC application, with any gaps explained.'
      : cred('employment_history')
        ? 'Checked and held on the paper file: have it ready.'
        : 'No employment history on record.',
    details: [],
  });

  // 5. Qualifications and training for the role.
  {
    const needed = [
      ...TRAINING_MATRIX.filter((t) => (t.neededBy as readonly string[]).includes(f.discipline)).map((t) => ({ type: t.type, label: t.label })),
      ...(DEFAULT_REQUIRED_CREDENTIALS[f.discipline as Discipline] ?? [])
        .filter((t) => !['right_to_work', 'dbs_enhanced'].includes(t) && !TRAINING_MATRIX.some((m) => m.type === t))
        .map((t) => ({ type: t, label: credentialTypeLabel(t) })),
    ];
    const details: string[] = [];
    let worst: InspectionStatus = 'ok';
    const raise = (s: InspectionStatus) => {
      const rank = { ok: 0, paper: 1, attention: 2, missing: 3 };
      if (rank[s] > rank[worst]) worst = s;
    };
    const ccDeadline = f.hireDate ? addDays(f.hireDate, CARE_CERTIFICATE_WEEKS * 7) : null;
    for (const n of needed) {
      const c = cred(n.type);
      if (!c) {
        if (n.type === 'care_certificate' && ccDeadline && ccDeadline >= today) {
          raise('attention');
          details.push(`${n.label}: in progress, due by ${fmt(ccDeadline)}.`);
        } else {
          raise('missing');
          details.push(`${n.label}: not on file.`);
        }
        continue;
      }
      const state = credentialState(c.expiryDate, 30, today);
      if (state === 'expired') {
        raise('missing');
        details.push(`${n.label}: expired ${fmt(c.expiryDate!)}.`);
      } else if (state === 'expiring_soon') {
        raise('attention');
        details.push(`${n.label}: renew by ${fmt(c.expiryDate!)}.`);
      } else details.push(`${n.label}: ${c.issueDate ? `done ${fmt(c.issueDate)}` : 'on file'}${c.expiryDate ? `, valid to ${fmt(c.expiryDate)}` : ''}.`);
    }
    const certs = docs('training_certificate') + docs('qualification');
    if (certs) details.push(`${certs} certificate${certs > 1 ? 's' : ''} on file.`);
    const gaps = details.filter((d) => /not on file|expired/.test(d)).length;
    items.push({
      key: 'qualifications',
      title: 'Qualifications and training for the role',
      schedule3: 5,
      status: needed.length ? worst : 'ok',
      summary: !needed.length ? 'No set training for this role.' : gaps ? `${gaps} of ${needed.length} missing or expired.` : `${needed.length} required item${needed.length > 1 ? 's' : ''} in date.`,
      details,
    });
  }

  // 7. Health: physically and mentally able to do the work.
  const health = {
    cleared: { status: 'ok', summary: 'Health questionnaire reviewed: fit for the role.' },
    submitted: { status: 'attention', summary: 'Health questionnaire filled in, waiting for a manager to review it.' },
    referred: { status: 'attention', summary: 'Referred to occupational health: keep the outcome on file.' },
    none: { status: 'missing', summary: 'No health questionnaire on record.' },
  } as const;
  items.push({ key: 'health', title: 'Health: able to do the work', schedule3: 7, status: health[f.health].status, summary: health[f.health].summary, details: [] });

  // Supervision and appraisal (Regulation 18).
  {
    const supDue = supervisionDueOn(f.lastSupervision, f.hireDate, today, DEFAULT_SUPERVISION_INTERVALS.supervision);
    const appDue = supervisionDueOn(f.lastAppraisal, f.hireDate, today, DEFAULT_SUPERVISION_INTERVALS.appraisal);
    const overdue = [supDue < today ? 'supervision' : null, appDue < today ? 'appraisal' : null].filter(Boolean);
    items.push({
      key: 'supervision',
      title: 'Supervision and appraisal',
      schedule3: null,
      status: overdue.length ? 'attention' : 'ok',
      summary: overdue.length ? `Overdue: ${overdue.join(' and ')}.` : 'Up to date.',
      details: [
        `Last supervision: ${f.lastSupervision ? fmt(f.lastSupervision) : 'none recorded'} (next due ${fmt(supDue)}).`,
        `Last appraisal: ${f.lastAppraisal ? fmt(f.lastAppraisal) : 'none recorded'} (next due ${fmt(appDue)}).`,
      ],
    });
  }
  const ORDER: InspectionItem['key'][] = ['identity', 'right_to_work', 'dbs', 'conduct', 'qualifications', 'history', 'health', 'supervision'];
  return items.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
}

/** Counts per status; "ready" when nothing is missing. */
export function inspectionSummary(items: InspectionItem[]): { ok: number; paper: number; attention: number; missing: number; ready: boolean } {
  const count = (s: InspectionStatus) => items.filter((i) => i.status === s).length;
  return { ok: count('ok'), paper: count('paper'), attention: count('attention'), missing: count('missing'), ready: count('missing') === 0 };
}

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  ok: 'In order',
  paper: 'On paper file',
  attention: 'Needs attention',
  missing: 'Missing',
};
