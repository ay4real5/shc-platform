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
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { setupApp } from '../src/setup-app.js';
import { loginForTests } from './login-helper.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'Correct-Horse-9!';
const noThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};
type Auth = { Authorization: string };

describe.skipIf(!hasDb)('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let office: { id: string; auth: Auth };
  let admin: { id: string; auth: Auth };
  const http = () => request(app.getHttpServer());
  const day = addDays(utcTodayString(), 30);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue(noThrottle)
      .compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `Notifications Test ${randomUUID()}` } })).id;
    office = await seedUser('care_coordinator');
    admin = await seedUser('agency_admin');
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { agencyId } });
    await purgeAuditLogs(prisma, agencyId);
    await prisma.user.deleteMany({ where: { agencyId } });
    await prisma.agency.delete({ where: { id: agencyId } });
    await app.close();
  });

  async function seedUser(roleName: string) {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `n-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        agencyId,
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        passwordChangedAt: new Date(),
        firstName: 'Nia',
        lastName: roleName,
        userRoles: { create: { roleId: role.id } },
      },
    });
    const accessToken = await loginForTests(http(), email, PASSWORD);
    return { id: user.id, auth: { Authorization: `Bearer ${accessToken}` } };
  }

  async function caregiver() {
    const user = await seedUser('care_worker');
    const staff = await prisma.staffProfile.create({ data: { userId: user.id, agencyId, discipline: 'care_worker' } });
    return { ...user, staffId: staff.id };
  }

  const inbox = async (who: Auth) => (await http().get('/api/v1/notifications').set(who).expect(200)).body.data;
  /** A notification straight from the service, as any feature would send one. */
  const send = (userId: string, actorUserId?: string) =>
    app.get(NotificationsService).notify({ agencyId, userIds: [userId], type: 'system', title: 'Test notice', body: 'Open the app for details.', ...(actorUserId ? { actorUserId } : {}) });

  it('tells the requester when time off is decided', async () => {
    const cg = await caregiver();
    const request1 = (
      await http()
        .post(`/api/v1/staff/${cg.staffId}/time-off`)
        .set(cg.auth)
        .send({ startDate: addDays(day, 10), endDate: addDays(day, 12), type: 'annual_leave' })
        .expect(201)
    ).body.data;
    await http().patch(`/api/v1/staff/${cg.staffId}/time-off/${request1.id}`).set(admin.auth).send({ status: 'approved' }).expect(200);

    const types = (await inbox(cg.auth)).map((n: { type: string; title: string }) => `${n.type}:${n.title}`);
    expect(types).toContain('time_off_decided:Time off approved');
  });

  it('marks one or all as read, counts unread, and keeps inboxes private', async () => {
    const cg = await caregiver();
    await send(cg.id);
    await send(cg.id);

    expect((await http().get('/api/v1/notifications/unread-count').set(cg.auth).expect(200)).body.data).toEqual({ unread: 2 });
    const [first] = await inbox(cg.auth);

    // Someone else can't see or mark it.
    expect(await inbox(office.auth)).not.toContainEqual(expect.objectContaining({ id: first.id }));
    await http().patch(`/api/v1/notifications/${first.id}/read`).set(office.auth).expect(404);

    const read = await http().patch(`/api/v1/notifications/${first.id}/read`).set(cg.auth).expect(200);
    expect(read.body.data).toMatchObject({ isRead: true });
    expect((await http().get('/api/v1/notifications?unreadOnly=true').set(cg.auth).expect(200)).body.data).toHaveLength(1);

    expect((await http().post('/api/v1/notifications/mark-all-read').set(cg.auth).expect(200)).body.data).toEqual({ updated: 1 });
    expect((await http().get('/api/v1/notifications/unread-count').set(cg.auth).expect(200)).body.data).toEqual({ unread: 0 });
  });

  it("doesn't notify people about their own actions", async () => {
    const before = await prisma.notification.count({ where: { userId: office.id } });
    const cg = await caregiver();
    await send(office.id, office.id); // the actor is never told about their own action
    await send(cg.id, office.id);
    expect(await prisma.notification.count({ where: { userId: office.id } })).toBe(before);
    expect(await prisma.notification.count({ where: { userId: cg.id } })).toBe(1);
  });
});
