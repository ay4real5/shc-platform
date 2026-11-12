import { HEALTH_CLEARED, HEALTH_OUTCOME_LABELS, HEALTH_OUTCOMES, HEALTH_QUESTIONS, HEALTH_VACCINES, type HealthOutcome, type HealthStatus } from '@alora/shared';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Equals, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PhiContext, PhiCryptoService } from '../../common/crypto/phi-crypto.service.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { trimmed } from '../../common/validators/fields.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StaffService } from './staff.service.js';

const QUESTION_KEYS = HEALTH_QUESTIONS.map((q) => q.key) as string[];
const VACCINE_KEYS = HEALTH_VACCINES.map((v) => v.key) as string[];

export interface HealthAnswers {
  /** One per HEALTH_QUESTIONS key: yes/no, with details for a yes. */
  answers: Record<string, { answer: 'yes' | 'no'; details?: string }>;
  /** Optional: vaccinations they've had. */
  vaccines: Record<string, boolean>;
}

export class SubmitHealthDto {
  /** `{ condition: { answer: 'no' }, adjustments: { answer: 'yes', details: '…' }, … }` — every question. */
  @IsObject()
  answers!: Record<string, { answer: 'yes' | 'no'; details?: string }>;

  @IsOptional()
  @IsObject()
  vaccines?: Record<string, boolean>;

  @Equals(true, { message: 'Please confirm the declaration' })
  declaration!: true;
}

export class ReviewHealthDto {
  @IsIn(HEALTH_OUTCOMES)
  outcome!: HealthOutcome;

  /** e.g. the adjustments agreed. Stored encrypted. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(3000)
  note?: string;
}

export interface HealthStatusView {
  status: HealthStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedBy: { id: string; name: string } | null;
}

export interface HealthDetailView extends HealthStatusView {
  answers: HealthAnswers | null;
  outcome: string | null;
  outcomeLabel: string | null;
  note: string | null;
}

/**
 * Health declarations (S2-05). Special category data: the answers and review note are encrypted (AES-256-GCM with
 * their own context), only the person and `health:read` holders can read them, and every read is audited. Everyone
 * else who manages staff sees the status only (none / submitted / cleared / referred).
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
    private readonly crypto: PhiCryptoService,
  ) {}

  async status(caller: AuthUser, staffId: string): Promise<HealthStatusView> {
    await this.staff.assertSelfOr(caller, await this.staff.find(caller, staffId), 'staff:read');
    return this.toStatus(await this.row(staffId), caller.agencyId);
  }

  async mine(caller: AuthUser): Promise<HealthDetailView> {
    const profile = await this.myProfile(caller);
    return this.toDetail(await this.row(profile.id), caller.agencyId);
  }

  async detail(caller: AuthUser, staffId: string): Promise<HealthDetailView> {
    await this.staff.find(caller, staffId);
    return this.toDetail(await this.row(staffId), caller.agencyId);
  }

  /** The person fills it in (again, if asked): a new submission waits for a fresh review. */
  async submit(caller: AuthUser, dto: SubmitHealthDto): Promise<HealthDetailView> {
    const profile = await this.myProfile(caller);
    const answers = normaliseAnswers(dto);
    const answersEncrypted = this.crypto.encrypt(JSON.stringify(answers), PhiContext.HealthAnswers);
    await this.prisma.healthDeclaration.upsert({
      where: { staffProfileId: profile.id },
      create: { agencyId: caller.agencyId, staffProfileId: profile.id, answersEncrypted, submittedAt: new Date() },
      update: { answersEncrypted, submittedAt: new Date(), outcome: null, reviewedAt: null, reviewedById: null, reviewNoteEncrypted: null },
    });
    return this.mine(caller);
  }

  async review(caller: AuthUser, staffId: string, dto: ReviewHealthDto): Promise<HealthDetailView> {
    const profile = await this.staff.find(caller, staffId);
    if (profile.userId === caller.userId) throw new ForbiddenException('Someone else must review your own health questionnaire');
    const row = await this.row(staffId);
    if (!row) throw new ConflictException('They have not filled in the questionnaire yet');
    await this.prisma.healthDeclaration.update({
      where: { id: row.id },
      data: {
        outcome: dto.outcome,
        reviewedAt: new Date(),
        reviewedById: caller.userId,
        reviewNoteEncrypted: dto.note ? this.crypto.encrypt(dto.note, PhiContext.HealthReviewNote) : null,
      },
    });
    return this.detail(caller, staffId);
  }

