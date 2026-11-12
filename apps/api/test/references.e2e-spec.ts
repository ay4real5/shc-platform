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

/** A complete, valid application (FAKE data). */
function application(overrides: Record<string, unknown> = {}) {
  const today = utcTodayString();
  return {
    firstName: 'Robin',
    lastName: 'Applicant',
    email: `robin.${randomUUID().slice(0, 8)}@example.test`,
    phone: '07700 900123',
    postcode: 'm14 6ef',
    rightToWork: 'british_or_irish',
    canDrive: true,
    history: [
      { kind: 'job', employer: 'Fake Care Ltd', jobTitle: 'Care worker', startDate: '2022-01-10', endDate: null, wasCareRole: true },
      { kind: 'job', employer: 'Fake Shop', jobTitle: 'Sales assistant', startDate: '2019-03-01', endDate: '2021-12-31', reasonForLeaving: 'Moved into care' },
      { kind: 'gap', startDate: '2018-09-01', endDate: '2019-02-28', explanation: 'Travelling' },
    ],
    referees: [
      { name: 'Ref One', relationship: 'Line manager at Fake Care Ltd', email: 'ref.one@example.test' },
      { name: 'Ref Two', relationship: 'Manager at Fake Shop', email: 'ref.two@example.test', contactBeforeOffer: true },
    ],
    declaration: true,
    earliestStart: addDays(today, 14),
    ...overrides,
  };
}

