import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  GoneException,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, Equals, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { trimmed } from '../../common/validators/fields.js';
import { IsDateOnly } from '../../common/validators/is-date-only.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { EmailSender } from '../notifications/delivery/senders.js';

/** How long a referee's link works. */
export const REFERENCE_LINK_DAYS = 30;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

// ---------- DTOs ----------

export class SendReferencesDto {
  /** Which referees; all of them when left out. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsUUID('all', { each: true })
  refereeIds?: string[];
}

export class ReferenceTokenDto {
  @Matches(TOKEN, { message: 'This link is not valid' })
  token!: string;
}

const YES_NO = ['yes', 'no'] as const;
const YES_NO_UNSURE = ['yes', 'no', 'unsure'] as const;

/** The referee's answers. Free text is short and optional except where a "yes" needs explaining. */
export class ReferenceAnswersDto extends ReferenceTokenDto {
  /** Or decline to give a reference (company policy, don't know them well enough…). */
  @IsOptional()
  @IsBoolean()
  declined?: boolean;

  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refereeName!: string;

  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  refereeJobTitle!: string;

  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organisation!: string;

  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @IsDateOnly({ notInFuture: true })
  employedFrom!: string;

  /** Leave out if they still work there. */
  @IsOptional()
  @IsDateOnly({ notInFuture: true })
  employedTo?: string;

  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  candidateJobTitle!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  reasonForLeaving?: string;

  /** 1 (poor) – 5 (excellent). */
  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @IsInt()
  @Min(1)
  @Max(5)
  reliability!: number;

  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @IsInt()
  @Min(1)
  @Max(5)
  attitude!: number;

  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @IsIn(YES_NO)
  disciplinary!: (typeof YES_NO)[number];

  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @IsIn(YES_NO)
  safeguardingConcerns!: (typeof YES_NO)[number];

  /** Required when either answer above is "yes". */
  @ValidateIf((o: ReferenceAnswersDto) => !o.declined && (o.disciplinary === 'yes' || o.safeguardingConcerns === 'yes'))
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Please give details of the disciplinary action or concerns' })
  @MaxLength(3000)
  concernDetails?: string;

  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @IsIn(YES_NO_UNSURE)
  wouldReemploy!: (typeof YES_NO_UNSURE)[number];

  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @IsIn(YES_NO_UNSURE)
  suitableForCare!: (typeof YES_NO_UNSURE)[number];

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(5000)
  comments?: string;

  @ValidateIf((o: ReferenceAnswersDto) => !o.declined)
  @Equals(true, { message: 'Please confirm the declaration' })
  declaration?: true;
}

export class VerifyReferenceDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;
}

export type ReferenceAnswers = Omit<ReferenceAnswersDto, 'token' | 'declaration' | 'declined'>;

export interface ReferenceView {
  id: string;
  referee: { id: string; name: string; organisation: string | null; relationship: string; email: string };
  status: string;
  sentAt: Date;
  expiresAt: Date;
  emailSent: boolean;
  respondedAt: Date | null;
  answers: ReferenceAnswers | null;
  /** Any "yes" to disciplinary or safeguarding, or "no" to re-employ / suitable: look closely. */
  flagged: boolean;
  verified: { by: { id: string; name: string } | null; at: Date; note: string | null } | null;
}

// ---------- service ----------

/**
 * References (S2-03). The office sends each referee a one-time link (only its hash is stored; 30 days); the referee
 * answers a short form without signing in, or declines. Answers land on the application (and so on the hire). The
 * applicant's "don't contact before an offer" choice is respected.
 */
