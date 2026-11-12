import {
  DEFAULT_SUPERVISION_INTERVALS,
  SUPERVISION_TYPE_LABELS,
  SUPERVISION_TYPES,
  supervisionDueOn,
  type Permission,
  type SupervisionType,
} from '@alora/shared';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PhiContext, PhiCryptoService } from '../../common/crypto/phi-crypto.service.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { fromDate, toDate } from '../../common/utils/dates.js';
import { IsDateOnly } from '../../common/validators/is-date-only.js';
import { trimmed } from '../../common/validators/fields.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PermissionsService } from '../rbac/permissions.service.js';
import { StaffService } from './staff.service.js';

export class CreateSupervisionDto {
  @IsIn(SUPERVISION_TYPES)
  type!: SupervisionType;

  /** Book it for this date (leave out `heldOn`). */
  @IsOptional()
  @IsDateOnly()
  scheduledFor?: string;

  /** Or record one that already happened: the date it was held, with notes. */
  @IsOptional()
  @IsDateOnly({ notInFuture: true })
  heldOn?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(10, { message: 'Please write a little about what was discussed and agreed' })
  @MaxLength(10000)
  notes?: string;

  /** Who leads it. Defaults to the person booking it. */
  @IsOptional()
  @IsUUID()
  supervisorId?: string;
}

export class CompleteSupervisionDto {
  @IsDateOnly({ notInFuture: true })
  heldOn!: string;

  /** What was discussed and the actions agreed. Stored encrypted. */
  @Transform(trimmed)
  @IsString()
  @MinLength(10, { message: 'Please write a little about what was discussed and agreed' })
  @MaxLength(10000)
  notes!: string;
}

export class AcknowledgeSupervisionDto {
  /** The person's own comment on the record (optional). Stored encrypted. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(3000)
  comment?: string;
}

export type Intervals = Record<SupervisionType, { everyMonths: number; firstAfterMonths: number }>;

export interface SessionView {
  id: string;
  type: SupervisionType;
  typeLabel: string;
  status: string;
  scheduledFor: string | null;
  heldOn: string | null;
  supervisor: { id: string; name: string } | null;
  /** Only for the person themselves and supervisions:manage holders. */
  notes: string | null;
  acknowledgedAt: Date | null;
  staffComment: string | null;
}

export interface DueView {
  type: SupervisionType;
  label: string;
  lastHeld: string | null;
  dueOn: string;
  overdue: boolean;
  scheduled: { id: string; scheduledFor: string | null } | null;
}

export interface SupervisionsOverviewRow {
  staff: { id: string; name: string; discipline: string };
  due: DueView[];
  awaitingSignature: number;
}

type SessionRow = {
  id: string;
  type: string;
  status: string;
  scheduledFor: Date | null;
  heldOn: Date | null;
  notesEncrypted: Uint8Array | null;
  acknowledgedAt: Date | null;
  staffCommentEncrypted: Uint8Array | null;
  supervisor: { id: string; firstName: string; lastName: string } | null;
};