describe.skipIf(!hasDb)('References (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let otherAgencyId: string;
  const slug = `refs-${randomUUID().slice(0, 8)}`;
  let recruiter: { id: string; auth: Auth };
  let coordinator: { id: string; auth: Auth };
  let teamLeader: { id: string; auth: Auth };
  let outsider: { id: string; auth: Auth };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue(noThrottle)
      .compile();
    app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `Careers Test ${randomUUID()}`, careersSlug: slug, town: 'Manchester' } })).id;
    otherAgencyId = (await prisma.agency.create({ data: { name: `Careers Other ${randomUUID()}` } })).id;
    recruiter = await seedUser('recruiter');
    teamLeader = await seedUser('team_leader');
    outsider = await seedUser('recruiter', otherAgencyId);
    coordinator = await seedUser('care_coordinator');
  });

  afterAll(async () => {
    for (const id of [agencyId, otherAgencyId]) {
      await prisma.application.deleteMany({ where: { agencyId: id } });
      await prisma.jobPosting.deleteMany({ where: { agencyId: id } });
      await prisma.notification.deleteMany({ where: { agencyId: id } });
      await purgeAuditLogs(prisma, id);
      await prisma.user.deleteMany({ where: { agencyId: id } });
      await prisma.agency.delete({ where: { id } });
    }
    await app.close();
  });

  async function seedUser(roleName: string, inAgency = agencyId) {
    const role = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: roleName } });
    const email = `r-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        agencyId: inAgency,
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        passwordChangedAt: new Date(),
        firstName: 'Casey',
        lastName: roleName,
        userRoles: { create: { roleId: role.id } },
      },
    });
    const accessToken = await loginForTests(http(), email, PASSWORD);
    return { id: user.id, auth: { Authorization: `Bearer ${accessToken}` } };
  }

  async function openJob(overrides: Record<string, unknown> = {}) {
    const res = await http()
      .post('/api/v1/recruitment/jobs')
      .set(recruiter.auth)
      .send({
        title: 'Care Worker',
        discipline: 'care_worker',
        employmentType: 'part_time',
        location: 'Manchester (M14)',
        payFrom: 12.6,
        payTo: 13.5,
        hours: '20 to 37.5 hours a week',
        description: 'Supporting people to live well at home.\n\nFull training given.',
        status: 'open',
        ...overrides,
      })
      .expect(201);
    return res.body.data as { id: string; status: string; publishedAt: string | null };
  }

  /** Applies (FAKE data) and returns the application with its referees. Referee 1 may be contacted before an offer. */
  async function applied() {
    const job = await openJob();
    const res = await http().post(`/api/v1/careers/${slug}/applications`).send(application({ jobPostingId: job.id })).expect(201);
    return prisma.application.findUniqueOrThrow({ where: { reference: res.body.data.reference }, include: { referees: { orderBy: { position: 'asc' } } } });
  }
  const tokenOf = (link: string) => link.split('#token=')[1]!;
  const goodAnswers = {
    refereeName: 'Ref Two',
    refereeJobTitle: 'Store manager',
    organisation: 'Fake Shop',
    employedFrom: '2019-03-01',
    employedTo: '2021-12-31',
    candidateJobTitle: 'Sales assistant',
    reasonForLeaving: 'Moved into care',
    reliability: 5,
    attitude: 4,
    disciplinary: 'no',
    safeguardingConcerns: 'no',
    wouldReemploy: 'yes',
    suitableForCare: 'yes',
    declaration: true,
  };

  it('respects "not before an offer", sends a one-time link, and the referee answers without signing in', async () => {
    const app = await applied();
    const [ref1, ref2] = app.referees;
    // Referee 1 asked not to be contacted before an offer.
    await http().post(`/api/v1/recruitment/applications/${app.id}/references`).set(recruiter.auth).send({}).expect(409);

    const sent = (await http().post(`/api/v1/recruitment/applications/${app.id}/references`).set(recruiter.auth).send({ refereeIds: [ref2!.id] }).expect(201)).body.data;
    expect(sent.links).toHaveLength(1); // email isn't set up in tests, so the office gets the link
    const token = tokenOf(sent.links[0].link);
    expect(await prisma.referenceRequest.count({ where: { tokenHash: token } })).toBe(0); // only the hash is stored

    const seen = (await http().post('/api/v1/references/view').send({ token }).expect(200)).body.data;
    expect(seen).toEqual({ candidateName: 'Robin Applicant', company: expect.stringMatching(/^Careers Test/), refereeName: 'Ref Two', status: 'sent' });
    await http().post('/api/v1/references/respond').send({ ...goodAnswers, token, disciplinary: 'yes' }).expect(400); // a "yes" needs details
    await http().post('/api/v1/references/respond').send({ ...goodAnswers, token }).expect(201);
    await http().post('/api/v1/references/respond').send({ ...goodAnswers, token }).expect(410); // once only

    const list = (await http().get(`/api/v1/recruitment/applications/${app.id}/references`).set(recruiter.auth).expect(200)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'received', flagged: false, referee: { id: ref2!.id }, answers: { reliability: 5, suitableForCare: 'yes' } });

    const verified = (await http().post(`/api/v1/recruitment/references/${list[0].id}/verify`).set(recruiter.auth).send({ note: 'Phoned the shop and spoke to the referee' }).expect(201)).body.data;
    expect(verified.verified).toMatchObject({ by: { id: recruiter.id }, note: 'Phoned the shop and spoke to the referee' });

    // At offer stage referee 1 can be asked too.
    await http().post(`/api/v1/recruitment/applications/${app.id}/stage`).set(recruiter.auth).send({ stage: 'offer' }).expect(201);
    await http().post(`/api/v1/recruitment/applications/${app.id}/references`).set(recruiter.auth).send({ refereeIds: [ref1!.id] }).expect(201);
  });

  it('flags concerns, lets a referee decline, and old or resent links stop working', async () => {
    const app = await applied();
    const ref2 = app.referees[1]!;
    const first = tokenOf((await http().post(`/api/v1/recruitment/applications/${app.id}/references`).set(recruiter.auth).send({ refereeIds: [ref2.id] }).expect(201)).body.data.links[0].link);
    const second = tokenOf((await http().post(`/api/v1/recruitment/applications/${app.id}/references`).set(recruiter.auth).send({ refereeIds: [ref2.id] }).expect(201)).body.data.links[0].link);
    await http().post('/api/v1/references/view').send({ token: first }).expect(404); // replaced by the newer link
    await http()
      .post('/api/v1/references/respond')
      .send({ ...goodAnswers, token: second, safeguardingConcerns: 'yes', concernDetails: 'FAKE: a concern was raised in 2021', wouldReemploy: 'no' })
      .expect(201);
    const list = (await http().get(`/api/v1/recruitment/applications/${app.id}/references`).set(recruiter.auth).expect(200)).body.data;
    expect(list.find((r: { status: string }) => r.status === 'received').flagged).toBe(true);

    // Declining.
    const app2 = await applied();
    const token = tokenOf((await http().post(`/api/v1/recruitment/applications/${app2.id}/references`).set(recruiter.auth).send({ refereeIds: [app2.referees[1]!.id] }).expect(201)).body.data.links[0].link);
    await http().post('/api/v1/references/respond').send({ token, declined: true }).expect(201);
    expect((await prisma.referenceRequest.findFirstOrThrow({ where: { applicationId: app2.id } })).status).toBe('declined');

    // Expired links.
    const app3 = await applied();
    const expired = tokenOf((await http().post(`/api/v1/recruitment/applications/${app3.id}/references`).set(recruiter.auth).send({ refereeIds: [app3.referees[1]!.id] }).expect(201)).body.data.links[0].link);
    await prisma.referenceRequest.updateMany({ where: { applicationId: app3.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await http().post('/api/v1/references/view').send({ token: expired }).expect(410);
    await http().post('/api/v1/references/view').send({ token: 'nonsense' }).expect(400);

    // Other companies and non-recruiters can't see or send.
    await http().get(`/api/v1/recruitment/applications/${app.id}/references`).set(outsider.auth).expect(404);
    await http().post(`/api/v1/recruitment/applications/${app.id}/references`).set(teamLeader.auth).send({}).expect(403);
  });
});