@Injectable()
export class ReferencesService {
  private readonly logger = new Logger(ReferencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailSender,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async list(caller: AuthUser, applicationId: string): Promise<ReferenceView[]> {
    await this.findApplication(caller, applicationId);
    const rows = await this.prisma.referenceRequest.findMany({ where: { applicationId }, include: { referee: true }, orderBy: [{ referee: { position: 'asc' } }, { sentAt: 'desc' }] });
    const names = await this.names(rows.map((r) => r.verifiedById), caller.agencyId);
    return rows.map((r) => toView(r, names));
  }

  /** Sends (or re-sends) requests. Returns the links only when email isn't set up, so the office can pass them on. */
  async send(caller: AuthUser, applicationId: string, refereeIds?: string[]): Promise<{ requests: ReferenceView[]; links: { refereeId: string; link: string }[] }> {
    const app = await this.findApplication(caller, applicationId);
    if (app.stage === 'rejected' || app.stage === 'withdrawn') throw new ConflictException(`This application is ${app.stage}`);
    const referees = app.referees.filter((r) => !refereeIds || refereeIds.includes(r.id));
    if (!referees.length) throw new BadRequestException('No matching referees on this application');
    const beforeOffer = !['offer', 'hired'].includes(app.stage);
    const blocked = beforeOffer ? referees.filter((r) => !r.contactBeforeOffer) : [];
    if (blocked.length) {
      throw new ConflictException(`${blocked.map((r) => r.name).join(' and ')} asked not to be contacted before an offer. Move the application to Offer first.`);
    }
    const frontend = this.config.get('FRONTEND_URL', { infer: true })?.replace(/\/+$/, '') ?? '';
    const company = await this.prisma.agency.findUniqueOrThrow({ where: { id: caller.agencyId }, select: { name: true } });
    const links: { refereeId: string; link: string }[] = [];

    for (const referee of referees) {
      const token = randomBytes(32).toString('base64url');
      const link = `${frontend}/reference#token=${token}`;
      // Only the newest link per referee works.
      await this.prisma.referenceRequest.updateMany({ where: { refereeId: referee.id, status: 'sent' }, data: { status: 'cancelled' } });
      const request = await this.prisma.referenceRequest.create({
        data: {
          agencyId: caller.agencyId,
          applicationId: app.id,
          refereeId: referee.id,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + REFERENCE_LINK_DAYS * 86_400_000),
          sentById: caller.userId,
        },
      });
      let sent = false;
      if (this.email.enabled && frontend) {
        try {
          const mail = referenceEmail(referee.name, `${app.firstName} ${app.lastName}`, company.name, link);
          sent = (await this.email.sendText(referee.email, mail.subject, mail.text)).ok;
        } catch (error) {
          this.logger.error(`Reference email failed for request ${request.id}: ${(error as Error).name}`);
        }
      }
      if (sent) await this.prisma.referenceRequest.update({ where: { id: request.id }, data: { emailSent: true } });
      else links.push({ refereeId: referee.id, link });
      await this.prisma.applicationEvent.create({
        data: { applicationId: app.id, kind: 'email', text: `${sent ? 'Reference request sent' : 'Reference link created (email not sent)'}: ${referee.name}`, actorUserId: caller.userId },
      });
    }
    return { requests: await this.list(caller, applicationId), links };
  }

  async verify(caller: AuthUser, requestId: string, note: string): Promise<ReferenceView> {
    const row = await this.prisma.referenceRequest.findFirst({ where: { id: requestId, agencyId: caller.agencyId } });
    if (!row) throw new NotFoundException('Reference not found');
    if (row.status !== 'received') throw new ConflictException('Only a received reference can be verified');
    await this.prisma.referenceRequest.update({ where: { id: row.id }, data: { verifiedById: caller.userId, verifiedAt: new Date(), verificationNote: note } });
    const updated = await this.prisma.referenceRequest.findUniqueOrThrow({ where: { id: row.id }, include: { referee: true } });
    return toView(updated, await this.names([caller.userId], caller.agencyId));
  }

  // ---------- public (referee) ----------

  /** What the referee sees: who it's about and for whom. Nothing else from the application. */
  async view(token: string): Promise<{ candidateName: string; company: string; refereeName: string; status: string }> {
    const row = await this.findByToken(token);
    return {
      candidateName: `${row.application.firstName} ${row.application.lastName}`,
      company: row.application.agency.name,
      refereeName: row.referee.name,
      status: row.status,
    };
  }

  async respond(dto: ReferenceAnswersDto): Promise<{ received: true }> {
    const row = await this.findByToken(dto.token);
    if (row.status !== 'sent') throw new GoneException('This reference has already been answered. Thank you.');
    if (dto.employedTo && dto.employedFrom && dto.employedTo < dto.employedFrom) throw new BadRequestException('The end date is before the start date');
    const { token: _t, declaration: _d, declined, ...answers } = dto;
    // Guarded: a double-submit can't overwrite the first answer.
    const saved = await this.prisma.referenceRequest.updateMany({
      where: { id: row.id, status: 'sent' },
      data: declined ? { status: 'declined', respondedAt: new Date() } : { status: 'received', respondedAt: new Date(), answers: answers as unknown as Prisma.InputJsonObject },
    });
    if (!saved.count) throw new GoneException('This reference has already been answered. Thank you.');
    await this.prisma.applicationEvent.create({
      data: { applicationId: row.applicationId, kind: 'email', text: `${declined ? 'Referee declined' : 'Reference received'}: ${row.referee.name}` },
    });
    return { received: true };
  }

