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
const noThrottle = { increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }) };
type Person = { id: string; auth: { Authorization: string } };

describe.skipIf(!hasDb)('Custom roles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let otherAgencyId: string;
  let admin: Person;
  let supervisor: Person;
  let staffer: Person;
  const http = () => request(app.getHttpServer());
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(noThrottle).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `Roles ${randomUUID()}`, timezone: 'UTC' } })).id;
    otherAgencyId = (await prisma.agency.create({ data: { name: `Roles other ${randomUUID()}`, timezone: 'UTC' } })).id;
    admin = await seedUser('agency_admin');
    supervisor = await seedUser('care_coordinator');
    staffer = await seedUser('care_coordinator');
  });

  afterAll(async () => {
    for (const id of [agencyId, otherAgencyId]) {
      await purgeAuditLogs(prisma, id);
      await prisma.user.deleteMany({ where: { agencyId: id } }); // user roles cascade
      await prisma.role.deleteMany({ where: { agencyId: id } });
      await prisma.agency.delete({ where: { id } });
    }
    await app.close();
  });

  async function seedUser(roleName: string, inAgency = agencyId, roleId?: string): Promise<Person> {
    const role = roleId ? { id: roleId } : await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `roles-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        agencyId: inAgency,
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        passwordChangedAt: new Date(),
        firstName: 'Rho',
        lastName: roleName,
        userRoles: { create: { roleId: role.id } },
      },
    });
    return { id: user.id, auth: { Authorization: `Bearer ${await loginForTests(http(), email, PASSWORD)}` } };
  }

  it('lets an admin create a role, give it to someone, and change it', async () => {
    const role = (
      await http()
        .post(api('/roles'))
        .set(admin.auth)
        .send({ name: 'training_lead', description: 'Runs training', permissions: ['training:manage', 'documents:read', 'documents:create'] })
        .expect(201)
    ).body.data;
    expect(role).toMatchObject({ name: 'training_lead', isSystem: false, users: 0, permissions: ['documents:create', 'documents:read', 'training:manage'] });

    await http().patch(api(`/users/${staffer.id}`)).set(admin.auth).send({ roleIds: [role.id] }).expect(200);
    await http().get(api('/training/courses')).set(staffer.auth).expect(200);
    await http().get(api('/staff')).set(staffer.auth).expect(403); // office_staff's staff:read is gone

    // Narrowing the role takes effect straight away.
    await http().patch(api(`/roles/${role.id}`)).set(admin.auth).send({ permissions: ['documents:read'] }).expect(200);
    await http().get(api('/training/courses')).set(staffer.auth).expect(403);

    const list = (await http().get(api('/roles')).set(admin.auth).expect(200)).body.data;
    expect(list.find((r: { id: string }) => r.id === role.id)).toMatchObject({ users: 1, permissions: ['documents:read'] });

    // In use → can't delete; free → can.
    await http().delete(api(`/roles/${role.id}`)).set(admin.auth).expect(409);
    await http().patch(api(`/users/${staffer.id}`)).set(admin.auth).send({ roleIds: [(await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: 'care_coordinator' } })).id] }).expect(200);
    await http().delete(api(`/roles/${role.id}`)).set(admin.auth).expect(204);
  });

  it('blocks privilege escalation, built-in roles and other agencies', async () => {
    // A custom "mini admin" can manage roles but can't delete staff…
    const mini = (await http().post(api('/roles')).set(admin.auth).send({ name: 'mini_admin', permissions: ['settings:update', 'users:update', 'users:read', 'documents:read'] }).expect(201)).body.data;
    const miniUser = await seedUser('mini_admin', agencyId, mini.id);
    // …so it can't create or widen a role with that permission.
    await http().post(api('/roles')).set(miniUser.auth).send({ name: 'sneaky', permissions: ['staff:delete'] }).expect(403);
    const ok = (await http().post(api('/roles')).set(miniUser.auth).send({ name: 'readers', permissions: ['documents:read'] }).expect(201)).body.data;
    await http().patch(api(`/roles/${ok.id}`)).set(miniUser.auth).send({ permissions: ['documents:read', 'staff:delete'] }).expect(403);
    // Nor reshape a role that already holds more than it has.
    const wide = (await http().post(api('/roles')).set(admin.auth).send({ name: 'wide', permissions: ['staff:delete', 'documents:read'] }).expect(201)).body.data;
    await http().patch(api(`/roles/${wide.id}`)).set(miniUser.auth).send({ permissions: ['documents:read'] }).expect(403);
    await http().delete(api(`/roles/${wide.id}`)).set(miniUser.auth).expect(403);

    // Built-in roles are fixed; their names are reserved.
    const builtIn = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: 'care_coordinator' } });
    await http().patch(api(`/roles/${builtIn.id}`)).set(admin.auth).send({ description: 'x' }).expect(403);
    await http().post(api('/roles')).set(admin.auth).send({ name: 'care_coordinator', permissions: ['documents:read'] }).expect(409);
    await http().post(api('/roles')).set(admin.auth).send({ name: 'readers', permissions: ['documents:read'] }).expect(409);
    await http().post(api('/roles')).set(admin.auth).send({ name: 'Bad Name', permissions: ['documents:read'] }).expect(400);
    await http().post(api('/roles')).set(admin.auth).send({ name: 'unknown_perm', permissions: ['nope:read'] }).expect(400);

    // Supervisors can't manage roles; another agency can't see or touch ours.
    await http().post(api('/roles')).set(supervisor.auth).send({ name: 'x_role', permissions: ['documents:read'] }).expect(403);
    const outsider = await seedUser('agency_admin', otherAgencyId);
    await http().patch(api(`/roles/${ok.id}`)).set(outsider.auth).send({ description: 'mine now' }).expect(404);
    expect((await http().get(api('/roles')).set(outsider.auth).expect(200)).body.data.some((r: { id: string }) => r.id === ok.id)).toBe(false);
  });
});
