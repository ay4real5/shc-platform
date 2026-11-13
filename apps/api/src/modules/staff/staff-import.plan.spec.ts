import { importTemplateCsv } from '@alora/shared';
import { parseDbsLevel, planImport, planSummary, type ImportContext } from './staff-import.plan.js';

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  today: '2026-11-13',
  existingEmails: new Set(),
  existingEmployeeIds: new Set(),
  ...over,
});

const HEAD =
  'First name,Last name,Email,Job role,Contract,Start date,Employee ID,Phone,Postcode,Hourly rate,Right to Work checked on,Right to Work type,Right to Work follow-up date,DBS certificate number,DBS issue date,DBS level,DBS result,DBS Update Service,References checked,Employment history checked,Safeguarding date,Safeguarding expires';
const csv = (...rows: string[]) => [HEAD, ...rows].join('\r\n');
const GOOD = 'Test,Carer,test.carer@example.test,Care worker,Part time,14/03/2022,E1,07700 900001,ab1 2cd,12.60,10/03/2022,No time limit,,001234567890,01/03/2022,Enhanced with adults barred list,Clear,Yes,Yes,yes,20/03/2025,20/03/2027';

describe('planImport', () => {
  it('reads a full row', () => {
    const plan = planImport(csv(GOOD), ctx());
    expect(plan.fileErrors).toEqual([]);
    const [row] = plan.rows;
    expect(row.errors).toEqual([]);
    expect(row).toMatchObject({
      row: 2,
      email: 'test.carer@example.test',
      discipline: 'care_worker',
      employmentType: 'part_time',
      hireDate: '2022-03-14',
      postcode: 'AB1 2CD',
      hourlyRate: 12.6,
      rtw: { checkedOn: '2022-03-10', permission: 'unlimited', followUpOn: null },
      dbs: { certificateNumber: '001234567890', level: 'enhanced_barred_adults', result: 'clear', updateService: true },
      referencesChecked: true,
      historyChecked: true,
      credentials: [{ type: 'safeguarding', issueDate: '2025-03-20', expiryDate: '2027-03-20' }],
    });
    expect(planSummary(row)).toEqual(['Right to Work (no time limit)', 'DBS (Update Service)', 'References (paper file)', 'Employment history (paper file)', '1 training/other check']);
  });

  it('accepts headers in any case and order, and lists unknown columns', () => {
    const plan = planImport('EMAIL,first_name,LAST NAME,job role,Favourite colour\nx@example.test,Ann,Bee,carer,blue', ctx());
    expect(plan.ignoredColumns).toEqual(['Favourite colour']);
    expect(plan.rows[0]).toMatchObject({ errors: [], discipline: 'care_worker', firstName: 'Ann' });
  });

  it('refuses a file without the required columns', () => {
    expect(planImport('Name,Email\nAnn,a@example.test', ctx()).fileErrors[0]).toMatch(/Missing columns: First name, Last name, Job role/);
    expect(planImport('', ctx()).fileErrors[0]).toMatch(/empty/);
  });

  it('explains each bad cell', () => {
    const bad = 'Test,,not-an-email,Chef,Weekends,31/02/2022,,abc,ZZZ,twelve,,Time-limited,,123,01/03/2022,Enhanced,Maybe,,perhaps,,,';
    const errors = planImport(csv(bad), ctx()).rows[0].errors.join(' | ');
    for (const text of ['Last name is blank', "doesn't look right", 'Job role "Chef"', 'Contract "Weekends"', '"31/02/2022" isn\'t a date', 'Phone', 'Postcode', 'Hourly rate', 'check date is blank', 'needs the follow-up date', '12 digits', 'DBS result', 'References checked should be Yes or No']) {
      expect(errors).toContain(text);
    }
  });

  it('flags duplicates in the sheet and skips people who already have a login', () => {
    const second = GOOD.replace('Test,Carer', 'Other,Person');
    const third = GOOD.replace('test.carer@', 'third@');
    const plan = planImport(csv(GOOD, second, third), ctx());
    expect(plan.rows[1].errors).toContain('Same email as row 2');
    expect(plan.rows[2].errors).toContain('Same employee ID as row 2');

    const again = planImport(csv(GOOD), ctx({ existingEmails: new Set(['test.carer@example.test']), existingEmployeeIds: new Set(['e1']) }));
    expect(again.rows[0].errors).toEqual([]);
    expect(again.rows[0].skip).toMatch(/Already has a login/);

    const idTaken = planImport(csv(third), ctx({ existingEmployeeIds: new Set(['e1']) }));
    expect(idTaken.rows[0].errors).toContain('Employee ID E1 is already used by someone in SHC');
  });

  it('warns about overdue follow-ups, expired training and DBS that needs a decision', () => {
    const row = GOOD.replace('No time limit,', 'Time-limited,01/01/2026').replace('Clear', 'Information').replace('20/03/2027', '01/01/2026');
    const plan = planImport(csv(row), ctx());
    expect(plan.rows[0].errors).toEqual([]);
    expect(plan.rows[0].warnings).toEqual([
      'Right to Work follow-up is overdue: do a new check',
      'DBS shows information: a manager must decide on it in SHC before they count as cleared',
      'Safeguarding has expired',
    ]);
  });

  it('refuses dates in the future for things that already happened', () => {
    const row = GOOD.replace('10/03/2022', '10/03/2030');
    expect(planImport(csv(row), ctx()).rows[0].errors).toContain('Right to Work checked on is in the future');
  });

  it('reads the template sample row cleanly', () => {
    const plan = planImport(importTemplateCsv(), ctx());
    expect(plan.fileErrors).toEqual([]);
    expect(plan.ignoredColumns).toEqual([]);
    expect(plan.rows[0].errors).toEqual([]);
  });
});

describe('parseDbsLevel', () => {
  it.each([
    ['Enhanced with adults barred list', 'enhanced_barred_adults'],
    ['Enhanced + barred', 'enhanced_barred_adults'],
    ['Enhanced with both barred lists', 'enhanced_barred_both'],
    ['Enhanced (adult & child)', 'enhanced_barred_both'],
    ['Enhanced', 'enhanced'],
    ['standard', 'standard'],
    ['enhanced_barred_adults', 'enhanced_barred_adults'],
    ['Gold', null],
  ])('%s → %s', (text, level) => expect(parseDbsLevel(text)).toBe(level));
});
