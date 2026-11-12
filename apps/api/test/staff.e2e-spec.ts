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
import { setupApp } from '../src/setup-app.js';
import { loginForTests } from './login-helper.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'Correct-Horse-9!';
const noThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};

type Auth = { Authorization: string };

describe.skipIf(!hasDb)('Staff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let otherAgencyId: string;
  let admin: { id: string; auth: Auth };
  let office: { id: string; auth: Auth };
  let recruiter: { id: string; auth: Auth };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue(noThrottle)
      .compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `Staff Test ${randomUUID()}` } })).id;
    otherAgencyId = (await prisma.agency.create({ data: { name: `Staff Other ${randomUUID()}` } })).id;
    admin = await seedUser('agency_admin');
    office = await seedUser('care_coordinator');
    recruiter = await seedUser('recruiter');
  });

  afterAll(async () => {
    for (const id of [agencyId, otherAgencyId]) {
      await prisma.notification.deleteMany({ where: { agencyId: id } });
    await purgeAuditLogs(prisma, id);
      await prisma.user.deleteMany({ where: { agencyId: id } }); // staff profiles + children cascade
      await prisma.agency.delete({ where: { id } });
    }
    await app.close();
  });

  async function seedUser(roleName: string, inAgency = agencyId) {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `s-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        agencyId: inAgency,
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        passwordChangedAt: new Date(),
        firstName: 'Casey',
        lastName: `${roleName}-${randomUUID().slice(0, 4)}`,
        userRoles: { create: { roleId: role.id } },
      },
    });
    const accessToken = await loginForTests(http(), email, PASSWORD);
    return { id: user.id, auth: { Authorization: `Bearer ${accessToken}` } };
  }

  /** A field worker with a staff profile created through the API by the admin. */
  async function caregiver(overrides: Record<string, unknown> = {}) {
    const user = await seedUser('care_worker');
    const profile = (
      await http()
        .post('/api/v1/staff')
        .set(admin.auth)
        .send({
          userId: user.id,
          discipline: 'care_worker',
          employeeId: `E-${randomUUID().slice(0, 6)}`,
          hourlyRate: 12.6,
          mileageRate: 0.45,
          niNumber: 'ab 12 34 56 c',
          town: 'Manchester',
          postcode: 'm1 1aa',
          skills: ['dementia care'],
          languages: ['English', 'Polish'],
          ...overrides,
        })
        .expect(201)
    ).body.data;
    return { ...user, profileId: profile.id as string, profile };
  }

  describe('profiles', () => {
    it('creates a profile; pay and the NI number ending are visible to pay viewers and to the person only', async () => {
      const cg = await caregiver();
      expect(cg.profile).toMatchObject({ discipline: 'care_worker', isActive: true, firstName: 'Casey', postcode: 'M1 1AA' });
      expect(cg.profile.pay).toMatchObject({ hourlyRate: '12.60', mileageRate: '0.4500', niNumberEnding: '56C' });
      expect(JSON.stringify(cg.profile)).not.toContain('AB123456C');
      const row = await prisma.staffProfile.findUniqueOrThrow({ where: { id: cg.profileId } });
      expect(Buffer.from(row.niNumberEncrypted!).toString('latin1')).not.toContain('AB123456C'); // stored encrypted

      const asOffice = (await http().get(`/api/v1/staff/${cg.profileId}`).set(office.auth).expect(200)).body.data;
      expect(asOffice).not.toHaveProperty('pay'); // office staff manage people, not payroll

      const asSelf = (await http().get('/api/v1/staff/me').set(cg.auth).expect(200)).body.data;
      expect(asSelf.pay.hourlyRate).toBe('12.60');
      await http().get(`/api/v1/staff/${cg.profileId}`).set(cg.auth).expect(200);
    });

    it('refuses a user from another agency, a second profile, or a duplicate employee id', async () => {
      const outsider = await seedUser('care_worker', otherAgencyId);
      await http().post('/api/v1/staff').set(admin.auth).send({ userId: outsider.id, discipline: 'care_worker' }).expect(400);

      const cg = await caregiver();
      await http().post('/api/v1/staff').set(admin.auth).send({ userId: cg.id, discipline: 'care_worker' }).expect(409);

      const other = await seedUser('care_worker');
      const dup = await http()
        .post('/api/v1/staff')
        .set(admin.auth)
        .send({ userId: other.id, discipline: 'care_worker', employeeId: cg.profile.employeeId })
        .expect(409);
      expect(dup.body.error.message).toMatch(/employee ID/);
    });

    it('lists with filters (job role, search) and hides other agencies', async () => {
      const cg = await caregiver({ discipline: 'team_leader' });
      const byRole = await http().get('/api/v1/staff?discipline=team_leader&limit=100').set(office.auth).expect(200);
      expect(byRole.body.data.map((s: { id: string }) => s.id)).toContain(cg.profileId);
      expect(byRole.body.data.every((s: { discipline: string }) => s.discipline === 'team_leader')).toBe(true);

      const byEmployeeId = await http().get(`/api/v1/staff?search=${cg.profile.employeeId}`).set(office.auth).expect(200);
      expect(byEmployeeId.body.data).toHaveLength(1);

      const outsiderAdmin = await seedUser('agency_admin', otherAgencyId);
      await http().get(`/api/v1/staff/${cg.profileId}`).set(outsiderAdmin.auth).expect(404);
    });

    it("doesn't let one caregiver read another's profile", async () => {
      const a = await caregiver();
      const b = await caregiver();
      await http().get(`/api/v1/staff/${b.profileId}`).set(a.auth).expect(403);
      await http().get('/api/v1/staff').set(a.auth).expect(403);
    });

    it('terminates employment with date rules', async () => {
      const cg = await caregiver({ hireDate: '2025-03-01' });
      await http().delete(`/api/v1/staff/${cg.profileId}`).set(admin.auth).send({ terminationDate: '2025-01-01' }).expect(400);
      const res = await http().delete(`/api/v1/staff/${cg.profileId}`).set(admin.auth).send({ terminationDate: '2026-01-15' }).expect(200);
      expect(res.body.data).toMatchObject({ isActive: false, terminationDate: '2026-01-15' });
      await http().delete(`/api/v1/staff/${cg.profileId}`).set(admin.auth).send({}).expect(409);
    });
  });

  it('lists users who can still get a staff profile (active, no profile yet)', async () => {
    const withProfile = await caregiver();
    const without = await seedUser('care_coordinator');
    const inactive = await seedUser('care_coordinator');
    await prisma.user.update({ where: { id: inactive.id }, data: { isActive: false } });

    const ids = (await http().get('/api/v1/staff/candidates').set(office.auth).expect(200)).body.data.map(
      (u: { id: string }) => u.id,
    );
    expect(ids).toContain(without.id);
    expect(ids).not.toContain(withProfile.id);
    expect(ids).not.toContain(inactive.id);
    await http().get('/api/v1/staff/candidates').set(withProfile.auth).expect(403);
  });

  describe('credentials', () => {
    it('tracks expiry state and verification, and lists expiring credentials agency-wide', async () => {
      const cg = await caregiver();
      const add = (body: object) => http().post(`/api/v1/staff/${cg.profileId}/credentials`).set(office.auth).send(body);
      const today = utcTodayString();

      const cpr = (await add({ credentialType: 'cpr', credentialName: 'CPR/BLS', expiryDate: addDays(today, 10) }).expect(201)).body.data;
      expect(cpr.state).toBe('expiring_soon');
      const tb = (await add({ credentialType: 'tb_test', credentialName: 'TB test', expiryDate: addDays(today, -3) }).expect(201)).body.data;
      expect(tb.state).toBe('expired');
      const license = (
        await add({ credentialType: 'license', credentialName: 'HHA certificate', issueDate: '2024-01-01', expiryDate: addDays(today, 400) }).expect(201)
      ).body.data;
      expect(license.state).toBe('valid');
      await add({ credentialType: 'x', credentialName: 'bad dates', issueDate: '2025-01-01', expiryDate: '2024-01-01' }).expect(400);

      const verified = await http()
        .patch(`/api/v1/staff/${cg.profileId}/credentials/${license.id}`)
        .set(office.auth)
        .send({ verified: true })
        .expect(200);
      expect(verified.body.data.verifiedById).toBe(office.id);

      const expiring = (await http().get('/api/v1/staff/expiring-credentials?withinDays=30').set(office.auth).expect(200)).body.data;
      const mine = expiring.filter((c: { staff: { id: string } }) => c.staff.id === cg.profileId);
      expect(mine.map((c: { credentialName: string }) => c.credentialName)).toEqual(['TB test', 'CPR/BLS']);

      // The caregiver can see their own credentials but not change them.
      await http().get(`/api/v1/staff/${cg.profileId}/credentials`).set(cg.auth).expect(200);
      await http().delete(`/api/v1/staff/${cg.profileId}/credentials/${tb.id}`).set(cg.auth).expect(403);
      await http().delete(`/api/v1/staff/${cg.profileId}/credentials/${tb.id}`).set(office.auth).expect(204);
    });
  });

  describe('availability', () => {
    it('lets a caregiver set their own weekly schedule, validating times and overlaps', async () => {
      const cg = await caregiver();
      const put = (who: Auth, slots: object[]) =>
        http().put(`/api/v1/staff/${cg.profileId}/availability`).set(who).send({ slots });

      await put(cg.auth, [{ dayOfWeek: 1, startTime: '09:00', endTime: '08:00' }]).expect(400);
      await put(cg.auth, [
        { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
        { dayOfWeek: 1, startTime: '11:00', endTime: '14:00' },
      ]).expect(400);
      await put(cg.auth, [{ dayOfWeek: 7, startTime: '09:00', endTime: '10:00' }]).expect(400);

      await put(cg.auth, [
        { dayOfWeek: 3, startTime: '13:00', endTime: '17:00' },
        { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
      ]).expect(200);
      const slots = (await http().get(`/api/v1/staff/${cg.profileId}/availability`).set(office.auth).expect(200)).body.data;
      expect(slots).toEqual([
        { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
        { dayOfWeek: 3, startTime: '13:00', endTime: '17:00' },
      ]);

      const other = await caregiver();
      await http().put(`/api/v1/staff/${other.profileId}/availability`).set(other.auth).send({ slots: [] }).expect(200); // own is fine
      await http().put(`/api/v1/staff/${cg.profileId}/availability`).set(other.auth).send({ slots: [] }).expect(403);
    });
  });

  describe('time off', () => {
    it('request → approve by a manager; no self-approval; no overlaps; cancel only while pending', async () => {
      const cg = await caregiver();
      const request1 = (
        await http()
          .post(`/api/v1/staff/${cg.profileId}/time-off`)
          .set(cg.auth)
          .send({ startDate: '2026-12-20', endDate: '2026-12-27', type: 'annual_leave' })
          .expect(201)
      ).body.data;
      expect(request1.status).toBe('pending');

      await http()
        .post(`/api/v1/staff/${cg.profileId}/time-off`)
        .set(cg.auth)
        .send({ startDate: '2026-12-26', endDate: '2026-12-30', type: 'other' })
        .expect(409);
      await http()
        .post(`/api/v1/staff/${cg.profileId}/time-off`)
        .set(cg.auth)
        .send({ startDate: '2026-12-10', endDate: '2026-12-01', type: 'sickness' })
        .expect(400);

      const decide = (who: Auth, id: string, status: string) =>
        http().patch(`/api/v1/staff/${cg.profileId}/time-off/${id}`).set(who).send({ status });
      await decide(cg.auth, request1.id, 'approved').expect(403); // can't approve own
      await decide(recruiter.auth, request1.id, 'approved').expect(403); // recruiters lack time_off:approve
      const approved = await decide(admin.auth, request1.id, 'approved').expect(200);
      expect(approved.body.data).toMatchObject({ status: 'approved', approvedById: admin.id });
      await decide(cg.auth, request1.id, 'cancelled').expect(409); // no longer pending

      const request2 = (
        await http()
          .post(`/api/v1/staff/${cg.profileId}/time-off`)
          .set(cg.auth)
          .send({ startDate: '2027-01-05', endDate: '2027-01-05', type: 'sickness' })
      ).body.data;
      await decide(cg.auth, request2.id, 'cancelled').expect(200);

      const list = (await http().get(`/api/v1/staff/${cg.profileId}/time-off`).set(cg.auth).expect(200)).body.data;
      expect(list.map((r: { status: string }) => r.status).sort()).toEqual(['approved', 'cancelled']);
    });
  });

  it('keeps PHI out of the audit trail', async () => {
    const logs = await prisma.auditLog.findMany({ where: { agencyId } });
    const text = JSON.stringify(logs.map(({ details }) => details));
    for (const secret of ['234-56-7801', '21.5', 'dementia']) expect(text).not.toContain(secret);
  });
});
