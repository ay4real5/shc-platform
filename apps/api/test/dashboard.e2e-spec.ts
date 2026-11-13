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
import { addDays, toDate, utcTodayString } from '../src/common/utils/dates.js';
import { loginForTests } from './login-helper.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'Correct-Horse-9!';
const noThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};
type Auth = { Authorization: string };

describe.skipIf(!hasDb)('Manager dashboard (e2e)', () => {
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
    agencyId = (await prisma.agency.create({ data: { name: `Dashboard Test ${randomUUID()}`, timezone: 'UTC' } })).id;
    coordinator = await seedUser('care_coordinator');
    teamLeader = await seedUser('team_leader');
    manager = await seedUser('registered_manager');
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { agencyId } });
    await prisma.application.deleteMany({ where: { agencyId } });
    await prisma.jobPosting.deleteMany({ where: { agencyId } });
    await purgeAuditLogs(prisma, agencyId);
    await prisma.user.deleteMany({ where: { agencyId } }); // staff profiles, checks and credentials cascade
    await prisma.agency.delete({ where: { id: agencyId } });
    await app.close();
  });

  async function seedUser(roleName: string) {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `dash-${randomUUID()}@example.test`;
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

  const today = utcTodayString();
  const dashboard = async (auth: Auth) => (await http().get('/api/v1/dashboard/manager').set(auth).expect(200)).body.data;

  it('who can not work and why, what is expiring, hiring, and what is waiting', async () => {
    const empty = await dashboard(coordinator.auth);
    expect(empty).toMatchObject({ today, staff: { active: 0, ready: 0 }, notReady: { total: 0 }, hiring: { openJobs: 0, newApplicationsThisWeek: 0 } });

    const w = await worker();
    await prisma.staffProfile.update({ where: { id: w.staffId }, data: { hireDate: toDate(addDays(today, -200))! } });
    await prisma.staffCredential.create({ data: { staffProfileId: w.staffId, credentialType: 'dbs_enhanced', credentialName: 'Enhanced DBS', expiryDate: toDate(addDays(today, -2))! } });
    await prisma.staffCredential.create({ data: { staffProfileId: w.staffId, credentialType: 'first_aid', credentialName: 'First aid', expiryDate: toDate(addDays(today, 10))! } });
    await http().post('/api/v1/time-off').set(w.auth).send({ startDate: addDays(today, 20), endDate: addDays(today, 20), type: 'annual_leave' }).expect(201);
    await http().put('/api/v1/staff/me/health').set(w.auth).send({
      answers: { condition: { answer: 'no' }, adjustments: { answer: 'no' }, recent_absence: { answer: 'no' }, medication: { answer: 'no' }, lifting: { answer: 'no' } },
      declaration: true,
    }).expect(200);
    const job = await prisma.jobPosting.create({ data: { agencyId, title: 'FAKE Care Worker', discipline: 'care_worker', location: 'Manchester', description: 'FAKE job', status: 'open' } });
    await prisma.application.create({ data: { agencyId, jobPostingId: job.id, reference: `D${randomUUID().slice(0, 10)}`, firstName: 'Fake', lastName: 'Applicant', email: `dash-app-${randomUUID()}@example.test`, phone: '07700 900000', postcode: 'M1 1AA', rightToWork: 'british_irish', declarationAcceptedAt: new Date() } });

    const d = await dashboard(teamLeader.auth);
    expect(d.staff).toEqual({ active: 1, ready: 0 });
    expect(d.notReady.people[0]).toMatchObject({ staffId: w.staffId, missing: expect.arrayContaining([expect.stringMatching(/Right to Work/)]) });
    expect(d.expiring).toMatchObject({ expired: 1, within30Days: 1 });
    expect(d.expiring.items[0]).toMatchObject({ staffId: w.staffId, credentialType: 'dbs_enhanced', state: 'expired' });
    expect(d.hiring).toMatchObject({ openJobs: 1, newApplicationsThisWeek: 1, waitingOverAWeek: 0 });
    expect(d.hiring.byStage.find((s: { stage: string }) => s.stage === 'applied').count).toBe(1);
    expect(d.attention).toMatchObject({ timeOffToApprove: 1, healthToReview: 1, peopleOverdueSupervision: 1, careCertificatesOverdue: 1 });
    expect(d.attention.trainingGaps).toBeGreaterThan(0);

    await http().get('/api/v1/dashboard/manager').set(w.auth).expect(403);
  });
});
