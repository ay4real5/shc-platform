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

describe.skipIf(!hasDb)('Staff spreadsheet import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let admin: { id: string; auth: Auth };
  let coordinator: { id: string; auth: Auth };
  let worker: { id: string; auth: Auth };
  const http = () => request(app.getHttpServer());
  const tag = randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${tag}@example.test`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(noThrottle).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `Import Test ${randomUUID()}`, timezone: 'Europe/London' } })).id;
    admin = await seedUser('agency_admin');
    coordinator = await seedUser('care_coordinator');
    worker = await seedUser('care_worker');
  });

  afterAll(async () => {
    await purgeAuditLogs(prisma, agencyId);
    await prisma.rightToWorkCheck.deleteMany({ where: { agencyId } });
    await prisma.dbsCheck.deleteMany({ where: { agencyId } });
    await prisma.user.deleteMany({ where: { agencyId } });
    await prisma.agency.delete({ where: { id: agencyId } });
    await app.close();
  });

  async function seedUser(roleName: string) {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const address = `imp-${roleName}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        agencyId,
        email: address,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        passwordChangedAt: new Date(),
        firstName: 'Casey',
        lastName: roleName,
        userRoles: { create: { roleId: role.id } },
      },
    });
    return { id: user.id, auth: { Authorization: `Bearer ${await loginForTests(http(), address, PASSWORD)}` } };
  }

  const HEAD = 'First name,Last name,Email,Job role,Start date,Employee ID,Right to Work checked on,Right to Work type,Right to Work follow-up date,DBS certificate number,DBS issue date,DBS level,DBS result,DBS Update Service,References checked,Safeguarding date,Safeguarding expires';
  const sheet = () =>
    [
      HEAD,
      `Test,Carer,${email('carer')},Care worker,14/03/2022,IMP-${tag}-1,10/03/2022,No time limit,,001234567890,01/03/2022,Enhanced with adults barred list,Clear,Yes,Yes,20/03/2025,20/03/2099`,
      `Test,Visa,${email('visa')},Senior care worker,01/06/2024,,01/06/2024,Time-limited,01/06/2099,,,,,,,,`,
      `Test,Broken,not-an-email,Chef,,,,,,,,,,,,,`,
      `Test,Manager,${email('manager')},Manager,,,,,,,,,,,,,`,
    ].join('\r\n');

  it('previews without saving anything', async () => {
    const res = await http().post('/api/v1/staff-import').set(admin.auth).send({ csv: sheet(), dryRun: true }).expect(200);
    expect(res.body.data.counts).toEqual({ ready: 3, imported: 0, skipped: 0, error: 1 });
    expect(res.body.data.rows[2]).toMatchObject({ row: 4, status: 'error', problems: expect.arrayContaining([expect.stringContaining('Job role "Chef"')]) });
    expect(res.body.data.rows[0].adds).toEqual(['Right to Work (no time limit)', 'DBS (Update Service)', 'References (paper file)', '1 training/other check']);
    expect(await prisma.user.count({ where: { email: email('carer') } })).toBe(0);
  });

  it('imports good rows with their checks, and a second upload skips them', async () => {
    const res = await http().post('/api/v1/staff-import').set(admin.auth).send({ csv: sheet() }).expect(200);
    expect(res.body.data.counts).toEqual({ ready: 0, imported: 3, skipped: 0, error: 1 });

    const carer = await prisma.user.findUniqueOrThrow({
      where: { email: email('carer') },
      include: { userRoles: { include: { role: true } }, staffProfile: { include: { credentials: true, rightToWorkChecks: true, dbsChecks: true } } },
    });
    expect(carer.agencyId).toBe(agencyId);
    expect(carer.userRoles.map((r) => r.role.name)).toEqual(['care_worker']);
    const profile = carer.staffProfile!;
    expect(profile).toMatchObject({ discipline: 'care_worker', employeeId: `IMP-${tag}-1` });
    expect(profile.hireDate!.toISOString().slice(0, 10)).toBe('2022-03-14');
    expect(profile.rightToWorkChecks).toEqual([expect.objectContaining({ method: 'imported', permission: 'unlimited', outcome: 'passed', followUpOn: null })]);
    expect(profile.dbsChecks).toEqual([expect.objectContaining({ level: 'enhanced_barred_adults', result: 'clear', updateService: true })]);
    const types = profile.credentials.map((c) => c.credentialType).sort();
    expect(types).toEqual(['dbs_enhanced', 'references', 'right_to_work', 'safeguarding']);
    // Not verified by anyone in SHC: the evidence still has to be checked.
    expect(profile.credentials.every((c) => c.verifiedById === null)).toBe(true);
    expect(profile.credentials.find((c) => c.credentialType === 'dbs_enhanced')!.expiryDate!.toISOString().slice(0, 10)).toBe('2023-03-01');

    const visa = await prisma.user.findUniqueOrThrow({ where: { email: email('visa') }, include: { staffProfile: { include: { credentials: true } } } });
    expect(visa.staffProfile!.credentials[0].expiryDate!.toISOString().slice(0, 10)).toBe('2099-06-01');

    // The imported Right to Work check reads well in the Right to Work section.
    const rtw = await http().get(`/api/v1/staff/${profile.id}/right-to-work`).set(admin.auth).expect(200);
    expect(rtw.body.data[0].methodLabel).toBe('Checked before SHC (imported from spreadsheet)');

    const again = await http().post('/api/v1/staff-import').set(admin.auth).send({ csv: sheet() }).expect(200);
    expect(again.body.data.counts).toEqual({ ready: 0, imported: 0, skipped: 3, error: 1 });
  });

  it('is for people who can create staff and logins only', async () => {
    await http().post('/api/v1/staff-import').set(worker.auth).send({ csv: HEAD, dryRun: true }).expect(403);
    // Office coordinators add staff one by one; bulk logins are for admins and registered managers.
    await http().post('/api/v1/staff-import').set(coordinator.auth).send({ csv: HEAD, dryRun: true }).expect(403);
  });

  it('refuses a file with missing columns', async () => {
    const res = await http().post('/api/v1/staff-import').set(admin.auth).send({ csv: 'Name\nAnn', dryRun: true }).expect(200);
    expect(res.body.data.fileErrors[0]).toMatch(/Missing columns/);
  });
});
