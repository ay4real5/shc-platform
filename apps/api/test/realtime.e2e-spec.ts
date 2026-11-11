import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { purgeAuditLogs } from '../src/modules/audit/purge-audit-logs.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { setupApp } from '../src/setup-app.js';
import { loginForTests } from './login-helper.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'Correct-Horse-9!';
const noThrottle = {
  increment: async () => ({
    totalHits: 1,
    timeToExpire: 60,
    isBlocked: false,
    timeToBlockExpire: 0,
  }),
};

describe.skipIf(!hasDb)('Real-time (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let agencyId: string;
  let supervisor: { id: string; token: string };
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue(noThrottle)
      .compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.listen(0, '127.0.0.1'); // sockets need a real port
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    agencyId = (
      await prisma.agency.create({
        data: { name: `Realtime Test ${randomUUID()}`, timezone: 'UTC' },
      })
    ).id;
    supervisor = await seedUser('supervisor');
  });

  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
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
    const email = `rt-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        agencyId,
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        passwordChangedAt: new Date(),
        firstName: 'Rio',
        lastName: roleName,
        userRoles: { create: { roleId: role.id } },
      },
    });
    const accessToken = await loginForTests(http(), email, PASSWORD);
    return { id: user.id, token: accessToken as string };
  }

  async function caregiver() {
    const user = await seedUser('home_health_aide');
    const staff = await prisma.staffProfile.create({
      data: { userId: user.id, agencyId, discipline: 'HHA' },
    });
    return { ...user, staffId: staff.id };
  }

  /** Connects and resolves once the server has accepted (or rejected) the socket. */
  function connect(
    namespace: string,
    token?: string,
  ): Promise<{ socket: Socket; refused?: string }> {
    const socket = io(`${baseUrl}${namespace}`, {
      path: '/api/v1/socket.io',
      transports: ['websocket'],
      auth: token ? { token } : {},
      reconnection: false,
    });
    sockets.push(socket);
    return new Promise((resolve) => {
      // Authentication happens before the connection is accepted; room joins right after — give them a moment.
      socket.on('connect', () => setTimeout(() => resolve({ socket }), 200));
      socket.on('connect_error', (e: Error) => resolve({ socket, refused: e.message }));
    });
  }

  const next = <T>(socket: Socket, event: string, timeoutMs = 5000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no ${event} within ${timeoutMs}ms`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  describe('sockets', () => {
    it('refuses connections without a valid token, and the live monitor without evv:read', async () => {
      expect((await connect('/notifications')).refused).toBe('unauthorized');
      expect((await connect('/notifications', 'not-a-jwt')).refused).toBe('unauthorized');
      const hha = await caregiver();
      expect((await connect('/live-monitor', hha.token)).refused).toBe('forbidden');
      expect((await connect('/live-monitor', supervisor.token)).refused).toBeUndefined();
    });

    it('delivers a new notification only to its recipient', async () => {
      const a = await caregiver();
      const b = await caregiver();
      const sa = (await connect('/notifications', a.token)).socket;
      const sb = (await connect('/notifications', b.token)).socket;
      let bGotOne = false;
      sb.on('notification:new', () => (bGotOne = true));
      const received = next<{ title: string; type: string; isRead: boolean }>(
        sa,
        'notification:new',
      );
      await app
        .get(NotificationsService)
        .notify({ agencyId, userIds: [a.id], type: 'system', title: 'Hello' });
      expect(await received).toMatchObject({ title: 'Hello', type: 'system', isRead: false });
      await new Promise((r) => setTimeout(r, 300));
      expect(bGotOne).toBe(false);
    });
  });
});
