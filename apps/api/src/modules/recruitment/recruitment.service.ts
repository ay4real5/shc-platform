import { randomInt } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { findHistoryGaps } from '@alora/shared';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Paginated } from '../../common/dto/pagination.dto.js';
import { fromDate, toDate } from '../../common/utils/dates.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type {
  ApplyDto,
  CreateJobDto,
  ListApplicationsQueryDto,
  ListJobsQueryDto,
  UpdateJobDto,
} from './dto/recruitment.dto.js';

/** A job advert as the office sees it. */
export interface JobView {
  id: string;
  title: string;
  discipline: string;
  employmentType: string;
  location: string;
  payFrom: string | null;
  payTo: string | null;
  payPeriod: string;
  hours: string | null;
  summary: string | null;
  description: string;
  status: string;
  closesOn: string | null;
  publishedAt: Date | null;
  applicationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** What the public careers page shows: no internal fields. */
export type PublicJobView = Omit<JobView, 'status' | 'publishedAt' | 'applicationCount' | 'createdAt' | 'updatedAt'>;

export interface ApplicationSummary {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  postcode: string;
  stage: string;
  stageChangedAt: Date;
  job: { id: string; title: string } | null;
  createdAt: Date;
}

export interface ApplicationDetail extends ApplicationSummary {
  addressLine1: string | null;
  town: string | null;
  rightToWork: string;
  canDrive: boolean;
  earliestStart: string | null;
  availability: string | null;
  coverNote: string | null;
  source: string | null;
  declarationAcceptedAt: Date;
  history: {
    kind: string;
    employer: string | null;
    jobTitle: string | null;
    startDate: string;
    endDate: string | null;
    reasonForLeaving: string | null;
    wasCareRole: boolean;
    explanation: string | null;
  }[];
  referees: {
    name: string;
    organisation: string | null;
    relationship: string;
    email: string;
    phone: string | null;
    contactBeforeOffer: boolean;
  }[];
}

const JOB_INCLUDE = { _count: { select: { applications: true } } } satisfies Prisma.JobPostingInclude;
type JobRow = Prisma.JobPostingGetPayload<{ include: typeof JOB_INCLUDE }>;
const APPLICATION_INCLUDE = { jobPosting: { select: { id: true, title: true } } } satisfies Prisma.ApplicationInclude;
type ApplicationRow = Prisma.ApplicationGetPayload<{ include: typeof APPLICATION_INCLUDE }>;

/** No 0/O/1/I/L: easy to read out on the phone. */
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Job adverts, the public careers page and applications (S1-04). Office routes are scoped to the caller's company;
 * public routes find the company by its careers slug and only ever show open adverts.
 */
@Injectable()
export class RecruitmentService {
  private readonly logger = new Logger(RecruitmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AgencyClockService,
    private readonly notifications: NotificationsService,
    private readonly compliance: ComplianceService,
  ) {}

  // ---------- office: jobs ----------

  async listJobs(caller: AuthUser, query: ListJobsQueryDto): Promise<Paginated<JobView>> {
    const where: Prisma.JobPostingWhereInput = { agencyId: caller.agencyId, ...(query.status ? { status: query.status } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.jobPosting.findMany({ where, include: JOB_INCLUDE, orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], skip: query.skip, take: query.limit }),
      this.prisma.jobPosting.count({ where }),
    ]);
    return Paginated.of(rows.map(toJob), total, query);
  }

  async getJob(caller: AuthUser, id: string): Promise<JobView> {
    return toJob(await this.findJob(caller, id));
  }

  async createJob(caller: AuthUser, dto: CreateJobDto): Promise<JobView> {
    checkPay(dto.payFrom, dto.payTo);
    const status = dto.status ?? 'draft';
    const row = await this.prisma.jobPosting.create({
      data: {
        ...jobFields(dto),
        title: dto.title,
        discipline: dto.discipline,
        location: dto.location,
        description: dto.description,
        status,
        publishedAt: status === 'open' ? new Date() : null,
        agencyId: caller.agencyId,
        createdById: caller.userId,
      },
      include: JOB_INCLUDE,
    });
    return toJob(row);
  }

  async updateJob(caller: AuthUser, id: string, dto: UpdateJobDto): Promise<JobView> {
    const current = await this.findJob(caller, id);
    checkPay(dto.payFrom ?? numberOrUndefined(current.payFrom), dto.payTo ?? numberOrUndefined(current.payTo));
    const firstOpen = dto.status === 'open' && !current.publishedAt;
    const row = await this.prisma.jobPosting.update({
      where: { id },
      data: {
        ...jobFields(dto),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.discipline !== undefined ? { discipline: dto.discipline } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(firstOpen ? { publishedAt: new Date() } : {}),
      },
      include: JOB_INCLUDE,
    });
    return toJob(row);
  }

  // ---------- office: applications ----------