const SESSION_SELECT = {
  id: true,
  type: true,
  status: true,
  scheduledFor: true,
  heldOn: true,
  notesEncrypted: true,
  acknowledgedAt: true,
  staffCommentEncrypted: true,
  supervisor: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** "3 Dec": notifications carry dates only. */
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** What's due for one person, from their completed and booked sessions. */
export function dueFor(sessions: { type: string; status: string; heldOn: Date | null; scheduledFor: Date | null; id: string }[], startedOn: string | null, today: string, intervals: Intervals): DueView[] {
  return SUPERVISION_TYPES.map((type) => {
    const mine = sessions.filter((s) => s.type === type);
    const lastHeld = mine.filter((s) => s.status === 'completed' && s.heldOn).map((s) => fromDate(s.heldOn)!).sort().at(-1) ?? null;
    const booked = mine.filter((s) => s.status === 'scheduled').sort((a, b) => (fromDate(a.scheduledFor) ?? '').localeCompare(fromDate(b.scheduledFor) ?? ''))[0];
    const dueOn = supervisionDueOn(lastHeld, startedOn, today, intervals[type]);
    return {
      type,
      label: SUPERVISION_TYPE_LABELS[type],
      lastHeld,
      dueOn,
      overdue: dueOn < today && !booked,
      scheduled: booked ? { id: booked.id, scheduledFor: fromDate(booked.scheduledFor) } : null,
    };
  });
}

/**
 * Supervisions, appraisals and spot checks (S3-04): book them, record them (notes encrypted), and the person reads and
 * signs the record. What's due comes from the last one held and the company's intervals.
 */
@Injectable()
export class SupervisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
    private readonly permissions: PermissionsService,
    private readonly crypto: PhiCryptoService,
    private readonly clock: AgencyClockService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The company's intervals (settings.supervisionEveryMonths), over the defaults. */
  async intervals(agencyId: string): Promise<Intervals> {
    const agency = await this.prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { settings: true } });
    const custom = ((agency.settings ?? {}) as Record<string, unknown>).supervisionEveryMonths as Record<string, unknown> | undefined;
    return Object.fromEntries(
      SUPERVISION_TYPES.map((t) => {
        const every = custom?.[t];
        return [t, { ...DEFAULT_SUPERVISION_INTERVALS[t], ...(typeof every === 'number' && every >= 1 && every <= 24 ? { everyMonths: every } : {}) }];
      }),
    ) as Intervals;
  }

  async forStaff(caller: AuthUser, staffId: string): Promise<{ due: DueView[]; sessions: SessionView[]; canManage: boolean }> {
    const profile = await this.staff.find(caller, staffId);
    const isSelf = profile.userId === caller.userId;
    await this.staff.assertSelfOr(caller, profile, 'staff:read');
    const canManage = !isSelf && (await this.can(caller, 'supervisions:manage'));
    const [sessions, hire, today, intervals] = await Promise.all([
      this.prisma.supervision.findMany({ where: { staffProfileId: staffId, agencyId: caller.agencyId }, select: SESSION_SELECT, orderBy: [{ createdAt: 'desc' }] }),
      this.prisma.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { hireDate: true } }),
      this.clock.todayString(caller.agencyId),
      this.intervals(caller.agencyId),
    ]);
    const due = dueFor(sessions, fromDate(hire.hireDate), today, intervals);
    const visible = sessions.filter((s) => s.status !== 'cancelled');
    return { due, sessions: visible.map((s) => this.view(s, isSelf || canManage)), canManage };
  }

  /** Book one, or record one already held (with heldOn and notes). */
  async create(caller: AuthUser, staffId: string, dto: CreateSupervisionDto): Promise<SessionView> {
    const profile = await this.staff.find(caller, staffId);
    if (profile.userId === caller.userId) throw new ForbiddenException('Someone else must hold your supervision');
    const supervisorId = dto.supervisorId ?? caller.userId;
    if (supervisorId === profile.userId) throw new BadRequestException('Someone can’t supervise themselves');
    const supervisor = await this.prisma.user.findFirst({ where: { id: supervisorId, agencyId: caller.agencyId, isActive: true }, select: { id: true } });
    if (!supervisor) throw new BadRequestException('Choose an active member of your company to lead it');
    const today = await this.clock.todayString(caller.agencyId);

    if (dto.heldOn) {
      if (!dto.notes) throw new BadRequestException('Add notes: what was discussed and the actions agreed');
      if (dto.heldOn > today) throw new BadRequestException('The date held can’t be in the future');
      const row = await this.prisma.supervision.create({
        data: {
          agencyId: caller.agencyId,
          staffProfileId: staffId,
          type: dto.type,
          status: 'completed',
          heldOn: toDate(dto.heldOn)!,
          supervisorId,
          notesEncrypted: this.crypto.encrypt(dto.notes, PhiContext.SupervisionNotes),
          createdById: caller.userId,
        },
        select: SESSION_SELECT,
      });
      await this.askToSign(caller, profile.userId, row.id, dto.type);
      return this.view(row, true);
    }

    if (!dto.scheduledFor) throw new BadRequestException('Give a date to book it for, or the date it was held');
    if (dto.scheduledFor < today) throw new BadRequestException('Book it for today or later. To record one that already happened, give the date it was held.');
    const existing = await this.prisma.supervision.count({ where: { staffProfileId: staffId, type: dto.type, status: 'scheduled' } });
    if (existing) throw new ConflictException(`A ${SUPERVISION_TYPE_LABELS[dto.type].toLowerCase()} is already booked: record or cancel it first`);
    const row = await this.prisma.supervision.create({
      data: { agencyId: caller.agencyId, staffProfileId: staffId, type: dto.type, scheduledFor: toDate(dto.scheduledFor)!, supervisorId, createdById: caller.userId },
      select: SESSION_SELECT,
    });
    await this.notifications.notify({
      agencyId: caller.agencyId,
      userIds: [profile.userId, supervisorId],
      actorUserId: caller.userId,
      type: 'supervision',
      title: `${SUPERVISION_TYPE_LABELS[dto.type]} booked for ${shortDate(dto.scheduledFor)}`,
      body: 'Details are in the app.',
      data: { supervisionId: row.id },
    });
    return this.view(row, true);
  }

  async complete(caller: AuthUser, id: string, dto: CompleteSupervisionDto): Promise<SessionView> {
    const row = await this.findForManager(caller, id);
    if (row.status !== 'scheduled') throw new ConflictException(`This is already ${row.status}`);
    if (dto.heldOn > (await this.clock.todayString(caller.agencyId))) throw new BadRequestException('The date held can’t be in the future');
    const updated = await this.prisma.supervision.updateMany({
      where: { id, status: 'scheduled' },
      data: { status: 'completed', heldOn: toDate(dto.heldOn)!, notesEncrypted: this.crypto.encrypt(dto.notes, PhiContext.SupervisionNotes) },
    });
    if (!updated.count) throw new ConflictException('This just changed: reload and try again');
    await this.askToSign(caller, row.staffProfile.userId, id, row.type as SupervisionType);
    return this.view(await this.prisma.supervision.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT }), true);
  }

  async cancel(caller: AuthUser, id: string): Promise<SessionView> {
    const row = await this.findForManager(caller, id);
    if (row.status !== 'scheduled') throw new ConflictException(`This is already ${row.status}`);
    await this.prisma.supervision.update({ where: { id }, data: { status: 'cancelled' } });
    return this.view(await this.prisma.supervision.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT }), true);
  }

  /** The person confirms they've read the record, with an optional comment. */
  async acknowledge(caller: AuthUser, id: string, dto: AcknowledgeSupervisionDto): Promise<SessionView> {
    const row = await this.prisma.supervision.findFirst({ where: { id, agencyId: caller.agencyId, staffProfile: { userId: caller.userId } }, select: { status: true, acknowledgedAt: true } });
    if (!row) throw new NotFoundException('Supervision not found');
    if (row.status !== 'completed') throw new ConflictException('There is no record to sign yet');
    if (row.acknowledgedAt) throw new ConflictException('You have already signed this record');
    await this.prisma.supervision.update({
      where: { id },
      data: { acknowledgedAt: new Date(), staffCommentEncrypted: dto.comment ? this.crypto.encrypt(dto.comment, PhiContext.SupervisionComment) : null },
    });
    return this.view(await this.prisma.supervision.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT }), true);
  }

  /** The signed-in person's records waiting for their signature (home page). */
  async toSign(caller: AuthUser): Promise<{ id: string; type: SupervisionType; typeLabel: string; heldOn: string | null; staffId: string }[]> {
    const rows = await this.prisma.supervision.findMany({
      where: { agencyId: caller.agencyId, status: 'completed', acknowledgedAt: null, staffProfile: { userId: caller.userId } },
      select: { id: true, type: true, heldOn: true, staffProfileId: true },
      orderBy: { heldOn: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, type: r.type as SupervisionType, typeLabel: SUPERVISION_TYPE_LABELS[r.type as SupervisionType], heldOn: fromDate(r.heldOn), staffId: r.staffProfileId }));
  }

  /** Everyone's next supervision, appraisal and spot check: what's overdue, booked, or coming up. */
  async overview(agencyId: string): Promise<{ today: string; rows: SupervisionsOverviewRow[] }> {
    const [today, intervals] = await Promise.all([this.clock.todayString(agencyId), this.intervals(agencyId)]);
    const profiles = await this.prisma.staffProfile.findMany({
      where: { agencyId, isActive: true, user: { isActive: true } },
      select: {
        id: true,
        discipline: true,
        hireDate: true,
        user: { select: { firstName: true, lastName: true } },
        supervisions: { where: { status: { in: ['scheduled', 'completed'] } }, select: { id: true, type: true, status: true, heldOn: true, scheduledFor: true, acknowledgedAt: true } },
      },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      take: 1000,
    });
    return {
      today,
      rows: profiles.map((p) => ({
        staff: { id: p.id, name: `${p.user.firstName} ${p.user.lastName}`, discipline: p.discipline },
        due: dueFor(p.supervisions, fromDate(p.hireDate), today, intervals),
        awaitingSignature: p.supervisions.filter((s) => s.status === 'completed' && !s.acknowledgedAt).length,
      })),
    };
  }

  private async askToSign(caller: AuthUser, userId: string, id: string, type: SupervisionType): Promise<void> {
    await this.notifications.notify({
      agencyId: caller.agencyId,
      userIds: [userId],
      actorUserId: caller.userId,
      type: 'supervision',
      title: `Your ${SUPERVISION_TYPE_LABELS[type].toLowerCase()} record is ready to read and sign`,
      body: 'Open it in the app, add a comment if you want, and sign.',
      data: { supervisionId: id },
    });
  }

  private async findForManager(caller: AuthUser, id: string) {
    const row = await this.prisma.supervision.findFirst({
      where: { id, agencyId: caller.agencyId },
      select: { id: true, type: true, status: true, staffProfile: { select: { userId: true } } },
    });
    if (!row) throw new NotFoundException('Supervision not found');
    if (row.staffProfile.userId === caller.userId) throw new ForbiddenException('Someone else must hold your supervision');
    return row;
  }

  private async can(caller: AuthUser, permission: Permission): Promise<boolean> {
    return (await this.permissions.forUser(caller)).permissions.has(permission);
  }

  private view(s: SessionRow, withNotes: boolean): SessionView {
    return {
      id: s.id,
      type: s.type as SupervisionType,
      typeLabel: SUPERVISION_TYPE_LABELS[s.type as SupervisionType] ?? s.type,
      status: s.status,
      scheduledFor: fromDate(s.scheduledFor),
      heldOn: fromDate(s.heldOn),
      supervisor: s.supervisor ? { id: s.supervisor.id, name: `${s.supervisor.firstName} ${s.supervisor.lastName}` } : null,
      notes: withNotes && s.notesEncrypted ? this.crypto.decrypt(s.notesEncrypted, PhiContext.SupervisionNotes) : null,
      acknowledgedAt: s.acknowledgedAt,
      staffComment: withNotes && s.staffCommentEncrypted ? this.crypto.decrypt(s.staffCommentEncrypted, PhiContext.SupervisionComment) : null,
    };
  }
}

