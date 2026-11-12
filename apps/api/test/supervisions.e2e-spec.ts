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
import { SupervisionRemindersJob } from '../src/modules/staff/supervision-reminders.job.js';
import { loginForTests } from './login-helper.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'Correct-Horse-9!';
const noThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};
type Auth = { Authorization: string };

describe.skipIf(!hasDb)('Supervisions, appraisals and spot checks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let coordinator: { id: string; auth: Auth };
  let teamLeader: { id: string; auth: Auth };
  let manager: { id: string; auth: Auth };
  let recruiter: { id: string; auth: Auth };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(noThrottle).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `Supervision Test ${randomUUID()}`, timezone: 'UTC' } })).id;
    coordinator = await seedUser('care_coordinator');
    teamLeader = await seedUser('team_leader');
    manager = await seedUser('registered_manager');
    recruiter = await seedUser('recruiter');
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { agencyId } });
    await prisma.supervisionOverdueAlert.deleteMany({ where: { staffProfileId: { in: (await prisma.staffProfile.findMany({ where: { agencyId }, select: { id: true } })).map((p) => p.id) } } });
    await purgeAuditLogs(prisma, agencyId);
    await prisma.user.deleteMany({ where: { agencyId } }); // staff profiles, checks and credentials cascade
    await prisma.agency.delete({ where: { id: agencyId } });
    await app.close();
  });

  async function seedUser(roleName: string) {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `sup-${randomUUID()}@example.test`;
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
  const sup = async (staffId: string, auth: Auth) => (await http().get(`/api/v1/staff/${staffId}/supervisions`).set(auth).expect(200)).body.data;
  const due = (t: string, d: { type: string; overdue: boolean; dueOn: string; lastHeld: string | null }[]) => d.find((x) => x.type === t)!;

  it('what is due follows the start date and the last one held', async () => {
    const w = await worker();
    await prisma.staffProfile.update({ where: { id: w.staffId }, data: { hireDate: toDate(addDays(today, -200))! } });
    const before = await sup(w.staffId, coordinator.auth);
    expect(due('supervision', before.due)).toMatchObject({ overdue: true, lastHeld: null }); // first one was due a month in
    expect(due('appraisal', before.due).overdue).toBe(false); // a year in
    expect(due('spot_check', before.due).overdue).toBe(true);

    const rec = (await http().post(`/api/v1/staff/${w.staffId}/supervisions`).set(teamLeader.auth).send({ type: 'supervision', heldOn: today, notes: 'FAKE: workload fine, wants a moving and handling refresher' }).expect(201)).body.data;
    expect(rec).toMatchObject({ status: 'completed', heldOn: today, supervisor: { id: teamLeader.id } });
    const after = await sup(w.staffId, coordinator.auth);
    expect(due('supervision', after.due)).toMatchObject({ overdue: false, lastHeld: today });
    expect(due('supervision', after.due).dueOn > addDays(today, 85)).toBe(true);
  });

  it('book, record (notes encrypted), and the person reads and signs; others see dates only', async () => {
    const w = await worker();
    const date = addDays(today, 7);
    await http().post(`/api/v1/staff/${w.staffId}/supervisions`).set(recruiter.auth).send({ type: 'appraisal', scheduledFor: date }).expect(403); // no supervisions:manage
    await http().post(`/api/v1/staff/${w.staffId}/supervisions`).set(coordinator.auth).send({ type: 'appraisal', scheduledFor: addDays(today, -1) }).expect(400);
    await http().post(`/api/v1/staff/${w.staffId}/supervisions`).set(coordinator.auth).send({ type: 'appraisal', scheduledFor: date, supervisorId: w.id }).expect(400); // nobody supervises themselves
    const booked = (await http().post(`/api/v1/staff/${w.staffId}/supervisions`).set(coordinator.auth).send({ type: 'appraisal', scheduledFor: date, supervisorId: manager.id }).expect(201)).body.data;
    expect(booked).toMatchObject({ status: 'scheduled', scheduledFor: date, supervisor: { id: manager.id } });
    await http().post(`/api/v1/staff/${w.staffId}/supervisions`).set(coordinator.auth).send({ type: 'appraisal', scheduledFor: addDays(date, 1) }).expect(409); // one booked already
    expect(await prisma.notification.count({ where: { userId: { in: [w.id, manager.id] }, type: 'supervision' } })).toBe(2);

    await http().post(`/api/v1/supervisions/${booked.id}/complete`).set(manager.auth).send({ heldOn: today, notes: 'short' }).expect(400);
    const done = (await http().post(`/api/v1/supervisions/${booked.id}/complete`).set(manager.auth).send({ heldOn: today, notes: 'FAKE: objectives for next year agreed' }).expect(200)).body.data;
    expect(done).toMatchObject({ status: 'completed', notes: 'FAKE: objectives for next year agreed' });
    const row = await prisma.supervision.findUniqueOrThrow({ where: { id: booked.id } });
    expect(Buffer.from(row.notesEncrypted!).toString('latin1')).not.toContain('objectives');

    // The recruiter (staff:read, no supervisions:manage) sees the session but not the notes.
    const seen = (await sup(w.staffId, recruiter.auth)).sessions.find((s: { id: string }) => s.id === booked.id);
    expect(seen).toMatchObject({ status: 'completed', notes: null });

    // The person sees it, signs it with a comment, once.
    const toSign = (await http().get('/api/v1/supervisions/mine/to-sign').set(w.auth).expect(200)).body.data;
    expect(toSign.map((s: { id: string }) => s.id)).toEqual([booked.id]);
    expect((await sup(w.staffId, w.auth)).sessions[0].notes).toBe('FAKE: objectives for next year agreed');
    await http().post(`/api/v1/supervisions/${booked.id}/acknowledge`).set(coordinator.auth).send({}).expect(404); // only the person
    const signed = (await http().post(`/api/v1/supervisions/${booked.id}/acknowledge`).set(w.auth).send({ comment: 'FAKE: agreed' }).expect(200)).body.data;
    expect(signed).toMatchObject({ staffComment: 'FAKE: agreed', acknowledgedAt: expect.any(String) });
    await http().post(`/api/v1/supervisions/${booked.id}/acknowledge`).set(w.auth).send({}).expect(409);
    expect((await http().get('/api/v1/supervisions/mine/to-sign').set(w.auth).expect(200)).body.data).toEqual([]);
  });

  it('the daily job reminds the day before, and alerts supervisors once when someone becomes overdue', async () => {
    const w = await worker();
    await prisma.staffProfile.update({ where: { id: w.staffId }, data: { hireDate: toDate(addDays(today, -400))! } });
    const booked = (await http().post(`/api/v1/staff/${w.staffId}/supervisions`).set(coordinator.auth).send({ type: 'supervision', scheduledFor: addDays(today, 1) }).expect(201)).body.data;
    await prisma.notification.deleteMany({ where: { agencyId } });

    const job = app.get(SupervisionRemindersJob);
    const first = await job.run(agencyId);
    expect(first.reminders).toBe(1);
    expect(first.overdue).toBeGreaterThanOrEqual(2); // appraisal and spot check (the supervision is booked)
    const second = await job.run(agencyId);
    expect(second).toEqual({ reminders: 0, overdue: 0 });
    expect(await prisma.notification.count({ where: { userId: w.id, title: 'Supervision tomorrow' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: manager.id, title: { contains: 'now overdue' } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: w.id, title: { contains: 'now overdue' } } })).toBe(0);

    const overview = (await http().get('/api/v1/supervisions/overview').set(teamLeader.auth).expect(200)).body.data;
    const mine = overview.rows.find((r: { staff: { id: string } }) => r.staff.id === w.staffId);
    expect(mine.due.find((d: { type: string }) => d.type === 'supervision')).toMatchObject({ overdue: false, scheduled: { id: booked.id } });
    await http().get('/api/v1/supervisions/overview').set(w.auth).expect(403);
    await http().post(`/api/v1/supervisions/${booked.id}/cancel`).set(coordinator.auth).expect(200);
  });
});
