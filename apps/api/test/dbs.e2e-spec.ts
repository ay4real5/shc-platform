import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { dbsNextDue } from '@alora/shared';
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

describe.skipIf(!hasDb)('DBS checks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let coordinator: { id: string; auth: Auth };
  let teamLeader: { id: string; auth: Auth };
  let manager: { id: string; auth: Auth };
  const http = () => request(app.getHttpServer());
  const today = utcTodayString();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(noThrottle).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `DBS Test ${randomUUID()}`, timezone: 'UTC' } })).id;
    coordinator = await seedUser('care_coordinator');
    teamLeader = await seedUser('team_leader');
    manager = await seedUser('registered_manager');
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
    const email = `dbs-${randomUUID()}@example.test`;
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

  const dbsCredential = (staffId: string) => prisma.staffCredential.findFirst({ where: { staffProfileId: staffId, credentialType: 'dbs_enhanced' } });
  const day = (d: Date | null | undefined) => d?.toISOString().slice(0, 10);

  it('a clear enhanced certificate clears them; on the Update Service a yearly status check moves the due date', async () => {
    const w = await worker();
    const issued = addDays(today, -100);
    const check = (
      await http()
        .post(`/api/v1/staff/${w.staffId}/dbs`)
        .set(coordinator.auth)
        .send({ certificateNumber: '0012 3456 7890', issueDate: issued, level: 'enhanced_barred_adults', result: 'clear', updateService: true })
        .expect(201)
    ).body.data;
    expect(check).toMatchObject({ certificateNumber: '001234567890', acceptable: true, nextDueOn: dbsNextDue({ issueDate: issued, updateService: true }) });
    const credential = await dbsCredential(w.staffId);
    expect(credential).toMatchObject({ credentialNumber: '001234567890', issuingAuthority: 'Disclosure and Barring Service' });
    expect(day(credential!.expiryDate)).toBe(check.nextDueOn);

    const after = (await http().post(`/api/v1/staff/${w.staffId}/dbs/${check.id}/status-checks`).set(coordinator.auth).send({ checkedOn: today, result: 'no_change' }).expect(201)).body.data;
    expect(after.nextDueOn).toBe(dbsNextDue({ issueDate: issued, updateService: true, lastStatusCheckOn: today }));
    expect(after.statusChecks).toHaveLength(1);
    expect(day((await dbsCredential(w.staffId))!.expiryDate)).toBe(after.nextDueOn);

    // They can see their own; a team leader can read but not record.
    await http().get(`/api/v1/staff/${w.staffId}/dbs`).set(w.auth).expect(200);
    await http().post(`/api/v1/staff/${w.staffId}/dbs`).set(teamLeader.auth).send({}).expect(403);
  });

  it('a certificate with information does not clear them until a manager approves it; coordinators cannot decide', async () => {
    const w = await worker();
    const check = (
      await http()
        .post(`/api/v1/staff/${w.staffId}/dbs`)
        .set(coordinator.auth)
        .send({ certificateNumber: '001234567891', issueDate: addDays(today, -10), level: 'enhanced_barred_adults', result: 'information' })
        .expect(201)
    ).body.data;
    expect(check.acceptable).toBe(false);
    expect(day((await dbsCredential(w.staffId))!.expiryDate)).toBe(today); // shows as expired: not ready

    await http().post(`/api/v1/staff/${w.staffId}/dbs/${check.id}/decision`).set(coordinator.auth).send({ decision: 'approved' }).expect(403);
    const decided = (await http().post(`/api/v1/staff/${w.staffId}/dbs/${check.id}/decision`).set(manager.auth).send({ decision: 'approved' }).expect(201)).body.data;
    expect(decided).toMatchObject({ acceptable: true, decision: 'approved', decidedBy: { id: manager.id } });
    expect(day((await dbsCredential(w.staffId))!.expiryDate)).toBe(dbsNextDue({ issueDate: addDays(today, -10), updateService: false }));
  });

  it('new information on a status check, or the wrong level, never counts as cleared', async () => {
    const w = await worker();
    const check = (
      await http()
        .post(`/api/v1/staff/${w.staffId}/dbs`)
        .set(coordinator.auth)
        .send({ certificateNumber: '001234567892', issueDate: addDays(today, -400), level: 'enhanced_barred_adults', result: 'clear', updateService: true })
        .expect(201)
    ).body.data;
    const changed = (await http().post(`/api/v1/staff/${w.staffId}/dbs/${check.id}/status-checks`).set(coordinator.auth).send({ checkedOn: today, result: 'new_information' }).expect(201)).body.data;
    expect(changed.acceptable).toBe(false);
    expect(day((await dbsCredential(w.staffId))!.expiryDate)).toBe(today);

    const basic = await worker();
    const b = (await http().post(`/api/v1/staff/${basic.staffId}/dbs`).set(coordinator.auth).send({ certificateNumber: '001234567893', issueDate: today, level: 'basic', result: 'clear' }).expect(201)).body.data;
    expect(b.acceptable).toBe(false);
    await http().post(`/api/v1/staff/${basic.staffId}/dbs/${b.id}/status-checks`).set(coordinator.auth).send({ checkedOn: today, result: 'no_change' }).expect(409); // not on the Update Service
    await http().post(`/api/v1/staff/${basic.staffId}/dbs`).set(coordinator.auth).send({ certificateNumber: '12345', issueDate: today, level: 'basic', result: 'clear' }).expect(400);
    await http().post(`/api/v1/staff/${basic.staffId}/dbs`).set(coordinator.auth).send({ certificateNumber: '001234567894', issueDate: addDays(today, 3), level: 'basic', result: 'clear' }).expect(400);
  });
});