  private async findByToken(token: string) {
    const row = await this.prisma.referenceRequest.findUnique({
      where: { tokenHash: hash(token) },
      include: { referee: true, application: { select: { firstName: true, lastName: true, agency: { select: { name: true } } } } },
    });
    if (!row || row.status === 'cancelled') throw new NotFoundException('This link is not valid. Please use the newest email you received.');
    if (row.status === 'sent' && row.expiresAt < new Date()) throw new GoneException('This link has expired. Please ask the company to send a new one.');
    return row;
  }

  private async findApplication(caller: AuthUser, id: string) {
    const app = await this.prisma.application.findFirst({ where: { id, agencyId: caller.agencyId }, include: { referees: { orderBy: { position: 'asc' } } } });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  private async names(ids: (string | null)[], agencyId: string) {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const users = wanted.length ? await this.prisma.user.findMany({ where: { id: { in: wanted }, agencyId }, select: { id: true, firstName: true, lastName: true } }) : [];
    return new Map(users.map((u) => [u.id, { id: u.id, name: `${u.firstName} ${u.lastName}` }]));
  }
}

export function referenceEmail(refereeName: string, candidateName: string, company: string, link: string): { subject: string; text: string } {
  return {
    subject: `Reference request for ${candidateName}`,
    text: [
      `Hello ${refereeName},`,
      '',
      `${candidateName} has applied to work in care with ${company} and gave your name as a referee.`,
      '',
      `Please answer a few short questions here (about 5 minutes; the link works for ${REFERENCE_LINK_DAYS} days):`,
      link,
      '',
      'Care providers must check references before someone works with vulnerable people, so your help matters. Thank you.',
      '',
      company,
    ].join('\n'),
  };
}

function toView(
  r: Prisma.ReferenceRequestGetPayload<{ include: { referee: true } }>,
  names: Map<string, { id: string; name: string }>,
): ReferenceView {
  const answers = (r.answers as ReferenceAnswers | null) ?? null;
  const flagged = Boolean(
    answers && (answers.disciplinary === 'yes' || answers.safeguardingConcerns === 'yes' || answers.wouldReemploy === 'no' || answers.suitableForCare === 'no'),
  );
  return {
    id: r.id,
    referee: { id: r.referee.id, name: r.referee.name, organisation: r.referee.organisation, relationship: r.referee.relationship, email: r.referee.email },
    status: r.status,
    sentAt: r.sentAt,
    expiresAt: r.expiresAt,
    emailSent: r.emailSent,
    respondedAt: r.respondedAt,
    answers,
    flagged,
    verified: r.verifiedAt ? { by: r.verifiedById ? (names.get(r.verifiedById) ?? null) : null, at: r.verifiedAt, note: r.verificationNote } : null,
  };
}

// ---------- controllers ----------

@ApiTags('recruitment')
@Controller('recruitment')
export class ReferencesController {
  constructor(private readonly references: ReferencesService) {}

  @Permissions('recruitment:read')
  @Get('applications/:id/references')
  list(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.references.list(caller, id);
  }

  @Permissions('recruitment:manage')
  @Audit({ action: 'SEND_REFERENCE_REQUESTS', resourceType: 'applications' })
  @Post('applications/:id/references')
  send(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendReferencesDto) {
    return this.references.send(caller, id, dto.refereeIds);
  }

  @Permissions('recruitment:manage')
  @Audit({ action: 'VERIFY_REFERENCE', resourceType: 'reference_requests' })
  @Post('references/:id/verify')
  verify(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyReferenceDto) {
    return this.references.verify(caller, id, dto.note);
  }
}

/** The referee's side: no sign-in, the token is the key (sent in the body, never the URL). */
@ApiTags('references')
@Controller('references')
export class PublicReferencesController {
  constructor(private readonly references: ReferencesService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('view')
  view(@Body() dto: ReferenceTokenDto) {
    return this.references.view(dto.token);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('respond')
  respond(@Body() dto: ReferenceAnswersDto) {
    return this.references.respond(dto);
  }
}
