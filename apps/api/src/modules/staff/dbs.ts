import {
  DBS_ALERT_DAYS,
  DBS_CERTIFICATE_NUMBER,
  DBS_DECISIONS,
  DBS_LEVEL_LABELS,
  DBS_LEVELS,
  DBS_LEVELS_FOR_CARE,
  DBS_RESULTS,
  DBS_STATUS_RESULTS,
  dbsNextDue,
  type DbsLevel,
} from '@alora/shared';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { fromDate, toDate } from '../../common/utils/dates.js';
import { IsDateOnly } from '../../common/validators/is-date-only.js';
import { trimmed } from '../../common/validators/fields.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { StaffService } from './staff.service.js';

export class RecordDbsDto {
  /** The 12-digit number on the certificate (spaces are fine). */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s/g, '') : value))
  @Matches(DBS_CERTIFICATE_NUMBER, { message: 'certificateNumber must be the 12-digit DBS certificate number' })
  certificateNumber!: string;

  @IsDateOnly({ notInFuture: true })
  issueDate!: string;

  @IsIn(DBS_LEVELS)
  level!: DbsLevel;

  /** clear, or information (what it shows is never recorded here). */
  @IsIn(DBS_RESULTS)
  result!: (typeof DBS_RESULTS)[number];

  /** Subscribed to the DBS Update Service (status checks instead of new certificates). */
  @IsOptional()
  @IsBoolean()
  updateService?: boolean;

  /** Never write what the certificate says. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class DbsDecisionDto {
  @IsIn(DBS_DECISIONS)
  decision!: (typeof DBS_DECISIONS)[number];
}

export class DbsStatusCheckDto {
  @IsDateOnly({ notInFuture: true })
  checkedOn!: string;

  @IsIn(DBS_STATUS_RESULTS)
  result!: (typeof DBS_STATUS_RESULTS)[number];
}

export interface DbsView {
  id: string;
  certificateNumber: string;
  issueDate: string;
  level: string;
  levelLabel: string;
  result: string;
  decision: string | null;
  decidedBy: { id: string; name: string } | null;
  updateService: boolean;
  nextDueOn: string;
  /** Whether this certificate lets them start care work: the right level, and clear or approved. */
  acceptable: boolean;
  recordedBy: { id: string; name: string } | null;
  notes: string | null;
  statusChecks: { checkedOn: string; result: string; checkedBy: { id: string; name: string } | null }[];
  createdAt: Date;
}

type CheckRow = Prisma.DbsCheckGetPayload<{ include: { statusChecks: true } }>;

/**
 * DBS checks (S2-02). The newest certificate (by issue date) drives the staff member's `dbs_enhanced` credential:
 * expiry = next status check (Update Service) or re-check date, so the expiry alerts and onboarding checklist follow
 * it. A certificate that shows information doesn't count until a manager (compliance:update) approves it.
 */