  private async myProfile(caller: AuthUser) {
    const profile = await this.prisma.staffProfile.findFirst({ where: { userId: caller.userId, agencyId: caller.agencyId }, select: { id: true } });
    if (!profile) throw new NotFoundException('You do not have a staff profile');
    return profile;
  }

  private row(staffProfileId: string) {
    return this.prisma.healthDeclaration.findUnique({ where: { staffProfileId } });
  }

  private async toStatus(row: Awaited<ReturnType<HealthService['row']>>, agencyId: string): Promise<HealthStatusView> {
    const reviewer = row?.reviewedById ? await this.prisma.user.findFirst({ where: { id: row.reviewedById, agencyId }, select: { id: true, firstName: true, lastName: true } }) : null;
    return {
      status: healthStatus(row),
      submittedAt: row?.submittedAt ?? null,
      reviewedAt: row?.reviewedAt ?? null,
      reviewedBy: reviewer ? { id: reviewer.id, name: `${reviewer.firstName} ${reviewer.lastName}` } : null,
    };
  }

  private async toDetail(row: Awaited<ReturnType<HealthService['row']>>, agencyId: string): Promise<HealthDetailView> {
    return {
      ...(await this.toStatus(row, agencyId)),
      answers: row ? (JSON.parse(this.crypto.decrypt(row.answersEncrypted, PhiContext.HealthAnswers)) as HealthAnswers) : null,
      outcome: row?.outcome ?? null,
      outcomeLabel: row?.outcome ? HEALTH_OUTCOME_LABELS[row.outcome as HealthOutcome] : null,
      note: row?.reviewNoteEncrypted ? this.crypto.decrypt(row.reviewNoteEncrypted, PhiContext.HealthReviewNote) : null,
    };
  }
}

export function healthStatus(row: { outcome: string | null } | null): HealthStatus {
  if (!row) return 'none';
  if (!row.outcome) return 'submitted';
  return (HEALTH_CLEARED as readonly string[]).includes(row.outcome) ? 'cleared' : 'referred';
}

function normaliseAnswers(dto: SubmitHealthDto): HealthAnswers {
  const answers: HealthAnswers['answers'] = {};
  for (const key of QUESTION_KEYS) {
    const a = dto.answers[key];
    if (!a || (a.answer !== 'yes' && a.answer !== 'no')) throw new BadRequestException('Please answer every question');
    const details = typeof a.details === 'string' ? a.details.trim().slice(0, 2000) : '';
    if (a.answer === 'yes' && !details) throw new BadRequestException('Please add a few words for each "yes"');
    answers[key] = a.answer === 'yes' ? { answer: 'yes', details } : { answer: 'no' };
  }
  const vaccines: Record<string, boolean> = {};
  for (const key of VACCINE_KEYS) vaccines[key] = dto.vaccines?.[key] === true;
  return { answers, vaccines };
}

@ApiTags('staff')
@Controller('staff')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** My questionnaire (my own answers). */
  @Get('me/health')
  mine(@CurrentUser() caller: AuthUser) {
    return this.health.mine(caller);
  }

  @Audit({ action: 'SUBMIT_HEALTH_DECLARATION', resourceType: 'health_declarations' })
  @Put('me/health')
  submit(@CurrentUser() caller: AuthUser, @Body() dto: SubmitHealthDto) {
    return this.health.submit(caller, dto);
  }

  /** Status only — no health information. */
  @Get(':id/health/status')
  status(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.health.status(caller, id);
  }

  /** The answers: managers with health:read only, and every read is audited. */
  @Permissions('health:read')
  @Audit({ action: 'VIEW_HEALTH_DECLARATION', resourceType: 'health_declarations' })
  @Get(':id/health')
  detail(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.health.detail(caller, id);
  }

  @Permissions('health:read')
  @Audit({ action: 'REVIEW_HEALTH_DECLARATION', resourceType: 'health_declarations' })
  @Post(':id/health/review')
  review(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewHealthDto) {
    return this.health.review(caller, id, dto);
  }
}
