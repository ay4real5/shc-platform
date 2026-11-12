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

describe.skipIf(!hasDb)('Recruitment and careers page (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let otherAgencyId: string;
  const slug = `careers-${randomUUID().slice(0, 8)}`;
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

  it('a recruiter posts jobs; only open, unexpired ones show on the public careers page', async () => {
    const open = await openJob();
    expect(open.publishedAt).toBeTruthy();
    const draft = await openJob({ title: 'Team Leader', status: 'draft' });
    const expired = await openJob({ title: 'Night Carer', closesOn: '2020-01-01' });

    const page = (await http().get(`/api/v1/careers/${slug}`).expect(200)).body.data;
    expect(page.company.name).toMatch(/^Careers Test/);
    const ids = page.jobs.map((j: { id: string }) => j.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(expired.id);
    expect(page.jobs[0]).not.toHaveProperty('applicationCount');

    await http().get(`/api/v1/careers/${slug}/jobs/${open.id}`).expect(200);
    await http().get(`/api/v1/careers/${slug}/jobs/${draft.id}`).expect(404);
    await http().get('/api/v1/careers/no-such-company').expect(404);

    // Publishing a draft sets the published time once.
    const published = (await http().patch(`/api/v1/recruitment/jobs/${draft.id}`).set(recruiter.auth).send({ status: 'open' }).expect(200)).body.data;
    expect(published.publishedAt).toBeTruthy();
  });

  it('someone applies without signing in; recruiters get the application and a notification without personal data', async () => {
    const job = await openJob();
    const res = await http().post(`/api/v1/careers/${slug}/applications`).send(application({ jobPostingId: job.id })).expect(201);
    const reference = res.body.data.reference as string;
    expect(reference).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const list = (await http().get(`/api/v1/recruitment/applications?jobPostingId=${job.id}`).set(recruiter.auth).expect(200)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reference, stage: 'applied', postcode: 'M14 6EF', job: { id: job.id, title: 'Care Worker' } });

    const detail = (await http().get(`/api/v1/recruitment/applications/${list[0].id}`).set(recruiter.auth).expect(200)).body.data;
    expect(detail.history.map((h: { kind: string }) => h.kind)).toEqual(['job', 'job', 'gap']);
    expect(detail.referees).toHaveLength(2);
    expect(detail.history[2].explanation).toBe('Travelling');

    const note = await prisma.notification.findFirstOrThrow({ where: { userId: recruiter.id, type: 'application_received' }, orderBy: { createdAt: 'desc' } });
    expect(`${note.title} ${note.body}`).not.toContain('Robin');
    expect(note.data).toMatchObject({ applicationId: list[0].id });
  });

  it('asks for unexplained gaps, two referees and the declaration', async () => {
    const gappy = application({
      history: [
        { kind: 'job', employer: 'Fake Care Ltd', jobTitle: 'Care worker', startDate: '2022-01-10', endDate: null },
        { kind: 'job', employer: 'Fake Shop', jobTitle: 'Sales assistant', startDate: '2019-03-01', endDate: '2021-06-30' },
      ],
    });
    const gaps = await http().post(`/api/v1/careers/${slug}/applications`).send(gappy).expect(400);
    expect(gaps.body.error).toMatchObject({ code: 'HISTORY_GAPS', details: { gaps: [{ from: '2021-07-01', to: '2022-01-09' }] } });

    await http().post(`/api/v1/careers/${slug}/applications`).send(application({ referees: [application().referees[0]] })).expect(400);
    await http().post(`/api/v1/careers/${slug}/applications`).send(application({ declaration: false })).expect(400);
    await http().post(`/api/v1/careers/${slug}/applications`).send(application({ postcode: '62701' })).expect(400);
  });

  it('quietly drops spam (the hidden field) and refuses closed jobs', async () => {
    const before = await prisma.application.count({ where: { agencyId } });
    await http().post(`/api/v1/careers/${slug}/applications`).send(application({ website: 'http://spam.example' })).expect(201);
    expect(await prisma.application.count({ where: { agencyId } })).toBe(before);

    const closed = await openJob({ status: 'closed' });
    await http().post(`/api/v1/careers/${slug}/applications`).send(application({ jobPostingId: closed.id })).expect(400);
  });

  it('keeps applications to the company and to people who may recruit', async () => {
    await http().get('/api/v1/recruitment/applications').set(teamLeader.auth).expect(403);
    await http().post('/api/v1/recruitment/jobs').set(teamLeader.auth).send({}).expect(403);
    const mine = (await http().get('/api/v1/recruitment/applications').set(recruiter.auth).expect(200)).body.data;
    expect(mine.length).toBeGreaterThan(0);
    await http().get(`/api/v1/recruitment/applications/${mine[0].id}`).set(outsider.auth).expect(404);
    expect((await http().get('/api/v1/recruitment/applications').set(outsider.auth).expect(200)).body.data).toEqual([]);
  });


  // ---------- pipeline (S1-05) ----------

  /** Applies through the public form and returns the new application's id. */
  async function applied(overrides: Record<string, unknown> = {}) {
    const job = await openJob();
    const res = await http().post(`/api/v1/careers/${slug}/applications`).send(application({ jobPostingId: job.id, ...overrides })).expect(201);
    return (await prisma.application.findUniqueOrThrow({ where: { reference: res.body.data.reference } })).id;
  }

  it('moves an application through stages with notes, keeps a timeline, and can reopen a rejection', async () => {
    const id = await applied();
    const move = (stage: string, extra: Record<string, unknown> = {}) =>
      http().post(`/api/v1/recruitment/applications/${id}/stage`).set(recruiter.auth).send({ stage, ...extra });

    await move('screened', { note: 'Good phone screen' }).expect(201);
    await http().post(`/api/v1/recruitment/applications/${id}/notes`).set(recruiter.auth).send({ text: 'Prefers mornings' }).expect(201);
    await move('screened').expect(409); // already there
    await move('hired').expect(400); // only the hire action does that
    const rejected = (await move('rejected', { notifyApplicant: true }).expect(201)).body.data;
    expect(rejected.emailSent).toBe(false); // no email provider in tests: recorded, not sent
    await move('screened').expect(201); // reopened

    const timeline = (await http().get(`/api/v1/recruitment/applications/${id}/timeline`).set(recruiter.auth).expect(200)).body.data;
    const kinds = timeline.events.map((e: { kind: string; toStage: string | null; text: string | null }) => `${e.kind}:${e.toStage ?? e.text}`);
    expect(kinds).toEqual([
      'stage:screened',
      expect.stringMatching(/^email:Not sent .*Your application to/),
      'stage:rejected',
      'note:Prefers mornings',
      'stage:screened',
    ]);
    expect(timeline.events[0].actor.name).toMatch(/^Casey /);
    await http().post(`/api/v1/recruitment/applications/${id}/stage`).set(teamLeader.auth).send({ stage: 'offer' }).expect(403);
  });

  it('books and scores an interview; booking moves the application to the interview stage', async () => {
    const id = await applied();
    const booked = (
      await http()
        .post(`/api/v1/recruitment/applications/${id}/interviews`)
        .set(recruiter.auth)
        .send({ startsAt: '2030-01-15T10:00:00Z', mode: 'in_person', location: '1 Demo Street', interviewerId: coordinator.id, notifyApplicant: true })
        .expect(201)
    ).body.data;
    expect(booked).toMatchObject({ status: 'scheduled', durationMinutes: 30, interviewer: { id: coordinator.id }, emailSent: false });
    expect((await prisma.application.findUniqueOrThrow({ where: { id } })).stage).toBe('interview');

    const scored = (await http().patch(`/api/v1/recruitment/interviews/${booked.id}`).set(recruiter.auth).send({ status: 'completed', score: 4, outcome: 'pass', notes: 'Warm and patient' }).expect(200)).body.data;
    expect(scored).toMatchObject({ status: 'completed', score: 4, outcome: 'pass' });
    await http().patch(`/api/v1/recruitment/interviews/${booked.id}`).set(recruiter.auth).send({ score: 9 }).expect(400);
    await http().patch(`/api/v1/recruitment/interviews/${booked.id}`).set(outsider.auth).send({ score: 3 }).expect(404);
    await http()
      .post(`/api/v1/recruitment/applications/${id}/interviews`)
      .set(recruiter.auth)
      .send({ startsAt: '2030-01-16T10:00:00Z', mode: 'video', interviewerId: outsider.id })
      .expect(400); // interviewer from another company
  });

  it('hiring creates the login and staff record once; recruiters cannot hire and nobody hands out more access than they have', async () => {
    const id = await applied();
    await http().post(`/api/v1/recruitment/applications/${id}/stage`).set(recruiter.auth).send({ stage: 'offer' }).expect(201);
    await http().post(`/api/v1/recruitment/applications/${id}/hire`).set(recruiter.auth).send({}).expect(403); // no staff:create
    await http().post(`/api/v1/recruitment/applications/${id}/hire`).set(coordinator.auth).send({ discipline: 'manager' }).expect(403); // registered manager role

    const hired = (await http().post(`/api/v1/recruitment/applications/${id}/hire`).set(coordinator.auth).send({ startDate: '2030-02-01', hourlyRate: 12.6 }).expect(201)).body.data;
    expect(hired.welcomeEmailSent).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: hired.userId }, include: { userRoles: { include: { role: true } }, staffProfile: true } });
    expect(user).toMatchObject({ agencyId, firstName: 'Robin', isActive: true });
    expect(user.userRoles.map((r) => r.role.name)).toEqual(['care_worker']);
    expect(user.staffProfile).toMatchObject({ id: hired.staffProfileId, discipline: 'care_worker', employmentType: 'part_time', postcode: 'M14 6EF', canDrive: true });
    expect((await prisma.application.findUniqueOrThrow({ where: { id } })).hiredUserId).toBe(hired.userId);

    // Their onboarding checklist exists straight away.
    const onboarding = (await http().get(`/api/v1/staff/${hired.staffProfileId}/onboarding`).set(coordinator.auth).expect(200)).body.data;
    expect(onboarding.percent).toBeLessThan(100);

    await http().post(`/api/v1/recruitment/applications/${id}/hire`).set(coordinator.auth).send({}).expect(409);
    await http().post(`/api/v1/recruitment/applications/${id}/stage`).set(recruiter.auth).send({ stage: 'rejected' }).expect(409);

    // Same email applying again can't be hired twice into two logins.
    const again = await applied({ email: user.email });
    await http().post(`/api/v1/recruitment/applications/${again}/hire`).set(coordinator.auth).send({}).expect(409);
  });
});
