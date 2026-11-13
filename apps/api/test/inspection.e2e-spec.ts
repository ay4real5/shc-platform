import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { addDays, utcTodayString } from '../src/common/utils/dates.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { purgeAuditLogs } from '../src/modules/audit/purge-audit-logs.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { setupApp } from '../src/setup-app.js';
import { loginForTests } from './login-helper.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'Correct-Horse-9!';
const noThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};
type Auth = { Authorization: string };

describe.skipIf(!hasDb)('CQC inspection pack (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let otherAgencyId: string;
  let coordinator: { id: string; auth: Auth };
  let worker: { id: string; auth: Auth; staffId: string };
  let complete: { staffId: string };
  let outsider: string;
  const http = () => request(app.getHttpServer());
  const today = utcTodayString();
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(noThrottle).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `Inspection Test ${randomUUID()}`, timezone: 'UTC' } })).id;
    otherAgencyId = (await prisma.agency.create({ data: { name: `Inspection Other ${randomUUID()}`, timezone: 'UTC' } })).id;
    coordinator = await seedUser(agencyId, 'care_coordinator');
    const w = await seedUser(agencyId, 'care_worker');
    worker = { ...w, staffId: (await prisma.staffProfile.create({ data: { userId: w.id, agencyId, discipline: 'care_worker', hireDate: d('2020-01-06') } })).id };

    // A complete file: Right to Work with evidence, clear DBS, paper references and history, all training, health cleared.
    const c = await seedUser(agencyId, 'care_worker');
    const profile = await prisma.staffProfile.create({ data: { userId: c.id, agencyId, discipline: 'care_worker', hireDate: d('2020-01-06') } });
    complete = { staffId: profile.id };
    const doc = await prisma.document.create({ data: { agencyId, staffId: profile.id, uploadedById: coordinator.id, documentType: 'right_to_work', title: 'RTW check', fileName: 'rtw.pdf', s3Key: `test/${randomUUID()}` } });
    await prisma.rightToWorkCheck.create({ data: { agencyId, staffProfileId: profile.id, method: 'share_code', shareCode: 'ABC123XYZ', permission: 'unlimited', outcome: 'passed', checkedOn: d('2020-01-02'), checkedById: coordinator.id, documentId: doc.id } });
    await prisma.dbsCheck.create({ data: { agencyId, staffProfileId: profile.id, certificateNumber: '001234567890', issueDate: d('2019-12-01'), level: 'enhanced_barred_adults', result: 'clear', updateService: true, nextDueOn: d(addDays(today, 200)), recordedById: coordinator.id } });
    const credential = (credentialType: string, expiry: string | null) =>
      prisma.staffCredential.create({ data: { staffProfileId: profile.id, credentialType, credentialName: credentialType, issueDate: d('2020-01-10'), expiryDate: expiry ? d(expiry) : null, verifiedById: coordinator.id } });
    await credential('dbs_enhanced', addDays(today, 200));
    for (const t of ['care_certificate', 'safeguarding', 'moving_handling', 'infection_control', 'first_aid', 'health_safety', 'fire_safety', 'references', 'employment_history']) await credential(t, null);
    await prisma.healthDeclaration.create({ data: { staffProfileId: profile.id, agencyId, answersEncrypted: Buffer.from('x'), submittedAt: new Date(), outcome: 'fit', reviewedById: coordinator.id, reviewedAt: new Date() } });
    for (const [type, held] of [['supervision', addDays(today, -20)], ['appraisal', addDays(today, -100)]] as const) {
      await prisma.supervision.create({ data: { agencyId, staffProfileId: profile.id, type, status: 'completed', heldOn: d(held) } });
    }

    const o = await seedUser(otherAgencyId, 'care_worker');
    outsider = (await prisma.staffProfile.create({ data: { userId: o.id, agencyId: otherAgencyId, discipline: 'care_worker' } })).id;
  });

  afterAll(async () => {
    for (const id of [agencyId, otherAgencyId]) {
      await purgeAuditLogs(prisma, id);
      await prisma.rightToWorkCheck.deleteMany({ where: { agencyId: id } });
      await prisma.dbsCheck.deleteMany({ where: { agencyId: id } });
      await prisma.supervision.deleteMany({ where: { agencyId: id } });
      await prisma.staffCredential.deleteMany({ where: { staffProfile: { agencyId: id } } });
      await prisma.document.deleteMany({ where: { agencyId: id } });
      await prisma.user.deleteMany({ where: { agencyId: id } });
      await prisma.agency.delete({ where: { id } });
    }
    await app.close();
  });

  async function seedUser(agency: string, roleName: string) {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `insp-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: { agencyId: agency, email, passwordHash: await app.get(PasswordService).hash(PASSWORD), passwordChangedAt: new Date(), firstName: 'Casey', lastName: roleName, userRoles: { create: { roleId: role.id } } },
    });
    return { id: user.id, auth: { Authorization: `Bearer ${await loginForTests(http(), email, PASSWORD)}` } };
  }

  it('the overview lists everyone, least ready first', async () => {
    const res = await http().get('/api/v1/inspection/overview').set(coordinator.auth).expect(200);
    const rows = res.body.data as { staffId: string; ready: boolean; counts: Record<string, number>; missing: string[] }[];
    expect(rows[0].staffId).toBe(worker.staffId);
    expect(rows[0].ready).toBe(false);
    expect(rows[0].missing).toContain('Enhanced DBS check');
    const full = rows.find((r) => r.staffId === complete.staffId)!;
    expect(full).toMatchObject({ ready: true, counts: { missing: 0, attention: 0 } });
    expect(full.counts.ok + full.counts.paper).toBe(8);
  });

  it('builds packs for chosen people, with their documents', async () => {
    const res = await http().get(`/api/v1/inspection/packs?ids=${complete.staffId},${worker.staffId}`).set(coordinator.auth).expect(200);
    expect(res.body.data).toHaveLength(2);
    const pack = res.body.data.find((p: { staffId: string }) => p.staffId === complete.staffId);
    expect(pack.items.find((i: { key: string }) => i.key === 'right_to_work')).toMatchObject({ status: 'ok', details: ['Copy of the check on file.'] });
    expect(pack.items.find((i: { key: string }) => i.key === 'conduct').status).toBe('paper');
    expect(pack.documents).toEqual([expect.objectContaining({ title: 'RTW check', documentType: 'right_to_work' })]);
    expect(JSON.stringify(res.body.data)).not.toContain('ABC123XYZ'); // never the share code
  });

  it("refuses other companies' staff and people without compliance access", async () => {
    await http().get(`/api/v1/inspection/packs?ids=${outsider}`).set(coordinator.auth).expect(400);
    await http().get('/api/v1/inspection/packs?ids=not-a-uuid').set(coordinator.auth).expect(400);
    await http().get('/api/v1/inspection/overview').set(worker.auth).expect(403);
  });
});
