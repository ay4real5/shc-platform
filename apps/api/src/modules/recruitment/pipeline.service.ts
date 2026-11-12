import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { canMoveStage, DISCIPLINE_DEFAULT_ROLE } from '@alora/shared';
import { PRODUCT_NAME } from '../../common/brand.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { toDate } from '../../common/utils/dates.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import { SignaturesService } from '../documents/signatures.js';
import { EmailSender } from '../notifications/delivery/senders.js';
import { PermissionsService } from '../rbac/permissions.service.js';
import { formatInterviewTime, interviewInviteEmail, rejectionEmail, welcomeEmail } from './candidate-emails.js';
import type { BookInterviewDto, HireDto, MoveStageDto, UpdateInterviewDto } from './dto/recruitment.dto.js';

/** How long a new hire's "choose your password" link works. */
export const WELCOME_LINK_HOURS = 72;

export interface TimelineEntry {
  id: string;
  kind: string;
  fromStage: string | null;
  toStage: string | null;
  text: string | null;
  actor: { id: string; name: string } | null;
  createdAt: Date;
}

export interface InterviewView {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  mode: string;
  location: string | null;
  interviewer: { id: string; name: string } | null;
  status: string;
  score: number | null;
  outcome: string | null;
  notes: string | null;
}

export interface HireResult {
  userId: string;
  staffProfileId: string;
  /** False when email isn't set up: give them a starting password from Users instead. */
  welcomeEmailSent: boolean;
  /** Documents from their onboarding pack sent for signature. */
  documentsToSign: number;
}

