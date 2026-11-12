import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { purgeAuditLogs } from '../src/modules/audit/purge-audit-logs.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { setupApp } from '../src/setup-app.js';
import { utcTodayString } from '../src/common/utils/dates.js';
import { loginForTests } from './login-helper.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'Correct-Horse-9!';
const noThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};
type Auth = { Authorization: string };

describe.skipIf(!hasDb)('Care Certificate and training matrix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let coordinator: { id: string; auth: Auth };
  let teamLeader: { id: string; auth: Auth };
  let manager: { id: string; auth: Auth };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(noThrottle).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `Care Cert Test ${randomUUID()}`, timezone: 'UTC' } })).id;
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
    const email = `ccert-${randomUUID()}@example.test`;
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
    const profile = await prisma.staffProfile.create({ data: { userId: user.id, agencyId, discipline: 'care_worker', hireDate: new Date(Date.now() - 100 * 86_400_000) } });
    return { ...user, staffId: profile.id };
  }

  const today = utcTodayString();
  const onboardingItem = async (staffId: string) =>
    (await http().get(`/api/v1/staff/${staffId}/onboarding`).set(coordinator.auth).expect(200)).body.data.items.find((i: { key: string }) => i.key === 'credential:care_certificate');

  it('an assessor signs off the 16 standards; the last one records the Care Certificate', async () => {
    const w = await worker();
    const start = (await http().get(`/api/v1/staff/${w.staffId}/care-certificate`).set(w.auth).expect(200)).body.data;
    expect(start).toMatchObject({ needed: true, completed: 0, total: 16, overdue: true, awarded: null }); // started 100 days ago: past 12 weeks
    expect(start.standards).toHaveLength(16);

    await http().put(`/api/v1/staff/${w.staffId}/care-certificate/1`).set(teamLeader.auth).send({ completedOn: today }).expect(403); // no training:manage
    await http().put(`/api/v1/staff/${w.staffId}/care-certificate/17`).set(coordinator.auth).send({ completedOn: today }).expect(404);
    await http().put(`/api/v1/staff/${w.staffId}/care-certificate/1`).set(coordinator.auth).send({ completedOn: '2999-01-01' }).expect(400);
    const one = (await http().put(`/api/v1/staff/${w.staffId}/care-certificate/1`).set(coordinator.auth).send({ completedOn: today, notes: 'FAKE: observed' }).expect(200)).body.data;
    expect(one.standards[0]).toMatchObject({ completedOn: today, signedOffBy: { id: coordinator.id }, notes: 'FAKE: observed' });
    await http().delete(`/api/v1/staff/${w.staffId}/care-certificate/1`).set(coordinator.auth).expect(200);
    await http().delete(`/api/v1/staff/${w.staffId}/care-certificate/1`).set(coordinator.auth).expect(404);

    for (let n = 1; n <= 15; n++) await http().put(`/api/v1/staff/${w.staffId}/care-certificate/${n}`).set(coordinator.auth).send({ completedOn: today }).expect(200);
    expect(await onboardingItem(w.staffId)).toMatchObject({ done: false });
    const done = (await http().put(`/api/v1/staff/${w.staffId}/care-certificate/16`).set(manager.auth).send({ completedOn: today }).expect(200)).body.data;
    expect(done).toMatchObject({ completed: 16, overdue: false, awarded: { issueDate: today } });
    expect(await onboardingItem(w.staffId)).toMatchObject({ done: true });
    await http().delete(`/api/v1/staff/${w.staffId}/care-certificate/16`).set(coordinator.auth).expect(409); // already on file
  });

  it('nobody signs off their own standards', async () => {
    const w = await worker();
    const coordProfile = await prisma.staffProfile.create({ data: { userId: coordinator.id, agencyId, discipline: 'care_coordinator' } });
    await http().put(`/api/v1/staff/${coordProfile.id}/care-certificate/1`).set(coordinator.auth).send({ completedOn: today }).expect(403);
    await http().get(`/api/v1/staff/${w.staffId}/care-certificate`).set(coordinator.auth).expect(200);
    const other = await worker();
    await http().get(`/api/v1/staff/${w.staffId}/care-certificate`).set(other.auth).expect(403); // not their own
  });

  it('the training matrix shows each person against the training their role needs', async () => {
    const w = await worker();
    await prisma.staffCredential.createMany({
      data: [
        { staffProfileId: w.staffId, credentialType: 'safeguarding', credentialName: 'Safeguarding', expiryDate: new Date(Date.now() + 400 * 86_400_000) },
        { staffProfileId: w.staffId, credentialType: 'fire_safety', credentialName: 'Fire safety', expiryDate: new Date(Date.now() - 2 * 86_400_000) },
      ],
    });
    await http().put(`/api/v1/staff/${w.staffId}/care-certificate/3`).set(coordinator.auth).send({ completedOn: today }).expect(200);
    await http().get('/api/v1/training/matrix').set(w.auth).expect(403);
    const m = (await http().get('/api/v1/training/matrix').set(teamLeader.auth).expect(200)).body.data;
    expect(m.columns.map((c: { type: string }) => c.type)).toContain('care_certificate');
    const row = m.rows.find((r: { staff: { id: string } }) => r.staff.id === w.staffId);
    expect(row.cells.safeguarding.state).toBe('valid');
    expect(row.cells.fire_safety.state).toBe('expired');
    expect(row.cells.moving_handling.state).toBe('missing');
    expect(row.cells.medication_training.state).toBe('not_needed');
    expect(row.careCertificate).toMatchObject({ completed: 1, total: 16, overdue: true });
    expect(m.totals.fire_safety.expired).toBeGreaterThanOrEqual(1);
  });
});