const uuid = () => new ParseUUIDPipe();

@ApiTags('staff')
@Controller()
export class SupervisionsController {
  constructor(private readonly supervisions: SupervisionsService) {}

  /** What's due and the records. Notes only for the person themselves and supervisions:manage holders. */
  @Audit({ action: 'VIEW_SUPERVISIONS', resourceType: 'supervisions' })
  @Get('staff/:id/supervisions')
  forStaff(@CurrentUser() caller: AuthUser, @Param('id', uuid()) id: string) {
    return this.supervisions.forStaff(caller, id);
  }

  @Permissions('supervisions:manage')
  @Audit({ action: 'CREATE_SUPERVISION', resourceType: 'supervisions' })
  @Post('staff/:id/supervisions')
  create(@CurrentUser() caller: AuthUser, @Param('id', uuid()) id: string, @Body() dto: CreateSupervisionDto) {
    return this.supervisions.create(caller, id, dto);
  }

  @Get('supervisions/mine/to-sign')
  toSign(@CurrentUser() caller: AuthUser) {
    return this.supervisions.toSign(caller);
  }

  @Permissions('staff:read')
  @Get('supervisions/overview')
  overview(@CurrentUser() caller: AuthUser) {
    return this.supervisions.overview(caller.agencyId);
  }

  @Permissions('supervisions:manage')
  @Audit({ action: 'COMPLETE_SUPERVISION', resourceType: 'supervisions' })
  @Post('supervisions/:id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@CurrentUser() caller: AuthUser, @Param('id', uuid()) id: string, @Body() dto: CompleteSupervisionDto) {
    return this.supervisions.complete(caller, id, dto);
  }

  @Permissions('supervisions:manage')
  @Audit({ action: 'CANCEL_SUPERVISION', resourceType: 'supervisions' })
  @Post('supervisions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() caller: AuthUser, @Param('id', uuid()) id: string) {
    return this.supervisions.cancel(caller, id);
  }

  @Audit({ action: 'SIGN_SUPERVISION', resourceType: 'supervisions' })
  @Post('supervisions/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  acknowledge(@CurrentUser() caller: AuthUser, @Param('id', uuid()) id: string, @Body() dto: AcknowledgeSupervisionDto) {
    return this.supervisions.acknowledge(caller, id, dto);
  }
}