/**
 * The hiring pipeline (S1-05): stage moves, notes, interviews, candidate emails and hiring. Every change lands on the
 * application's timeline. Scoped to the caller's company.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailSender,
    private readonly passwords: PasswordService,
    private readonly permissions: PermissionsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly signatures: SignaturesService,
  ) {}

  async timeline(caller: AuthUser, applicationId: string): Promise<{ events: TimelineEntry[]; interviews: InterviewView[] }> {
    await this.find(caller, applicationId);
    const [events, interviews] = await Promise.all([
      this.prisma.applicationEvent.findMany({ where: { applicationId }, orderBy: { createdAt: 'desc' }, take: 500 }),
      this.prisma.interview.findMany({ where: { applicationId }, orderBy: { startsAt: 'desc' } }),
    ]);
    const names = await this.names([...events.map((e) => e.actorUserId), ...interviews.map((i) => i.interviewerId)], caller.agencyId);
    return {
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        fromStage: e.fromStage,
        toStage: e.toStage,
        text: e.text,
        actor: e.actorUserId ? (names.get(e.actorUserId) ?? null) : null,
        createdAt: e.createdAt,
      })),
      interviews: interviews.map((i) => toInterview(i, names)),
    };
  }

  async moveStage(caller: AuthUser, applicationId: string, dto: MoveStageDto): Promise<{ stage: string; emailSent: boolean }> {
    const app = await this.find(caller, applicationId);
    if (!canMoveStage(app.stage, dto.stage)) {
      throw new ConflictException(app.stage === 'hired' ? 'This applicant has already been hired' : `Cannot move from ${app.stage} to ${dto.stage}`);
    }
    // Guarded update: two people moving the same application at once can't both win.
    const moved = await this.prisma.application.updateMany({
      where: { id: app.id, stage: app.stage },
      data: { stage: dto.stage, stageChangedAt: new Date() },
    });
    if (!moved.count) throw new ConflictException('Someone else just changed this application; reload and try again');
    await this.event(app.id, caller, { kind: 'stage', fromStage: app.stage, toStage: dto.stage, text: dto.note ?? null });

    let emailSent = false;
    if (dto.notifyApplicant && dto.stage === 'rejected') {
      const company = await this.company(caller.agencyId);
      const mail = rejectionEmail(app.firstName, company.name, app.jobPosting?.title ?? null);
      emailSent = await this.sendToApplicant(app.id, caller, app.email, mail);
    }
    return { stage: dto.stage, emailSent };
  }

  async addNote(caller: AuthUser, applicationId: string, text: string): Promise<TimelineEntry> {
    const app = await this.find(caller, applicationId);
    const row = await this.event(app.id, caller, { kind: 'note', text });
    const names = await this.names([caller.userId], caller.agencyId);
    return { id: row.id, kind: row.kind, fromStage: null, toStage: null, text: row.text, actor: names.get(caller.userId) ?? null, createdAt: row.createdAt };
  }

  async bookInterview(caller: AuthUser, applicationId: string, dto: BookInterviewDto): Promise<InterviewView & { emailSent: boolean }> {
    const app = await this.find(caller, applicationId);
    if (['hired', 'rejected', 'withdrawn'].includes(app.stage)) throw new ConflictException(`This application is ${app.stage}`);
    if (dto.interviewerId) await this.assertColleague(caller, dto.interviewerId);
    const startsAt = new Date(dto.startsAt);

    const interview = await this.prisma.interview.create({
      data: {
        applicationId: app.id,
        agencyId: caller.agencyId,
        startsAt,
        durationMinutes: dto.durationMinutes ?? 30,
        mode: dto.mode,
        location: dto.location ?? null,
        interviewerId: dto.interviewerId ?? null,
        createdById: caller.userId,
      },
    });
    const company = await this.company(caller.agencyId);
    const when = formatInterviewTime(startsAt, company.timezone);
    await this.event(app.id, caller, { kind: 'interview', text: `Interview booked for ${when}` });
    // Booking an interview moves early applications on to the interview stage.
    if (app.stage === 'applied' || app.stage === 'screened') {
      const moved = await this.prisma.application.updateMany({ where: { id: app.id, stage: app.stage }, data: { stage: 'interview', stageChangedAt: new Date() } });
      if (moved.count) await this.event(app.id, caller, { kind: 'stage', fromStage: app.stage, toStage: 'interview' });
    }

    let emailSent = false;
    if (dto.notifyApplicant) {
      const mail = interviewInviteEmail({
        firstName: app.firstName,
        company: company.name,
        jobTitle: app.jobPosting?.title ?? null,
        when,
        durationMinutes: interview.durationMinutes,
        mode: interview.mode,
        location: interview.location,
      });
      emailSent = await this.sendToApplicant(app.id, caller, app.email, mail);
    }
    const names = await this.names([interview.interviewerId], caller.agencyId);
    return { ...toInterview(interview, names), emailSent };
  }

  async updateInterview(caller: AuthUser, interviewId: string, dto: UpdateInterviewDto): Promise<InterviewView> {
    const current = await this.prisma.interview.findFirst({ where: { id: interviewId, agencyId: caller.agencyId } });
    if (!current) throw new NotFoundException('Interview not found');
    const updated = await this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.score !== undefined ? { score: dto.score } : {}),
        ...(dto.outcome !== undefined ? { outcome: dto.outcome } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: new Date(dto.startsAt) } : {}),
      },
    });
    if (dto.status && dto.status !== current.status) {
      await this.event(current.applicationId, caller, { kind: 'interview', text: `Interview ${dto.status.replace('_', ' ')}` });
    }
    const names = await this.names([updated.interviewerId], caller.agencyId);
    return toInterview(updated, names);
  }

  /**
   * Hires the applicant: creates their login (role from their job role) and staff record in one transaction, marks
   * the application hired, then emails a one-time "choose your password" link. Onboarding starts from the staff
   * record's checklist straight away.
   */
  async hire(caller: AuthUser, applicationId: string, dto: HireDto): Promise<HireResult> {
    const app = await this.find(caller, applicationId);
    if (app.stage === 'hired') throw new ConflictException('This applicant has already been hired');
    if (app.stage === 'rejected' || app.stage === 'withdrawn') throw new ConflictException(`Reopen this ${app.stage} application before hiring`);
    if (await this.prisma.user.count({ where: { email: app.email } })) {
      throw new ConflictException('Someone already has a login with this email address');
    }

    const discipline = dto.discipline ?? app.jobPosting?.discipline ?? 'care_worker';
    const roleName = DISCIPLINE_DEFAULT_ROLE[discipline] ?? 'care_worker';
    const role = await this.prisma.role.findFirst({
      where: { agencyId: null, name: roleName },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) throw new BadRequestException(`Role ${roleName} is missing`);
    // Nobody can hand out more access than they have (e.g. a coordinator hiring a registered manager).
    const mine = (await this.permissions.forUser(caller)).permissions;
    const missing = role.rolePermissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`).filter((p) => !mine.has(p));
    if (missing.length) throw new ForbiddenException('Ask an administrator to hire for this job role: it has more access than yours');

    const startDate = dto.startDate ?? undefined;
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.application.updateMany({
        where: { id: app.id, stage: app.stage },
        data: { stage: 'hired', stageChangedAt: new Date() },
      });
      if (!claimed.count) throw new ConflictException('Someone else just changed this application; reload and try again');
      const user = await tx.user.create({
        data: {
          agencyId: caller.agencyId,
          email: app.email,
          firstName: app.firstName,
          lastName: app.lastName,
          phone: app.phone,
          // Nobody knows this password: they choose their own from the welcome link.
          passwordHash: await this.passwords.hash(randomBytes(32).toString('base64url')),
          passwordChangedAt: new Date(),
          userRoles: { create: { roleId: role.id } },
        },
        select: { id: true },
      });
      const profile = await tx.staffProfile.create({
        data: {
          userId: user.id,
          agencyId: caller.agencyId,
          discipline,
          employmentType: dto.employmentType ?? app.jobPosting?.employmentType ?? 'full_time',
          hireDate: toDate(startDate) ?? null,
          hourlyRate: dto.hourlyRate ?? null,
          addressLine1: app.addressLine1,
          town: app.town,
          postcode: app.postcode,
          canDrive: app.canDrive,
        },
        select: { id: true },
      });
      await tx.application.update({ where: { id: app.id }, data: { hiredUserId: user.id } });
      await tx.applicationEvent.create({
        data: { applicationId: app.id, kind: 'stage', fromStage: app.stage, toStage: 'hired', text: 'Hired: login and staff record created', actorUserId: caller.userId },
      });
      return { userId: user.id, staffProfileId: profile.id };
    });

    const welcomeEmailSent = await this.sendWelcome(caller, app.id, result.userId, app.email, app.firstName);
    // Their onboarding pack (contracts and policies for their job role) goes out straight away.
    let documentsToSign = 0;
    try {
      documentsToSign = (await this.signatures.sendPacks(caller.agencyId, caller.userId, result.staffProfileId)).created;
    } catch (error) {
      this.logger.error(`Onboarding pack failed for a new hire: ${(error as Error).name}`);
    }
    return { ...result, welcomeEmailSent, documentsToSign };
  }

  // ---------- helpers ----------

  private async find(caller: AuthUser, id: string) {
    const app = await this.prisma.application.findFirst({
      where: { id, agencyId: caller.agencyId },
      include: { jobPosting: { select: { title: true, discipline: true, employmentType: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  private event(applicationId: string, caller: AuthUser, e: { kind: string; fromStage?: string; toStage?: string; text?: string | null }) {
    return this.prisma.applicationEvent.create({
      data: { applicationId, kind: e.kind, fromStage: e.fromStage ?? null, toStage: e.toStage ?? null, text: e.text ?? null, actorUserId: caller.userId },
    });
  }

  private company(agencyId: string) {
    return this.prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { name: true, timezone: true } });
  }

  private async assertColleague(caller: AuthUser, userId: string) {
    if (!(await this.prisma.user.count({ where: { id: userId, agencyId: caller.agencyId, isActive: true } }))) {
      throw new BadRequestException('The interviewer must be an active user in your company');
    }
  }

  private async names(ids: (string | null)[], agencyId: string): Promise<Map<string, { id: string; name: string }>> {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (!wanted.length) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: wanted }, agencyId }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, { id: u.id, name: `${u.firstName} ${u.lastName}` }]));
  }

  /** Sends and records it on the timeline (subject only). Never throws: the stage change already happened. */
  private async sendToApplicant(applicationId: string, caller: AuthUser, to: string, mail: { subject: string; text: string }): Promise<boolean> {
    if (!this.email.enabled) {
      await this.event(applicationId, caller, { kind: 'email', text: `Not sent (email isn't set up): ${mail.subject}` });
      return false;
    }
    try {
      const sent = await this.email.sendText(to, mail.subject, mail.text);
      await this.event(applicationId, caller, { kind: 'email', text: sent.ok ? `Sent: ${mail.subject}` : `Failed: ${mail.subject}` });
      return sent.ok;
    } catch (error) {
      this.logger.error(`Applicant email failed for application ${applicationId}: ${(error as Error).name}`);
      return false;
    }
  }

  private async sendWelcome(caller: AuthUser, applicationId: string, userId: string, to: string, firstName: string): Promise<boolean> {
    const frontend = this.config.get('FRONTEND_URL', { infer: true });
    if (!this.email.enabled || !frontend) return false;
    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + WELCOME_LINK_HOURS * 3_600_000) },
    });
    const company = await this.company(caller.agencyId);
    const mail = welcomeEmail(firstName, company.name, PRODUCT_NAME, `${frontend.replace(/\/+$/, '')}/reset-password#token=${token}`, WELCOME_LINK_HOURS);
    return this.sendToApplicant(applicationId, caller, to, mail);
  }
}

function toInterview(
  i: {
    id: string;
    startsAt: Date;
    durationMinutes: number;
    mode: string;
    location: string | null;
    interviewerId: string | null;
    status: string;
    score: number | null;
    outcome: string | null;
    notes: string | null;
  },
  names: Map<string, { id: string; name: string }>,
): InterviewView {
  return {
    id: i.id,
    startsAt: i.startsAt,
    durationMinutes: i.durationMinutes,
    mode: i.mode,
    location: i.location,
    interviewer: i.interviewerId ? (names.get(i.interviewerId) ?? null) : null,
    status: i.status,
    score: i.score,
    outcome: i.outcome,
    notes: i.notes,
  };
}
