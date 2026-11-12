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

describe.skipIf(!hasDb)('Documents to sign and onboarding packs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let coordinator: { id: string; auth: Auth };
  let teamLeader: { id: string; auth: Auth };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(noThrottle).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `Sign Test ${randomUUID()}`, timezone: 'UTC' } })).id;
    coordinator = await seedUser('care_coordinator');
    teamLeader = await seedUser('team_leader');
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { agencyId } });
    await purgeAuditLogs(prisma, agencyId);
    await prisma.signatureRequest.deleteMany({ where: { agencyId } });
    await prisma.onboardingPack.deleteMany({ where: { agencyId } });
    await prisma.document.deleteMany({ where: { agencyId } });
    await prisma.user.deleteMany({ where: { agencyId } }); // staff profiles cascade
    await prisma.agency.delete({ where: { id: agencyId } });
    await app.close();
  });

  async function seedUser(roleName: string) {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `sig-${randomUUID()}@example.test`;
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

  const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% FAKE ${text}\n%%EOF\n`);
  async function upload(title: string, staffId?: string, type = 'policy') {
    let req = http().post('/api/v1/documents').set(coordinator.auth).attach('file', pdf(title), `${title}.pdf`).field('documentType', type).field('title', title);
    if (staffId) req = req.field('staffId', staffId);
    return (await req.expect(201)).body.data.id as string;
  }
  const onboarding = async (staffId: string) => (await http().get(`/api/v1/staff/${staffId}/onboarding`).set(coordinator.auth).expect(200)).body.data;

  it('a policy goes to several people; each signs their own copy, and only they can sign it', async () => {
    const a = await worker();
    const b = await worker();
    const policy = await upload('Safeguarding policy');
    const sent = (await http().post(`/api/v1/documents/${policy}/signature-requests`).set(coordinator.auth).send({ staffIds: [a.staffId, b.staffId] }).expect(201)).body.data;
    expect(sent).toEqual({ created: 2, alreadyAsked: 0 });
    expect((await http().post(`/api/v1/documents/${policy}/signature-requests`).set(coordinator.auth).send({ staffIds: [a.staffId] }).expect(201)).body.data).toEqual({ created: 0, alreadyAsked: 1 });

    const mine = (await http().get('/api/v1/signature-requests/mine').set(a.auth).expect(200)).body.data;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: 'pending', document: { title: 'Safeguarding policy', personal: false } });
    // A care worker has no documents permission, yet can open what they were asked to sign…
    const file = await http().get(`/api/v1/signature-requests/${mine[0].id}/file`).set(a.auth).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((file.body as Buffer).toString()).toContain('Safeguarding policy');
    // …but not someone else's, and nobody else can sign for them.
    await http().get(`/api/v1/signature-requests/${mine[0].id}/file`).set(b.auth).expect(403);
    await http().post(`/api/v1/signature-requests/${mine[0].id}/sign`).set(coordinator.auth).send({ typedName: 'Casey', agreed: true }).expect(403);
    await http().post(`/api/v1/signature-requests/${mine[0].id}/sign`).set(a.auth).send({ typedName: 'Casey Worker', agreed: false }).expect(400);

    const signed = (await http().post(`/api/v1/signature-requests/${mine[0].id}/sign`).set(a.auth).send({ typedName: 'Casey Worker', agreed: true }).expect(200)).body.data;
    expect(signed).toMatchObject({ status: 'signed', signedName: 'Casey Worker' });
    const row = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: mine[0].id } });
    expect(row.contentHash).toMatch(/^[0-9a-f]{64}$/);
    await http().post(`/api/v1/signature-requests/${mine[0].id}/sign`).set(a.auth).send({ typedName: 'Casey Worker', agreed: true }).expect(409);

    const who = (await http().get(`/api/v1/documents/${policy}/signature-requests`).set(coordinator.auth).expect(200)).body.data;
    expect(who.map((r: { status: string }) => r.status).sort()).toEqual(['pending', 'signed']);
    // The onboarding checklist counts it.
    expect((await onboarding(b.staffId)).items.find((i: { key: string }) => i.key === 'documents_signed')).toMatchObject({ done: false });
    expect((await onboarding(a.staffId)).items.find((i: { key: string }) => i.key === 'documents_signed')).toMatchObject({ done: true });
  });

  it('a personal contract can only go to its own person, and signing it marks the document signed', async () => {
    const a = await worker();
    const b = await worker();
    const contract = await upload('Contract of employment', a.staffId, 'contract');
    await http().post(`/api/v1/documents/${contract}/signature-requests`).set(coordinator.auth).send({ staffIds: [b.staffId] }).expect(400);
    await http().post(`/api/v1/documents/${contract}/signature-requests`).set(teamLeader.auth).send({ staffIds: [a.staffId] }).expect(403);
    await http().post(`/api/v1/documents/${contract}/signature-requests`).set(coordinator.auth).send({ staffIds: [a.staffId] }).expect(201);
    const [req] = (await http().get(`/api/v1/staff/${a.staffId}/signature-requests`).set(a.auth).expect(200)).body.data;
    expect(req.document.personal).toBe(true);
    await http().get(`/api/v1/staff/${a.staffId}/signature-requests`).set(b.auth).expect(403);
    await http().post(`/api/v1/signature-requests/${req.id}/sign`).set(a.auth).send({ typedName: 'Casey Worker', agreed: true }).expect(200);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: contract } });
    expect(doc.isSigned).toBe(true);
    expect(doc.signatureData).toMatchObject({ name: 'Casey Worker' });
  });

  it('onboarding packs go out by job role, never twice, and can be cancelled', async () => {
    const handbook = await upload('Staff handbook');
    const medication = await upload('Medication policy');
    await http().post('/api/v1/onboarding-packs').set(coordinator.auth).send({ name: 'Everyone', disciplines: [], documentIds: [handbook] }).expect(201);
    const seniors = (await http().post('/api/v1/onboarding-packs').set(coordinator.auth).send({ name: 'Seniors', disciplines: ['senior_care_worker'], documentIds: [medication] }).expect(201)).body.data;
    expect(seniors.documents).toEqual([{ id: medication, title: 'Medication policy' }]);
    const a = await worker(); // care_worker
    const contract = await upload('Contract', a.staffId, 'contract');
    await http().post('/api/v1/onboarding-packs').set(coordinator.auth).send({ name: 'Bad', disciplines: [], documentIds: [contract] }).expect(400); // personal documents don't go in packs

    expect((await http().post(`/api/v1/staff/${a.staffId}/onboarding-pack`).set(coordinator.auth).expect(201)).body.data).toEqual({ created: 1, alreadyAsked: 0 });
    expect((await http().post(`/api/v1/staff/${a.staffId}/onboarding-pack`).set(coordinator.auth).expect(201)).body.data).toEqual({ created: 0, alreadyAsked: 1 });
    const [req] = (await http().get('/api/v1/signature-requests/mine').set(a.auth).expect(200)).body.data;
    expect(req.document.title).toBe('Staff handbook');
    const note = await prisma.notification.findFirst({ where: { userId: a.id, type: 'document_signature' } });
    expect(note?.title).toBe('Please sign: Staff handbook');

    await http().post(`/api/v1/signature-requests/${req.id}/cancel`).set(coordinator.auth).expect(204);
    expect((await http().get('/api/v1/signature-requests/mine').set(a.auth).expect(200)).body.data).toEqual([]);
    await http().delete(`/api/v1/onboarding-packs/${seniors.id}`).set(coordinator.auth).expect(204);
  });
});
