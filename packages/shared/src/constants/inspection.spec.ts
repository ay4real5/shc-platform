import { inspectionItems, inspectionSummary, type InspectionCredential, type InspectionFacts } from './inspection.js';

const today = '2026-11-13';
const cred = (type: string, over: Partial<InspectionCredential> = {}): InspectionCredential => ({
  type,
  name: type,
  number: null,
  issueDate: '2026-01-10',
  expiryDate: '2027-06-01',
  verified: true,
  hasDocument: false,
  notes: null,
  ...over,
});

/** A care worker with a complete file. */
const full = (over: Partial<InspectionFacts> = {}): InspectionFacts => ({
  discipline: 'care_worker',
  hireDate: '2025-01-06',
  rightToWork: { method: 'share_code', methodLabel: 'Online check with a share code', checkedOn: '2025-01-02', permission: 'unlimited', followUpOn: null, hasDocument: true },
  dbs: { certificateNumber: '001234567890', issueDate: '2024-12-01', levelLabel: 'Enhanced, with adults’ barred list', result: 'clear', decision: null, updateService: true, statusChanged: false, nextDueOn: '2026-12-31', lastStatusCheckOn: '2025-12-31' },
  credentials: [
    cred('dbs_enhanced', { expiryDate: '2026-12-31' }),
    cred('care_certificate', { expiryDate: null }),
    ...['safeguarding', 'moving_handling', 'infection_control', 'first_aid', 'health_safety', 'fire_safety'].map((t) => cred(t)),
  ],
  verifiedReferences: 2,
  fromApplication: true,
  health: 'cleared',
  lastSupervision: '2026-10-01',
  lastAppraisal: '2026-02-01',
  documentTypes: { right_to_work: 1, training_certificate: 3 },
  ...over,
});

const byKey = (f: InspectionFacts) => Object.fromEntries(inspectionItems(f, today).map((i) => [i.key, i]));

describe('inspectionItems', () => {
  it('a complete file is in order, in Schedule 3 order', () => {
    const items = inspectionItems(full(), today);
    expect(items.map((i) => i.key)).toEqual(['identity', 'right_to_work', 'dbs', 'conduct', 'qualifications', 'history', 'health', 'supervision']);
    expect(items.filter((i) => i.status !== 'ok')).toEqual([]);
    expect(inspectionSummary(items)).toEqual({ ok: 8, paper: 0, attention: 0, missing: 0, ready: true });
    expect(byKey(full()).dbs.summary).toBe('Enhanced, with adults’ barred list, certificate 001234567890, issued 01/12/2024, on the Update Service.');
  });

  it('an empty file shows every gap', () => {
    const items = byKey(full({ rightToWork: null, dbs: null, credentials: [], verifiedReferences: 0, fromApplication: false, health: 'none', hireDate: '2020-01-01' }));
    for (const key of ['identity', 'right_to_work', 'dbs', 'conduct', 'qualifications', 'history', 'health']) expect(items[key].status).toBe('missing');
    expect(items.qualifications.summary).toBe('7 of 7 missing or expired.');
  });

  it('imported records count as held on the paper file', () => {
    const items = byKey(
      full({
        rightToWork: { method: 'imported', methodLabel: 'Checked before SHC', checkedOn: '2022-03-10', permission: 'unlimited', followUpOn: null, hasDocument: false },
        credentials: [...full().credentials.filter((c) => c.type !== 'dbs_enhanced'), cred('dbs_enhanced', { verified: false, expiryDate: '2026-12-31' }), cred('references'), cred('employment_history')],
        verifiedReferences: 0,
        fromApplication: false,
        documentTypes: {},
      }),
    );
    expect([items.identity.status, items.right_to_work.status, items.dbs.status, items.conduct.status, items.history.status]).toEqual(['paper', 'paper', 'paper', 'paper', 'paper']);
  });

  it('flags overdue and due-soon follow-ups', () => {
    const overdue = byKey(full({ rightToWork: { ...full().rightToWork!, permission: 'time_limited', followUpOn: '2026-11-01' } }));
    expect(overdue.right_to_work).toMatchObject({ status: 'missing', details: expect.arrayContaining(['Follow-up check overdue since 01/11/2026.']) });
    const soon = byKey(full({ rightToWork: { ...full().rightToWork!, permission: 'time_limited', followUpOn: '2026-12-01' } }));
    expect(soon.right_to_work.status).toBe('attention');
  });

  it('a DBS with information counts only once a manager approves it', () => {
    const waiting = byKey(full({ dbs: { ...full().dbs!, result: 'information' } }));
    expect(waiting.dbs.status).toBe('missing');
    const approved = byKey(full({ dbs: { ...full().dbs!, result: 'information', decision: 'approved' } }));
    expect(approved.dbs.status).toBe('ok');
  });

  it('a new starter has 12 weeks for the Care Certificate', () => {
    const f = full({ hireDate: '2026-10-20', credentials: full().credentials.filter((c) => c.type !== 'care_certificate'), lastSupervision: null, lastAppraisal: null });
    const items = byKey(f);
    expect(items.qualifications).toMatchObject({ status: 'attention', details: expect.arrayContaining(['Care Certificate: in progress, due by 12/01/2027.']) });
    expect(items.supervision.status).toBe('ok'); // first supervision is due a month after starting
  });

  it('flags expired training and overdue supervision', () => {
    const f = full({ credentials: full().credentials.map((c) => (c.type === 'first_aid' ? { ...c, expiryDate: '2026-10-01' } : c)), lastSupervision: '2026-01-01' });
    const items = byKey(f);
    expect(items.qualifications).toMatchObject({ status: 'missing', summary: '1 of 7 missing or expired.' });
    expect(items.supervision).toMatchObject({ status: 'attention', summary: 'Overdue: supervision.' });
  });
});