@Injectable()
export class DbsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
  ) {}

  async list(caller: AuthUser, staffId: string): Promise<DbsView[]> {
    await this.staff.assertSelfOr(caller, await this.staff.find(caller, staffId), 'staff:read');
    const rows = await this.prisma.dbsCheck.findMany({
      where: { staffProfileId: staffId },
      include: { statusChecks: { orderBy: { checkedOn: 'desc' } } },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    });
    const names = await this.names(rows.flatMap((r) => [r.recordedById, r.decidedById, ...r.statusChecks.map((s) => s.checkedById)]), caller.agencyId);
    return rows.map((r) => toView(r, names));
  }

  async record(caller: AuthUser, staffId: string, dto: RecordDbsDto): Promise<DbsView> {
    const profile = await this.staff.find(caller, staffId);
    const updateService = dto.updateService ?? false;
    const row = await this.prisma.$transaction(async (tx) => {
      const check = await tx.dbsCheck.create({
        data: {
          agencyId: caller.agencyId,
          staffProfileId: profile.id,
          certificateNumber: dto.certificateNumber,
          issueDate: toDate(dto.issueDate)!,
          level: dto.level,
          result: dto.result,
          updateService,
          nextDueOn: toDate(dbsNextDue({ issueDate: dto.issueDate, updateService }))!,
          recordedById: caller.userId,
          notes: dto.notes || null,
        },
        include: { statusChecks: true },
      });
      await syncCredential(tx, profile.id, caller.userId);
      return check;
    });
    return toView(row, await this.names([row.recordedById], caller.agencyId));
  }

  /** A manager's decision on a certificate that shows information. */
  async decide(caller: AuthUser, staffId: string, checkId: string, decision: 'approved' | 'not_approved'): Promise<DbsView> {
    const check = await this.find(caller, staffId, checkId);
    if (check.result !== 'information') throw new ConflictException('Only a certificate that shows information needs a decision');
    if (check.staffProfile.userId === caller.userId) throw new ConflictException('Someone else must decide on your own DBS check');
    await this.prisma.$transaction(async (tx) => {
      await tx.dbsCheck.update({ where: { id: check.id }, data: { decision, decidedById: caller.userId, decidedAt: new Date() } });
      await syncCredential(tx, check.staffProfileId, caller.userId);
    });
    return this.one(caller, check.id);
  }

  /** An Update Service status check. "New information" means the certificate no longer counts: get a new one. */
  async statusCheck(caller: AuthUser, staffId: string, checkId: string, dto: DbsStatusCheckDto): Promise<DbsView> {
    const check = await this.find(caller, staffId, checkId);
    if (!check.updateService) throw new ConflictException('This certificate is not on the Update Service');
    if (dto.checkedOn < fromDate(check.issueDate)!) throw new BadRequestException('A status check cannot be before the certificate was issued');
    await this.prisma.$transaction(async (tx) => {
      await tx.dbsStatusCheck.create({ data: { dbsCheckId: check.id, checkedOn: toDate(dto.checkedOn)!, result: dto.result, checkedById: caller.userId } });
      await tx.dbsCheck.update({
        where: { id: check.id },
        data:
          dto.result === 'no_change'
            ? { nextDueOn: toDate(dbsNextDue({ issueDate: fromDate(check.issueDate)!, updateService: true, lastStatusCheckOn: dto.checkedOn }))! }
            : { nextDueOn: toDate(dto.checkedOn)!, statusChanged: true },
      });
      await syncCredential(tx, check.staffProfileId, caller.userId);
    });
    return this.one(caller, check.id);
  }

  private async find(caller: AuthUser, staffId: string, checkId: string) {
    await this.staff.find(caller, staffId);
    const check = await this.prisma.dbsCheck.findFirst({ where: { id: checkId, staffProfileId: staffId, agencyId: caller.agencyId }, include: { staffProfile: { select: { userId: true } } } });
    if (!check) throw new NotFoundException('DBS check not found');
    return check;
  }

  private async one(caller: AuthUser, id: string): Promise<DbsView> {
    const row = await this.prisma.dbsCheck.findUniqueOrThrow({ where: { id }, include: { statusChecks: { orderBy: { checkedOn: 'desc' } } } });
    const names = await this.names([row.recordedById, row.decidedById, ...row.statusChecks.map((s) => s.checkedById)], caller.agencyId);
    return toView(row, names);
  }

  private async names(ids: (string | null)[], agencyId: string) {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const users = wanted.length ? await this.prisma.user.findMany({ where: { id: { in: wanted }, agencyId }, select: { id: true, firstName: true, lastName: true } }) : [];
    return new Map(users.map((u) => [u.id, { id: u.id, name: `${u.firstName} ${u.lastName}` }]));
  }
}

const acceptable = (c: { level: string; result: string; decision: string | null; statusChanged: boolean }) =>
  (DBS_LEVELS_FOR_CARE as readonly string[]).includes(c.level) && !c.statusChanged && (c.result === 'clear' || c.decision === 'approved');

