import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { ClaudeService, type MessagesClient } from '../src/modules/ai/claude.service.js';
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

/** AI help (S-022) with a stand-in for Claude: no real AI calls, no cost. */
describe.skipIf(!hasDb)('AI help (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let manager: Auth;
  let coordinator: Auth;
  const create = vi.fn();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(noThrottle).compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    const claude = app.get(ClaudeService);
    Object.defineProperty(claude, 'enabled', { get: () => true });
    claude.client = { beta: { messages: { create } } } as unknown as MessagesClient;
    agencyId = (await prisma.agency.create({ data: { name: `AI Test ${randomUUID()}`, timezone: 'Europe/London' } })).id;
    manager = await seedUser('registered_manager');
    coordinator = await seedUser('care_coordinator');
  });

  afterAll(async () => {
    await purgeAuditLogs(prisma, agencyId);
    await prisma.document.deleteMany({ where: { agencyId } });
    await prisma.user.deleteMany({ where: { agencyId } });
    await prisma.agency.delete({ where: { id: agencyId } });
    await app.close();
  });

  async function seedUser(roleName: string): Promise<Auth> {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `ai-${randomUUID()}@example.test`;
    await prisma.user.create({
      data: { agencyId, email, passwordHash: await app.get(PasswordService).hash(PASSWORD), passwordChangedAt: new Date(), firstName: 'Casey', lastName: roleName, userRoles: { create: { roleId: role.id } } },
    });
    return { Authorization: `Bearer ${await loginForTests(http(), email, PASSWORD)}` };
  }

  it('drafts a job advert for a manager, with the company name and notes sent', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"text":"Join our caring team..."}' }] });
    const res = await http()
      .post('/api/v1/ai/draft')
      .set(manager)
      .send({ kind: 'job_advert', jobTitle: 'Care Worker', discipline: 'care_worker', location: 'Salford', notes: 'FAKE: £12.60/hr, weekends, driver' })
      .expect(200);
    expect(res.body.data).toEqual({ text: 'Join our caring team...' });
    const params = create.mock.calls.at(-1)![0];
    expect(params.system).toMatch(/job adverts/);
    expect(params.messages[0].content).toMatch(/Company: AI Test .*\nJob title: Care Worker\nJob role: care worker\nLocation: Salford/s);
    expect(params.messages[0].content).toContain('FAKE: £12.60/hr, weekends, driver');
  });

  it('is for admins and managers only', async () => {
    await http().post('/api/v1/ai/draft').set(coordinator).send({ kind: 'job_advert', notes: 'x' }).expect(403);
    await http().post('/api/v1/ai/policy-question').set(coordinator).send({ question: 'x' }).expect(403);
  });

  it('checks its input', async () => {
    await http().post('/api/v1/ai/draft').set(manager).send({ kind: 'rank_candidates', notes: 'x' }).expect(400);
    await http().post('/api/v1/ai/draft').set(manager).send({ kind: 'job_advert', notes: '' }).expect(400);
  });

  it('answers policy questions from uploaded PDF policies only, naming them', async () => {
    const none = await http().post('/api/v1/ai/policy-question').set(manager).send({ question: 'What about lone working?' }).expect(400);
    expect(none.body.error.message).toMatch(/No policies yet/);

    const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% FAKE ${text}\n%%EOF\n`);
    await http().post('/api/v1/documents').set(manager).attach('file', pdf('lone'), 'lone.pdf').field('documentType', 'policy').field('title', 'Lone working (FAKE)').expect(201);
    create.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Ring the office before entering.', citations: [{ type: 'page_location', document_title: 'Lone working (FAKE)' }] }],
    });
    const res = await http().post('/api/v1/ai/policy-question').set(manager).send({ question: 'What if a visit feels unsafe?' }).expect(200);
    expect(res.body.data).toEqual({ answer: 'Ring the office before entering.', sources: ['Lone working (FAKE)'], policiesRead: 1, skipped: [] });
    const content = create.mock.calls.at(-1)![0].messages[0].content;
    expect(content[0]).toMatchObject({ type: 'document', title: 'Lone working (FAKE)', source: { media_type: 'application/pdf' } });
  });
});
