import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { rtwFollowUpDate } from '@alora/shared';
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

describe.skipIf(!hasDb)('Right to Work checks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let coordinator: { id: string; auth: Auth };
  let teamLeader: { id: string; auth: Auth };
  const http = () => request(app.getHttpServer());
  const today = utcTodayString();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(noThrottle).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `RTW Test ${randomUUID()}`, timezone: 'UTC' } })).id;
    coordinator = await seedUser('care_coordinator');
    teamLeader = await seedUser('team_leader');
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { agencyId } });
    await purgeAuditLogs(prisma, agencyId);
    await prisma.user.deleteMany({ where: { agencyId } }); // staff profiles, checks and credentials cascade
    await prisma.agency.delete({ where: { id: agencyId } });
    await app.close();
  });

  async function seedUser(roleName: string) {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `rtw-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        agencyId,
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        passwordChangedAt: new Date(),
        firstName: 'Casey',
        lastName: roleName,
        userRoles: { create: { roleId: role.id } },
      },
    });
    return { id: user.id, auth: { Authorization: `Bearer ${await loginForTests(http(), email, PASSWORD)}` } };
  }

  async function worker() {
    const user = await seedUser('care_worker');
    const profile = await prisma.staffProfile.create({ data: { userId: user.id, agencyId, discipline: 'care_worker' } });
    return { ...user, staffId: profile.id };
  }

  const rtwCredential = (staffId: string) => prisma.staffCredential.findFirst({ where: { staffProfileId: staffId, credentialType: 'right_to_work' } });

  it('records a share code check for time-limited permission; the credential follows the permission end date', async () => {
    const w = await worker();
    const ends = addDays(today, 400);
    const res = await http()
      .post(`/api/v1/staff/${w.staffId}/right-to-work`)
      .set(coordinator.auth)
      .send({ method: 'share_code', shareCode: 'w2x 4yz 7ab', permission: 'time_limited', permissionExpiresOn: ends, restrictions: 'Student: 20 hours a week in term time', outcome: 'passed', checkedOn: today })
      .expect(201);
    expect(res.body.data).toMatchObject({ method: 'share_code', shareCodeEnding: '7AB', followUpOn: ends, checkedBy: { id: coordinator.id } });
    expect(JSON.stringify(res.body.data)).not.toContain('W2X4YZ7AB'); // the full share code is never sent back

    const credential = await rtwCredential(w.staffId);
    expect(credential).toMatchObject({ credentialName: 'Right to Work: share code check', alertDaysBefore: 28, verifiedById: coordinator.id, notes: expect.stringContaining('20 hours') });
    expect(credential!.expiryDate!.toISOString().slice(0, 10)).toBe(ends);

    // The person can see their own checks; a team leader can read them too, but not record one.
    await http().get(`/api/v1/staff/${w.staffId}/right-to-work`).set(w.auth).expect(200);
    expect((await http().get(`/api/v1/staff/${w.staffId}/right-to-work`).set(teamLeader.auth).expect(200)).body.data).toHaveLength(1);
    await http().post(`/api/v1/staff/${w.staffId}/right-to-work`).set(teamLeader.auth).send({}).expect(403);
  });

  it('a British passport check needs no follow-up; a later check replaces the credential, keeping the history', async () => {
    const w = await worker();
    await http()
      .post(`/api/v1/staff/${w.staffId}/right-to-work`)
      .set(coordinator.auth)
      .send({ method: 'manual_document', documentType: 'british_irish_passport', seenHow: 'in_person', permission: 'unlimited', outcome: 'passed', checkedOn: addDays(today, -30) })
      .expect(201);
    expect((await rtwCredential(w.staffId))!.expiryDate).toBeNull();

    // A newer check (a Positive Verification Notice: follow-up six months after the check) replaces the credential.
    const pvn = { method: 'manual_document', documentType: 'positive_verification_notice', seenHow: 'video_call', permission: 'time_limited', outcome: 'passed' };
    await http().post(`/api/v1/staff/${w.staffId}/right-to-work`).set(coordinator.auth).send({ ...pvn, checkedOn: today }).expect(201);
    const sixMonths = rtwFollowUpDate({ method: 'manual_document', documentType: 'positive_verification_notice', permission: 'time_limited', checkedOn: today });
    expect((await rtwCredential(w.staffId))!.expiryDate!.toISOString().slice(0, 10)).toBe(sixMonths);
    expect(await prisma.staffCredential.count({ where: { staffProfileId: w.staffId, credentialType: 'right_to_work' } })).toBe(1);

    // An older check entered late is kept in the history but doesn't override the newer one.
    await http().post(`/api/v1/staff/${w.staffId}/right-to-work`).set(coordinator.auth).send({ ...pvn, checkedOn: '2026-01-15' }).expect(201);
    expect((await rtwCredential(w.staffId))!.expiryDate!.toISOString().slice(0, 10)).toBe(sixMonths);
    expect((await http().get(`/api/v1/staff/${w.staffId}/right-to-work`).set(coordinator.auth).expect(200)).body.data.map((c: { checkedOn: string }) => c.checkedOn)).toEqual([
      today,
      addDays(today, -30),
      '2026-01-15',
    ]);
  });

  it('refuses checks that cannot be right, and a failed check never marks someone as allowed to work', async () => {
    const w = await worker();
    const send = (body: Record<string, unknown>) => http().post(`/api/v1/staff/${w.staffId}/right-to-work`).set(coordinator.auth).send({ outcome: 'passed', checkedOn: today, ...body });
    await send({ method: 'share_code', shareCode: 'SHORT', permission: 'unlimited' }).expect(400);
    await send({ method: 'manual_document', documentType: 'british_irish_passport', permission: 'unlimited' }).expect(400); // how the originals were seen
    await send({ method: 'manual_document', documentType: 'british_irish_passport', seenHow: 'in_person', permission: 'time_limited', permissionExpiresOn: addDays(today, 30) }).expect(400); // List A is unlimited
    await send({ method: 'share_code', shareCode: 'W2X4YZ7AB', permission: 'time_limited' }).expect(400); // needs the end date
    await send({ method: 'share_code', shareCode: 'W2X4YZ7AB', permission: 'time_limited', permissionExpiresOn: addDays(today, -1) }).expect(400); // already ended
    await send({ method: 'share_code', shareCode: 'W2X4YZ7AB', permission: 'unlimited', checkedOn: addDays(today, 2) }).expect(400); // future
    await send({ method: 'share_code', shareCode: 'W2X4YZ7AB', permission: 'unlimited', documentId: randomUUID() }).expect(400); // not their document

    await send({ method: 'share_code', shareCode: 'W2X4YZ7AB', permission: 'unlimited', outcome: 'failed', notes: 'Share code expired' }).expect(201);
    expect(await rtwCredential(w.staffId)).toBeNull();
  });

  it('lists follow-ups due soon or overdue, soonest first', async () => {
    const soon = await worker();
    const later = await worker();
    const overdue = await worker();
    const record = (staffId: string, ends: string, checkedOn = today) =>
      http()
        .post(`/api/v1/staff/${staffId}/right-to-work`)
        .set(coordinator.auth)
        .send({ method: 'share_code', shareCode: 'W2X4YZ7AB', permission: 'time_limited', permissionExpiresOn: ends, outcome: 'passed', checkedOn })
        .expect(201);
    await record(soon.staffId, addDays(today, 20));
    await record(later.staffId, addDays(today, 200));
    await record(overdue.staffId, addDays(today, 3), addDays(today, -400));
    await prisma.rightToWorkCheck.updateMany({ where: { staffProfileId: overdue.staffId }, data: { followUpOn: new Date(`${addDays(today, -2)}T00:00:00Z`) } });

    const list = (await http().get('/api/v1/staff/right-to-work/follow-ups?withinDays=60').set(teamLeader.auth).expect(200)).body.data;
    const ids = list.map((f: { staff: { id: string } }) => f.staff.id);
    expect(ids).toEqual([overdue.staffId, soon.staffId]);
    expect(list[0].overdue).toBe(true);
  });
});