  async listApplications(caller: AuthUser, query: ListApplicationsQueryDto): Promise<Paginated<ApplicationSummary>> {
    const search = query.search?.trim();
    const where: Prisma.ApplicationWhereInput = {
      agencyId: caller.agencyId,
      ...(query.jobPostingId ? { jobPostingId: query.jobPostingId } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(search
        ? {
            OR: [
              { reference: { equals: search.toUpperCase() } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({ where, include: APPLICATION_INCLUDE, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.limit }),
      this.prisma.application.count({ where }),
    ]);
    return Paginated.of(rows.map(toApplicationSummary), total, query);
  }

  async getApplication(caller: AuthUser, id: string): Promise<ApplicationDetail> {
    const row = await this.prisma.application.findFirst({
      where: { id, agencyId: caller.agencyId },
      include: { ...APPLICATION_INCLUDE, history: { orderBy: { position: 'asc' } }, referees: { orderBy: { position: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Application not found');
    return {
      ...toApplicationSummary(row),
      addressLine1: row.addressLine1,
      town: row.town,
      rightToWork: row.rightToWork,
      canDrive: row.canDrive,
      earliestStart: fromDate(row.earliestStart),
      availability: row.availability,
      coverNote: row.coverNote,
      source: row.source,
      declarationAcceptedAt: row.declarationAcceptedAt,
      history: row.history.map((h) => ({
        kind: h.kind,
        employer: h.employer,
        jobTitle: h.jobTitle,
        startDate: fromDate(h.startDate)!,
        endDate: fromDate(h.endDate),
        reasonForLeaving: h.reasonForLeaving,
        wasCareRole: h.wasCareRole,
        explanation: h.explanation,
      })),
      referees: row.referees.map((r) => ({
        name: r.name,
        organisation: r.organisation,
        relationship: r.relationship,
        email: r.email,
        phone: r.phone,
        contactBeforeOffer: r.contactBeforeOffer,
      })),
    };
  }

  // ---------- public careers page ----------

  async careersPage(slug: string): Promise<{ company: { name: string; town: string | null }; jobs: PublicJobView[] }> {
    const agency = await this.findCareersAgency(slug);
    const today = await this.clock.today(agency.id);
    const rows = await this.prisma.jobPosting.findMany({
      where: { agencyId: agency.id, ...openOn(today) },
      include: JOB_INCLUDE,
      orderBy: { publishedAt: 'desc' },
      take: 200,
    });
    return { company: { name: agency.name, town: agency.town }, jobs: rows.map(toPublicJob) };
  }

  async publicJob(slug: string, jobId: string): Promise<{ company: { name: string }; job: PublicJobView }> {
    const agency = await this.findCareersAgency(slug);
    const today = await this.clock.today(agency.id);
    const row = await this.prisma.jobPosting.findFirst({ where: { id: jobId, agencyId: agency.id, ...openOn(today) }, include: JOB_INCLUDE });
    if (!row) throw new NotFoundException('This job is no longer open');
    return { company: { name: agency.name }, job: toPublicJob(row) };
  }

  async apply(slug: string, dto: ApplyDto): Promise<{ reference: string }> {
    const agency = await this.findCareersAgency(slug);
    // Spam trap: pretend it worked, keep nothing.
    if (dto.website?.trim()) return { reference: newReference() };

    const today = await this.clock.today(agency.id);
    let job: { id: string; title: string } | null = null;
    if (dto.jobPostingId) {
      job = await this.prisma.jobPosting.findFirst({ where: { id: dto.jobPostingId, agencyId: agency.id, ...openOn(today) }, select: { id: true, title: true } });
      if (!job) throw new BadRequestException('This job is no longer open');
    }

    const todayText = fromDate(today)!;
    for (const h of dto.history) {
      if (h.endDate && h.endDate < h.startDate) throw new BadRequestException('An end date is before its start date');
    }
    const gaps = findHistoryGaps(
      dto.history.map((h) => ({ kind: h.kind, startDate: h.startDate, endDate: h.endDate ?? null })),
      todayText,
    );
    if (gaps.length) {
      throw new BadRequestException({
        code: 'HISTORY_GAPS',
        message: 'Please explain the gaps in your employment history',
        details: { gaps },
      });
    }

    const reference = newReference();
    const created = await this.prisma.application.create({
      data: {
        agencyId: agency.id,
        jobPostingId: job?.id ?? null,
        reference,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        addressLine1: dto.addressLine1 ?? null,
        town: dto.town ?? null,
        postcode: dto.postcode,
        rightToWork: dto.rightToWork,
        canDrive: dto.canDrive ?? false,
        earliestStart: toDate(dto.earliestStart) ?? null,
        availability: dto.availability ?? null,
        coverNote: dto.coverNote ?? null,
        source: 'careers_page',
        declarationAcceptedAt: new Date(),
        history: {
          create: dto.history.map((h, position) => ({
            position,
            kind: h.kind,
            employer: h.kind === 'job' ? (h.employer ?? null) : null,
            jobTitle: h.kind === 'job' ? (h.jobTitle ?? null) : null,
            startDate: toDate(h.startDate)!,
            endDate: toDate(h.endDate ?? undefined) ?? null,
            reasonForLeaving: h.kind === 'job' ? (h.reasonForLeaving ?? null) : null,
            wasCareRole: h.kind === 'job' ? (h.wasCareRole ?? false) : false,
            explanation: h.kind === 'gap' ? (h.explanation ?? null) : null,
          })),
        },
        referees: {
          create: dto.referees.map((r, position) => ({
            position,
            name: r.name,
            organisation: r.organisation ?? null,
            relationship: r.relationship,
            email: r.email,
            phone: r.phone ?? null,
            contactBeforeOffer: r.contactBeforeOffer ?? false,
          })),
        },
      },
      select: { id: true },
    });

    // Tell the recruiters. Job title only: no applicant details in notifications.
    try {
      const recruiters = await this.compliance.usersWithPermission(agency.id, 'recruitment', 'manage');
      await this.notifications.notify({
        agencyId: agency.id,
        userIds: recruiters,
        type: 'application_received',
        title: 'New job application',
        body: job ? `For ${job.title}.` : 'A general application.',
        data: { applicationId: created.id },
      });
    } catch (error) {
      // The application is saved; a failed alert must not make the applicant think it wasn't.
      this.logger.error(`Could not notify recruiters of application ${created.id}: ${(error as Error).name}`);
    }
    return { reference };
  }

  // ---------- helpers ----------

  private async findJob(caller: AuthUser, id: string): Promise<JobRow> {
    const row = await this.prisma.jobPosting.findFirst({ where: { id, agencyId: caller.agencyId }, include: JOB_INCLUDE });
    if (!row) throw new NotFoundException('Job not found');
    return row;
  }

  private async findCareersAgency(slug: string) {
    const agency = await this.prisma.agency.findFirst({
      where: { careersSlug: slug.toLowerCase(), isActive: true },
      select: { id: true, name: true, town: true },
    });
    if (!agency) throw new NotFoundException('Careers page not found');
    return agency;
  }
}

/** Open, and not past its closing date (company's today). */
function openOn(today: Date): Prisma.JobPostingWhereInput {
  return { status: 'open', OR: [{ closesOn: null }, { closesOn: { gte: today } }] };
}

type JobFields = Partial<Pick<Prisma.JobPostingUncheckedCreateInput, 'employmentType' | 'payFrom' | 'payTo' | 'payPeriod' | 'hours' | 'summary' | 'closesOn'>>;

function jobFields(dto: UpdateJobDto): JobFields {
  const data: JobFields = {};
  if (dto.employmentType !== undefined) data.employmentType = dto.employmentType;
  if (dto.payFrom !== undefined) data.payFrom = dto.payFrom;
  if (dto.payTo !== undefined) data.payTo = dto.payTo;
  if (dto.payPeriod !== undefined) data.payPeriod = dto.payPeriod;
  if (dto.hours !== undefined) data.hours = dto.hours || null;
  if (dto.summary !== undefined) data.summary = dto.summary || null;
  if (dto.closesOn !== undefined) data.closesOn = dto.closesOn === null ? null : toDate(dto.closesOn);
  return data;
}

function checkPay(from?: number, to?: number): void {
  if (from !== undefined && to !== undefined && to < from) throw new BadRequestException('Pay "to" cannot be less than pay "from"');
}

function numberOrUndefined(value: Prisma.Decimal | null): number | undefined {
  return value === null ? undefined : Number(value);
}

function newReference(): string {
  const pick = () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  const part = () => Array.from({ length: 4 }, pick).join('');
  return `${part()}-${part()}`;
}

function toJob(row: JobRow): JobView {
  return {
    id: row.id,
    title: row.title,
    discipline: row.discipline,
    employmentType: row.employmentType,
    location: row.location,
    payFrom: row.payFrom?.toFixed(2) ?? null,
    payTo: row.payTo?.toFixed(2) ?? null,
    payPeriod: row.payPeriod,
    hours: row.hours,
    summary: row.summary,
    description: row.description,
    status: row.status,
    closesOn: fromDate(row.closesOn),
    publishedAt: row.publishedAt,
    applicationCount: row._count.applications,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPublicJob(row: JobRow): PublicJobView {
  const { status: _s, publishedAt: _p, applicationCount: _a, createdAt: _c, updatedAt: _u, ...job } = toJob(row);
  return job;
}

function toApplicationSummary(row: ApplicationRow): ApplicationSummary {
  return {
    id: row.id,
    reference: row.reference,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    postcode: row.postcode,
    stage: row.stage,
    stageChangedAt: row.stageChangedAt,
    job: row.jobPosting,
    createdAt: row.createdAt,
  };
}
