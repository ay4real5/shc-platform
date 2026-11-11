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
  increment: async () => ({
    totalHits: 1,
    timeToExpire: 60,
    isBlocked: false,
    timeToBlockExpire: 0,
  }),
};
type Auth = { Authorization: string };

/** A tiny FAKE PDF. */
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);

describe.skipIf(!hasDb)('Documents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let otherAgencyId: string;
  let staffId: string;
  let outsider: Auth;
  let office: Auth;
  let admin: Auth;
  let rn: Auth;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue(noThrottle)
      .compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (
      await prisma.agency.create({ data: { name: `Docs Test ${randomUUID()}`, timezone: 'UTC' } })
    ).id;
    otherAgencyId = (await prisma.agency.create({ data: { name: `Docs Other ${randomUUID()}`, timezone: 'UTC' } })).id;
    office = await seedUser('care_coordinator');
    admin = await seedUser('agency_admin');
    outsider = await seedUser('agency_admin', otherAgencyId);
    // A nurse with a staff file, who can sign documents.
    const role = await prisma.role.findFirstOrThrow({
      where: { agencyId: null, name: 'senior_care_worker' },
    });
    const email = `docs-rn-${randomUUID()}@example.test`;
    const nurse = await prisma.user.create({
      data: {
        agencyId,
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        passwordChangedAt: new Date(),
        firstName: 'Rita',
        lastName: 'Nurse',
        userRoles: { create: { roleId: role.id } },
        staffProfile: { create: { agencyId, discipline: 'nurse' } },
      },
      include: { staffProfile: true },
    });
    staffId = nurse.staffProfile!.id;
    rn = { Authorization: `Bearer ${await loginForTests(http(), email, PASSWORD)}` };
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { agencyId } });
    await prisma.document.updateMany({ where: { agencyId }, data: { previousVersionId: null } });
    await prisma.document.deleteMany({ where: { agencyId } }); // blobs cascade
    for (const id of [agencyId, otherAgencyId]) {
      await purgeAuditLogs(prisma, id);
      await prisma.user.deleteMany({ where: { agencyId: id } });
      await prisma.agency.delete({ where: { id } });
    }
    await app.close();
  });

  async function seedUser(roleName: string, inAgency = agencyId): Promise<Auth> {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `docs-${randomUUID()}@example.test`;
    await prisma.user.create({
      data: {
        agencyId: inAgency,
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        passwordChangedAt: new Date(),
        firstName: 'Doc',
        lastName: roleName,
        userRoles: { create: { roleId: role.id } },
      },
    });
    return { Authorization: `Bearer ${await loginForTests(http(), email, PASSWORD)}` };
  }

  const upload = (who: Auth, file: Buffer, name: string, fields: Record<string, string>) => {
    let req = http().post('/api/v1/documents').set(who).attach('file', file, name);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req;
  };

  it('uploads, stores encrypted, and downloads the exact file', async () => {
    const content = pdf('signed consent');
    const res = await upload(office, content, 'Consent Form.pdf', {
      documentType: 'contract',
      title: 'Employment contract',
      staffId,
    }).expect(201);
    const doc = res.body.data;
    expect(doc).toMatchObject({
      fileName: 'Consent Form.pdf',
      mimeType: 'application/pdf',
      version: 1,
      isSigned: false,
      staffId,
    });

    const blob = await prisma.documentBlob.findUniqueOrThrow({ where: { documentId: doc.id } });
    expect(Buffer.from(blob.content).includes(Buffer.from('%PDF'))).toBe(false); // encrypted at rest

    const dl = await http()
      .get(`/api/v1/documents/${doc.id}/download`)
      .set(office)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(dl.body as Buffer, content)).toBe(0);
    expect(dl.headers['content-disposition']).toBe('attachment; filename="Consent Form.pdf"');
    expect(
      await prisma.auditLog.count({ where: { action: 'DOWNLOAD_DOCUMENT', resourceId: doc.id } }),
    ).toBe(1);
  });

  it('refuses files that are not what they claim, missing, or too big', async () => {
    await upload(office, Buffer.from('MZ\x90\x00this is an exe'), 'invoice.pdf', {
      documentType: 'other',
      title: 'x',
    }).expect(415);
    await http()
      .post('/api/v1/documents')
      .set(office)
      .field('documentType', 'other')
      .field('title', 'x')
      .expect(400);
    await upload(office, Buffer.concat([pdf('big'), Buffer.alloc(10 * 1024 * 1024)]), 'big.pdf', {
      documentType: 'other',
      title: 'x',
    }).expect(413);
    await upload(office, pdf('x'), 'x.pdf', { documentType: 'tax_return', title: 'x' }).expect(400);
  });

  it('keeps documents inside the company', async () => {
    const doc = (await upload(office, pdf('handbook'), 'handbook.pdf', { documentType: 'policy', title: 'Staff handbook' }).expect(201)).body.data;
    await http().get(`/api/v1/documents/${doc.id}/download`).set(rn).expect(200);
    await http().get(`/api/v1/documents/${doc.id}`).set(outsider).expect(404);
    const all = await http().get('/api/v1/documents').set(outsider).expect(200);
    expect(all.body.data.map((d: { id: string }) => d.id)).not.toContain(doc.id);
    await upload(office, pdf('x'), 'x.pdf', { documentType: 'other', title: 'x', staffId: randomUUID() }).expect(400);
  });

  it('versions: a new upload replaces the old one, history kept, no forks', async () => {
    const v1 = (
      await upload(office, pdf('v1'), 'orders.pdf', {
        documentType: 'reference',
        title: 'Reference',
        staffId,
      }).expect(201)
    ).body.data;
    const v2 = (
      await upload(office, pdf('v2'), 'orders-2.pdf', {
        documentType: 'other',
        title: 'Orders (signed copy)',
        replacesDocumentId: v1.id,
      }).expect(201)
    ).body.data;
    expect(v2).toMatchObject({
      version: 2,
      previousVersionId: v1.id,
      documentType: 'reference',
      staffId,
    });
    await upload(office, pdf('fork'), 'fork.pdf', {
      documentType: 'other',
      title: 'fork',
      replacesDocumentId: v1.id,
    }).expect(409);

    const list = (
      await http()
        .get(`/api/v1/documents?staffId=${staffId}&documentType=reference`)
        .set(office)
        .expect(200)
    ).body.data;
    expect(list.map((d: { id: string }) => d.id)).toEqual([v2.id]);
    const history = (
      await http().get(`/api/v1/documents/${v1.id}/versions`).set(office).expect(200)
    ).body.data;
    expect(
      history.map((d: { version: number; superseded: boolean }) => [d.version, d.superseded]),
    ).toEqual([
      [2, false],
      [1, true],
    ]);
  });

  it('e-signature records who, when and the file hash; tampering is caught', async () => {
    const doc = (
      await upload(office, pdf('to sign'), 'sign-me.pdf', {
        documentType: 'contract',
        title: 'Contract',
        staffId,
      }).expect(201)
    ).body.data;
    await http()
      .post(`/api/v1/documents/${doc.id}/sign`)
      .set(office)
      .send({ typedName: 'Office' })
      .expect(403); // no documents:sign
    const signed = (
      await http()
        .post(`/api/v1/documents/${doc.id}/sign`)
        .set(rn)
        .send({ typedName: 'Rita Nurse, RN' })
        .expect(200)
    ).body.data;
    expect(signed).toMatchObject({ isSigned: true, signature: { name: 'Rita Nurse, RN' } });
    await http()
      .post(`/api/v1/documents/${doc.id}/sign`)
      .set(rn)
      .send({ typedName: 'Again' })
      .expect(409);
    const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect((stored.signatureData as { contentHash: string }).contentHash).toBe(stored.contentHash);

    // If the stored file no longer matches what was uploaded, it is not served.
    await prisma.document.update({ where: { id: doc.id }, data: { contentHash: 'f'.repeat(64) } });
    await http().get(`/api/v1/documents/${doc.id}/download`).set(office).expect(409);
  });

  it('deleting is soft, needs a reason and documents:delete', async () => {
    const doc = (
      await upload(office, pdf('old'), 'old.pdf', {
        documentType: 'other',
        title: 'Old letter',
        staffId,
      }).expect(201)
    ).body.data;
    await http()
      .delete(`/api/v1/documents/${doc.id}`)
      .set(office)
      .send({ reason: 'dup' })
      .expect(403);
    await http().delete(`/api/v1/documents/${doc.id}`).set(admin).send({ reason: '' }).expect(400);
    await http()
      .delete(`/api/v1/documents/${doc.id}`)
      .set(admin)
      .send({ reason: 'Duplicate upload' })
      .expect(204);
    const list = (
      await http().get(`/api/v1/documents?staffId=${staffId}`).set(office).expect(200)
    ).body.data;
    expect(list.map((d: { id: string }) => d.id)).not.toContain(doc.id);
    const withDeleted = (
      await http()
        .get(`/api/v1/documents?staffId=${staffId}&includeDeleted=true`)
        .set(office)
        .expect(200)
    ).body.data;
    expect(withDeleted.find((d: { id: string }) => d.id === doc.id)).toMatchObject({
      deleted: true,
    });
    await http().get(`/api/v1/documents/${doc.id}/download`).set(office).expect(404);
  });
});