/**
 * Points the `dbs_enhanced` credential at the newest certificate. If that certificate doesn't count (wrong level,
 * undecided or refused information, or new information on the Update Service), the credential is marked expired today
 * so the person shows as not ready — never as cleared.
 */
async function syncCredential(tx: Prisma.TransactionClient, staffProfileId: string, actorId: string): Promise<void> {
  const latest = await tx.dbsCheck.findFirst({ where: { staffProfileId }, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }] });
  if (!latest) return;
  const ok = acceptable(latest);
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const data = {
    credentialName: `DBS: ${DBS_LEVEL_LABELS[latest.level as DbsLevel] ?? latest.level}`,
    credentialNumber: latest.certificateNumber,
    issuingAuthority: 'Disclosure and Barring Service',
    issueDate: latest.issueDate,
    expiryDate: ok ? latest.nextDueOn : today,
    alertDaysBefore: DBS_ALERT_DAYS,
    expiryAlertStage: null,
    status: 'active',
    verifiedById: actorId,
    verifiedAt: new Date(),
    notes: ok ? (latest.updateService ? 'On the DBS Update Service: status check due on the expiry date.' : 'New DBS check due on the expiry date.') : 'Not cleared to start: see the DBS section.',
  };
  const existing = await tx.staffCredential.findFirst({ where: { staffProfileId, credentialType: 'dbs_enhanced' }, orderBy: { createdAt: 'desc' } });
  if (existing) await tx.staffCredential.update({ where: { id: existing.id }, data });
  else await tx.staffCredential.create({ data: { ...data, staffProfileId, credentialType: 'dbs_enhanced' } });
}

function toView(r: CheckRow, names: Map<string, { id: string; name: string }>): DbsView {
  return {
    id: r.id,
    certificateNumber: r.certificateNumber,
    issueDate: fromDate(r.issueDate)!,
    level: r.level,
    levelLabel: DBS_LEVEL_LABELS[r.level as DbsLevel] ?? r.level,
    result: r.result,
    decision: r.decision,
    decidedBy: r.decidedById ? (names.get(r.decidedById) ?? null) : null,
    updateService: r.updateService,
    nextDueOn: fromDate(r.nextDueOn)!,
    acceptable: acceptable(r),
    recordedBy: names.get(r.recordedById) ?? null,
    notes: r.notes,
    statusChecks: r.statusChecks.map((s) => ({ checkedOn: fromDate(s.checkedOn)!, result: s.result, checkedBy: names.get(s.checkedById) ?? null })),
    createdAt: r.createdAt,
  };
}

@ApiTags('staff')
@Controller('staff')
export class DbsController {
  constructor(private readonly dbs: DbsService) {}

  @Get(':id/dbs')
  list(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.dbs.list(caller, id);
  }

  @Permissions('staff:update')
  @Audit({ action: 'RECORD_DBS_CHECK', resourceType: 'staff' })
  @Post(':id/dbs')
  record(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordDbsDto) {
    return this.dbs.record(caller, id, dto);
  }

  /** Managers only: the risk-assessment decision on a certificate that shows information. */
  @Permissions('compliance:update')
  @Audit({ action: 'DBS_DECISION', resourceType: 'staff' })
  @Post(':id/dbs/:checkId/decision')
  decide(
    @CurrentUser() caller: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('checkId', ParseUUIDPipe) checkId: string,
    @Body() dto: DbsDecisionDto,
  ) {
    return this.dbs.decide(caller, id, checkId, dto.decision);
  }

  @Permissions('staff:update')
  @Audit({ action: 'DBS_STATUS_CHECK', resourceType: 'staff' })
  @Post(':id/dbs/:checkId/status-checks')
  statusCheck(
    @CurrentUser() caller: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('checkId', ParseUUIDPipe) checkId: string,
    @Body() dto: DbsStatusCheckDto,
  ) {
    return this.dbs.statusCheck(caller, id, checkId, dto);
  }
}
