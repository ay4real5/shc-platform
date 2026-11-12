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
import { loginForTests } from './login-helper.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'Correct-Horse-9!';
const noThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};
type Auth = { Authorization: string };

describe.skipIf(!hasDb)('Health declarations (e2e)', () => {
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
    agencyId = (await prisma.agency.create({ data: { name: `Health Test ${randomUUID()}`, timezone: 'UTC' } })).id;
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
    const email = `hlth-${randomUUID()}@example.test`;
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

  const answers = {
    condition: { answer: 'yes', details: 'FAKE: asthma, well controlled' },
    adjustments: { answer: 'no' },
    recent_absence: { answer: 'no' },
    medication: { answer: 'no' },
    lifting: { answer: 'no' },
  };
  const onboardingItem = async (staffId: string) =>
    (await http().get(`/api/v1/staff/${staffId}/onboarding`).set(coordinator.auth).expect(200)).body.data.items.find((i: { key: string }) => i.key === 'health_declaration');

  it('the person fills it in; it is stored encrypted and the office sees only the status', async () => {
    const w = await worker();
    expect(await onboardingItem(w.staffId)).toMatchObject({ done: false, owner: 'caregiver' });
    expect((await http().get('/api/v1/staff/me/health').set(w.auth).expect(200)).body.data.status).toBe('none');

    await http().put('/api/v1/staff/me/health').set(w.auth).send({ answers: { ...answers, condition: { answer: 'yes' } }, declaration: true }).expect(400); // a yes needs details
    await http().put('/api/v1/staff/me/health').set(w.auth).send({ answers: { condition: { answer: 'no' } }, declaration: true }).expect(400); // every question
    await http().put('/api/v1/staff/me/health').set(w.auth).send({ answers, declaration: false }).expect(400);
    const mine = (await http().put('/api/v1/staff/me/health').set(w.auth).send({ answers, vaccines: { flu: true }, declaration: true }).expect(200)).body.data;
    expect(mine).toMatchObject({ status: 'submitted', answers: { answers: { condition: { details: 'FAKE: asthma, well controlled' } }, vaccines: { flu: true, covid: false } } });

    const row = await prisma.healthDeclaration.findUniqueOrThrow({ where: { staffProfileId: w.staffId } });
    expect(Buffer.from(row.answersEncrypted).toString('latin1')).not.toContain('asthma');

    const status = (await http().get(`/api/v1/staff/${w.staffId}/health/status`).set(coordinator.auth).expect(200)).body.data;
    expect(status).toEqual({ status: 'submitted', submittedAt: expect.any(String), reviewedAt: null, reviewedBy: null });
    expect(JSON.stringify(status)).not.toContain('asthma');
    await http().get(`/api/v1/staff/${w.staffId}/health`).set(coordinator.auth).expect(403); // coordinators can't read health data
    await http().get(`/api/v1/staff/${w.staffId}/health`).set(teamLeader.auth).expect(403);
    expect(await onboardingItem(w.staffId)).toMatchObject({ done: false, owner: 'office' });
  });

  it('a manager reads (audited) and reviews it; only a cleared outcome ticks the checklist; a resubmission needs a new review', async () => {
    const w = await worker();
    await http().put('/api/v1/staff/me/health').set(w.auth).send({ answers, declaration: true }).expect(200);
    const detail = (await http().get(`/api/v1/staff/${w.staffId}/health`).set(manager.auth).expect(200)).body.data;
    expect(detail.answers.answers.condition.answer).toBe('yes');
    expect(await prisma.auditLog.count({ where: { agencyId, userId: manager.id, action: 'VIEW_HEALTH_DECLARATION' } })).toBeGreaterThan(0);

    await http().post(`/api/v1/staff/${w.staffId}/health/review`).set(manager.auth).send({ outcome: 'occupational_health' }).expect(201);
    expect(await onboardingItem(w.staffId)).toMatchObject({ done: false });
    const reviewed = (await http().post(`/api/v1/staff/${w.staffId}/health/review`).set(manager.auth).send({ outcome: 'fit_with_adjustments', note: 'FAKE: inhaler kept on person' }).expect(201)).body.data;
    expect(reviewed).toMatchObject({ status: 'cleared', outcomeLabel: 'Fit, with adjustments', note: 'FAKE: inhaler kept on person', reviewedBy: { id: manager.id } });
    expect(await onboardingItem(w.staffId)).toMatchObject({ done: true });
    const row = await prisma.healthDeclaration.findUniqueOrThrow({ where: { staffProfileId: w.staffId } });
    expect(Buffer.from(row.reviewNoteEncrypted!).toString('latin1')).not.toContain('inhaler');

    await http().put('/api/v1/staff/me/health').set(w.auth).send({ answers: { ...answers, medication: { answer: 'yes', details: 'FAKE: new tablets' } }, declaration: true }).expect(200);
    expect((await http().get(`/api/v1/staff/${w.staffId}/health/status`).set(w.auth).expect(200)).body.data.status).toBe('submitted');
    await http().post(`/api/v1/staff/${w.staffId}/health/review`).set(coordinator.auth).send({ outcome: 'fit' }).expect(403);
  });
});
