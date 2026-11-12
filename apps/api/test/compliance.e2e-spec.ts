import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { addDays, toDate, utcTodayString } from '../src/common/utils/dates.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { purgeAuditLogs } from '../src/modules/audit/purge-audit-logs.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { CredentialExpiryJob } from '../src/modules/compliance/credential-expiry.job.js';
import { setupApp } from '../src/setup-app.js';
import { loginForTests } from './login-helper.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'Correct-Horse-9!';
const noThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};
type Auth = { Authorization: string };

describe.skipIf(!hasDb)('Compliance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let admin: Auth;
  let supervisor: Auth;
  let aide: Auth;
  let aideUserId: string;
  let office: Auth;
  let officeId: string;
  const http = () => request(app.getHttpServer());
  const today = utcTodayString();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue(noThrottle)
      .compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `Compliance Test ${randomUUID()}`, timezone: 'UTC' } })).id;
    ({ auth: admin } = await seedUser('agency_admin'));
    ({ auth: supervisor } = await seedUser('care_coordinator'));
    ({ auth: office, id: officeId } = await seedUser('care_coordinator'));
    ({ auth: aide, id: aideUserId } = await seedUser('care_worker', true));
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { agencyId } });
    await purgeAuditLogs(prisma, agencyId);
    await prisma.user.deleteMany({ where: { agencyId } }); // staff profiles, credentials cascade
    await prisma.agency.delete({ where: { id: agencyId } });
    await app.close();
  });

  async function seedUser(roleName: string, withProfile = false) {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `comp-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        agencyId,
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        passwordChangedAt: new Date(),
        firstName: 'Cora',
        lastName: roleName,
        userRoles: { create: { roleId: role.id } },
        ...(withProfile ? { staffProfile: { create: { agencyId, discipline: 'care_worker' } } } : {}),
      },
    });
    return { id: user.id, auth: { Authorization: `Bearer ${await loginForTests(http(), email, PASSWORD)}` } };
  }

  it('the dashboard counts what needs attention', async () => {
    const d = (await http().get('/api/v1/compliance/dashboard').set(supervisor).expect(200)).body.data;
    expect(d.credentials).toEqual({ expired: 0, expiringWithin30Days: 0 });
    expect(d.security.adminsWithout2fa).toBe(0); // the test admin set up 2FA at sign-in
    await http().get('/api/v1/compliance/dashboard').set(aide).expect(403);
  });

  it('credential alerts go out once per stage and start again after renewal', async () => {
    const profile = await prisma.staffProfile.findFirstOrThrow({ where: { userId: aideUserId } });
    const credential = await prisma.staffCredential.create({
      data: { staffProfileId: profile.id, credentialType: 'certification', credentialName: 'CPR card', expiryDate: toDate(addDays(today, 20))!, alertDaysBefore: 30 },
    });
    const job = app.get(CredentialExpiryJob);
    expect(await job.run(agencyId)).toBe(1);
    expect(await job.run(agencyId)).toBe(0); // same stage: nothing new
    const notes = await prisma.notification.findMany({ where: { agencyId, type: 'credential_expiry' } });
    expect(notes.map((n) => n.userId).sort()).toEqual([aideUserId, officeId, ...(await managersOtherThan(officeId))].sort());
    expect(notes[0]!.title).toBe('Expires in 20 days: CPR card');

    await prisma.staffCredential.update({ where: { id: credential.id }, data: { expiryDate: toDate(addDays(today, -1))! } });
    expect(await job.run(agencyId)).toBe(1); // now expired
    expect(await job.run(agencyId)).toBe(0);

    // Renewing through the API clears the stage, so the next expiry is announced again.
    await http().patch(`/api/v1/staff/${profile.id}/credentials/${credential.id}`).set(office).send({ expiryDate: addDays(today, 5) }).expect(200);
    expect((await prisma.staffCredential.findUniqueOrThrow({ where: { id: credential.id } })).expiryAlertStage).toBeNull();
    expect(await job.run(agencyId)).toBe(1);
  });

  it('a newer credential of the same type replaces the old one, which stops alerting and counting (S3-01)', async () => {
    const profile = await prisma.staffProfile.findFirstOrThrow({ where: { userId: aideUserId } });
    const job = app.get(CredentialExpiryJob);
    await job.run(agencyId); // settle anything left from earlier tests
    const old = (
      await http().post(`/api/v1/staff/${profile.id}/credentials`).set(office).send({ credentialType: 'driving_licence', credentialName: 'Driving licence', expiryDate: addDays(today, -3) }).expect(201)
    ).body.data;
    expect(old.status).toBe('active');
    const before = (await http().get('/api/v1/compliance/dashboard').set(supervisor).expect(200)).body.data.credentials.expired;

    await http().post(`/api/v1/staff/${profile.id}/credentials`).set(office).send({ credentialType: 'driving_licence', credentialName: 'Driving licence', expiryDate: addDays(today, 900) }).expect(201);
    const list = (await http().get(`/api/v1/staff/${profile.id}/credentials`).set(office).expect(200)).body.data;
    expect(list.find((c: { id: string }) => c.id === old.id).status).toBe('superseded');
    expect((await http().get('/api/v1/compliance/dashboard').set(supervisor).expect(200)).body.data.credentials.expired).toBe(before - 1);
    expect(await job.run(agencyId)).toBe(0); // the replaced licence never alerts
  });

  it('DBS alerts go to the office only, worded neutrally (S3-01)', async () => {
    const profile = await prisma.staffProfile.findFirstOrThrow({ where: { userId: aideUserId } });
    await prisma.notification.deleteMany({ where: { agencyId } });
    await prisma.staffCredential.create({
      data: { staffProfileId: profile.id, credentialType: 'dbs_enhanced', credentialName: 'Enhanced DBS', expiryDate: toDate(addDays(today, -1))! },
    });
    expect(await app.get(CredentialExpiryJob).run(agencyId)).toBe(1);
    const notes = await prisma.notification.findMany({ where: { agencyId, type: 'credential_expiry' } });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.title === 'DBS check needs attention')).toBe(true);
    expect(notes.map((n) => n.userId)).not.toContain(aideUserId);
  });

  it('admins search the audit log and see the data protection checklist', async () => {
    const res = await http().get(`/api/v1/compliance/audit-logs?action=UPDATE_STAFF_CREDENTIAL&from=${today}&to=${today}`).set(admin).expect(200);
    expect(res.body.data[0]).toMatchObject({ action: 'UPDATE_STAFF_CREDENTIAL', user: { firstName: 'Cora' } });
    await http().get('/api/v1/compliance/audit-logs?action=bad action').set(admin).expect(400);
    await http().get('/api/v1/compliance/audit-logs').set(supervisor).expect(403);

    const checklist = (await http().get('/api/v1/compliance/security-checklist').set(admin).expect(200)).body.data;
    expect(checklist.find((c: { item: string }) => c.item.startsWith('Two-factor'))).toMatchObject({ ok: true });
    expect(checklist.find((c: { item: string }) => c.item.startsWith('ICO registration'))).toMatchObject({ ok: false });
  });

  /** Everyone with staff:update gets credential alerts: office staff, supervisor, admin. */
  async function managersOtherThan(excludeId: string): Promise<string[]> {
    const users = await prisma.user.findMany({
      where: { agencyId, id: { not: excludeId }, userRoles: { some: { role: { name: { in: ['care_coordinator', 'agency_admin'] } } } } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
});
