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
import { leaveYear } from '@alora/shared';
import { addDays, toDate, utcTodayString } from '../src/common/utils/dates.js';
import { loginForTests } from './login-helper.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'Correct-Horse-9!';
const noThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};
type Auth = { Authorization: string };

describe.skipIf(!hasDb)('Holiday and absence (e2e)', () => {
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
    agencyId = (await prisma.agency.create({ data: { name: `Holiday Test ${randomUUID()}`, timezone: 'UTC' } })).id;
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
    const email = `hol-${randomUUID()}@example.test`;
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
  const year = leaveYear(today, 4); // the company default: April
  const holiday = async (staffId: string, auth: Auth) => (await http().get(`/api/v1/staff/${staffId}/holiday`).set(auth).expect(200)).body.data;

  it('statutory 5.6 weeks capped at 28, by days per week, with an override and pro-rata for joiners', async () => {
    const w = await worker();
    expect(await holiday(w.staffId, w.auth)).toMatchObject({ leaveYear: year, daysPerWeek: 5, daysPerWeekSet: false, statutory: 28, entitlement: 28, taken: 0, remaining: 28 });

    await http().patch(`/api/v1/staff/${w.staffId}/holiday`).set(w.auth).send({ daysPerWeek: 3 }).expect(403); // the office sets it
    await http().patch(`/api/v1/staff/${w.staffId}/holiday`).set(coordinator.auth).send({ daysPerWeek: 3.3 }).expect(400); // half days only
    expect((await http().patch(`/api/v1/staff/${w.staffId}/holiday`).set(coordinator.auth).send({ daysPerWeek: 3 }).expect(200)).body.data).toMatchObject({ statutory: 16.8, entitlement: 16.8 });
    expect((await http().patch(`/api/v1/staff/${w.staffId}/holiday`).set(coordinator.auth).send({ holidayDaysOverride: 20 }).expect(200)).body.data).toMatchObject({ override: 20, entitlement: 20 });
    expect((await http().patch(`/api/v1/staff/${w.staffId}/holiday`).set(coordinator.auth).send({ holidayDaysOverride: null }).expect(200)).body.data.entitlement).toBe(16.8);

    // Started on the last day of the leave year: half a day.
    await prisma.staffProfile.update({ where: { id: w.staffId }, data: { hireDate: toDate(year.end)!, daysPerWeek: 5 } });
    expect(await holiday(w.staffId, coordinator.auth)).toMatchObject({ entitlement: 0.5, proRated: true });
    const other = await worker();
    await http().get(`/api/v1/staff/${w.staffId}/holiday`).set(other.auth).expect(403);
  });

  it('requests use working days; annual leave must fit the balance; the office records leave already approved', async () => {
    const w = await worker();
    await prisma.staffProfile.update({ where: { id: w.staffId }, data: { holidayDaysOverride: 3 } });
    // Works Mondays only: a full week off uses one day.
    await prisma.staffAvailability.create({ data: { staffProfileId: w.staffId, dayOfWeek: 1, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T16:00:00Z') } });
    const start = addDays(today, 14);
    const r1 = (await http().post('/api/v1/time-off').set(w.auth).send({ startDate: start, endDate: addDays(start, 6), type: 'annual_leave' }).expect(201)).body.data;
    expect(r1).toMatchObject({ workingDays: 1, days: 7, status: 'pending' });
    const r2 = (await http().post(`/api/v1/staff/${w.staffId}/time-off`).set(w.auth).send({ startDate: addDays(start, 7), endDate: addDays(start, 7), type: 'annual_leave', days: 1.5 }).expect(201)).body.data;
    expect(r2).toMatchObject({ workingDays: 1.5, status: 'pending' });
    // 3 − 1 − 1.5 pending = 0.5 left: a full day is too much.
    const tooMuch = await http().post('/api/v1/time-off').set(w.auth).send({ startDate: addDays(start, 20), endDate: addDays(start, 20), type: 'annual_leave', days: 1 }).expect(400);
    expect(tooMuch.body.error.message).toMatch(/only 0.5 are left/);
    await http().post('/api/v1/time-off').set(w.auth).send({ startDate: addDays(start, 20), endDate: addDays(start, 20), type: 'annual_leave', days: 0.7 }).expect(400);

    // The office records leave for them: approved at once, and it can go over (e.g. agreed unpaid extra).
    const recorded = (await http().post(`/api/v1/staff/${w.staffId}/time-off`).set(coordinator.auth).send({ startDate: addDays(start, 21), endDate: addDays(start, 21), type: 'annual_leave', days: 1 }).expect(201)).body.data;
    expect(recorded).toMatchObject({ status: 'approved', approvedById: coordinator.id });
    const h = await holiday(w.staffId, w.auth);
    if (start <= year.end && addDays(start, 21) <= year.end) expect(h).toMatchObject({ entitlement: 3, booked: 1, pending: 2.5, remaining: 2 });
  });

  it('sickness: spells and days over 52 weeks, with the Bradford factor, and the company report', async () => {
    const w = await worker();
    for (const [from, to] of [[-40, -40], [-20, -19], [-400, -399]] as const) {
      await http().post(`/api/v1/staff/${w.staffId}/time-off`).set(coordinator.auth).send({ startDate: addDays(today, from), endDate: addDays(today, to), type: 'sickness', days: to - from + 1 }).expect(201);
    }
    const a = (await http().get(`/api/v1/staff/${w.staffId}/absence`).set(teamLeader.auth).expect(200)).body.data;
    expect(a).toMatchObject({ spells: 2, days: 3, bradford: 12, band: 'low' }); // the one over a year ago doesn't count
    expect(a.periods).toHaveLength(2);
    const stranger = await worker();
    await http().get(`/api/v1/staff/${w.staffId}/absence`).set(stranger.auth).expect(403);

    await http().get('/api/v1/holiday/report').set(w.auth).expect(403);
    const report = (await http().get('/api/v1/holiday/report').set(coordinator.auth).expect(200)).body.data;
    expect(report.leaveYear).toEqual(year);
    expect(report.rows.find((r: { staff: { id: string } }) => r.staff.id === w.staffId)).toMatchObject({ absence: { spells: 2, bradford: 12 }, holiday: { entitlement: 28 } });
  });
});
