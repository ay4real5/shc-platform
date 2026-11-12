import {
  normaliseShareCode,
  RTW_ALERT_DAYS,
  RTW_DOCUMENT_TYPES,
  RTW_DOCUMENTS,
  RTW_METHOD_LABELS,
  RTW_METHODS,
  RTW_PERMISSIONS,
  RTW_SEEN_HOW,
  rtwFollowUpDate,
  SHARE_CODE,
  type RtwDocumentType,
} from '@alora/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { addDays, fromDate, toDate } from '../../common/utils/dates.js';
import { IsDateOnly } from '../../common/validators/is-date-only.js';
import { trimmed } from '../../common/validators/fields.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StaffService } from './staff.service.js';

export class RecordRightToWorkDto {
  @IsIn(RTW_METHODS)
  method!: (typeof RTW_METHODS)[number];

  /** Online checks: the share code the person gave you (spaces are fine). */
  @ValidateIf((o: RecordRightToWorkDto) => o.method === 'share_code')
  @Transform(({ value }) => (typeof value === 'string' ? normaliseShareCode(value) : value))
  @Matches(SHARE_CODE, { message: 'shareCode must be the 9-character share code' })
  shareCode?: string;

  /** Manual checks: which document (RTW_DOCUMENTS). */
  @ValidateIf((o: RecordRightToWorkDto) => o.method === 'manual_document')
  @IsIn(RTW_DOCUMENT_TYPES)
  documentType?: RtwDocumentType;

  /** Manual checks: originals seen with the holder in person, or on a live video call. */
  @ValidateIf((o: RecordRightToWorkDto) => o.method === 'manual_document')
  @IsIn(RTW_SEEN_HOW)
  seenHow?: (typeof RTW_SEEN_HOW)[number];

  @IsIn(RTW_PERMISSIONS)
  permission!: (typeof RTW_PERMISSIONS)[number];

  /** Time-limited permission: the date it ends. */
  @ValidateIf((o: RecordRightToWorkDto) => o.permission === 'time_limited' && o.documentType !== 'positive_verification_notice')
  @IsDateOnly()
  permissionExpiresOn?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  restrictions?: string;

  @IsIn(['passed', 'failed'])
  outcome!: 'passed' | 'failed';

  @IsDateOnly({ notInFuture: true })
  checkedOn!: string;

  /** The saved evidence (a document on this person's file). */
  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class FollowUpsQueryDto {
  /** Follow-ups due within this many days (and overdue ones). Default 60. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  withinDays: number = 60;
}

export interface RightToWorkView {
  id: string;
  method: string;
  methodLabel: string;
  /** Only the last 3 characters: a share code is a key to the person's immigration record. */
  shareCodeEnding: string | null;
  documentType: string | null;
  documentLabel: string | null;
  seenHow: string | null;
  permission: string;
  permissionExpiresOn: string | null;
  followUpOn: string | null;
  restrictions: string | null;
  outcome: string;
  checkedOn: string;
  checkedBy: { id: string; name: string } | null;
  documentId: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface FollowUpView {
  staff: { id: string; firstName: string; lastName: string; discipline: string };
  followUpOn: string;
  overdue: boolean;
  checkId: string;
}

/**
 * Right to Work checks (S2-01). Recording a check never edits an old one: the history is the audit trail the Home
 * Office asks employers to keep. A passed check sets the `right_to_work` credential (expiry = follow-up date), so
 * the onboarding checklist, "Checks & expiries" and expiry alerts all follow it.
 */
@Injectable()
export class RightToWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
    private readonly clock: AgencyClockService,
  ) {}

  async list(caller: AuthUser, staffId: string): Promise<RightToWorkView[]> {
    await this.staff.assertSelfOr(caller, await this.staff.find(caller, staffId), 'staff:read');
    const rows = await this.prisma.rightToWorkCheck.findMany({ where: { staffProfileId: staffId }, orderBy: [{ checkedOn: 'desc' }, { createdAt: 'desc' }] });
    const names = await this.names(rows.map((r) => r.checkedById), caller.agencyId);
    return rows.map((r) => toView(r, names));
  }

  async record(caller: AuthUser, staffId: string, dto: RecordRightToWorkDto): Promise<RightToWorkView> {
    const profile = await this.staff.find(caller, staffId);
    if (dto.method === 'idsp') throw new BadRequestException('Digital ID checks will be added later; record a share code or manual check');
    if (dto.permissionExpiresOn && dto.permissionExpiresOn < dto.checkedOn) {
      throw new BadRequestException('Permission that has already ended cannot pass a Right to Work check');
    }
    if (dto.method === 'manual_document' && dto.documentType && RTW_DOCUMENTS[dto.documentType].list === 'A' && dto.permission !== 'unlimited') {
      throw new BadRequestException('List A documents show permission with no time limit');
    }
    if (dto.documentId) {
      const doc = await this.prisma.document.count({ where: { id: dto.documentId, agencyId: caller.agencyId, staffId, deletedAt: null } });
      if (!doc) throw new BadRequestException('The evidence must be a document on this person’s file');
    }
    const followUp = rtwFollowUpDate({
      method: dto.method,
      documentType: dto.documentType ?? null,
      permission: dto.permission,
      permissionExpiresOn: dto.permissionExpiresOn ?? null,
      checkedOn: dto.checkedOn,
    });

    const row = await this.prisma.$transaction(async (tx) => {
      const check = await tx.rightToWorkCheck.create({
        data: {
          agencyId: caller.agencyId,
          staffProfileId: profile.id,
          method: dto.method,
          shareCode: dto.method === 'share_code' ? (dto.shareCode ?? null) : null,
          documentType: dto.method === 'manual_document' ? (dto.documentType ?? null) : null,
          seenHow: dto.method === 'manual_document' ? (dto.seenHow ?? null) : null,
          permission: dto.permission,
          permissionExpiresOn: toDate(dto.permissionExpiresOn) ?? null,
          followUpOn: dto.outcome === 'passed' ? (toDate(followUp ?? undefined) ?? null) : null,
          restrictions: dto.restrictions || null,
          outcome: dto.outcome,
          checkedOn: toDate(dto.checkedOn)!,
          checkedById: caller.userId,
          documentId: dto.documentId ?? null,
          notes: dto.notes || null,
        },
      });
      // The credential follows the most recent passed check by check date (an older check entered late doesn't win).
      const newer = await tx.rightToWorkCheck.count({
        where: { staffProfileId: profile.id, outcome: 'passed', checkedOn: { gt: toDate(dto.checkedOn)! }, id: { not: check.id } },
      });
      if (dto.outcome === 'passed' && !newer) {
        const name = `Right to Work: ${dto.method === 'share_code' ? 'share code check' : 'document check'}`;
        const credential = {
          credentialName: name,
          issuingAuthority: 'Home Office',
          issueDate: toDate(dto.checkedOn)!,
          expiryDate: toDate(followUp ?? undefined) ?? null,
          alertDaysBefore: RTW_ALERT_DAYS,
          expiryAlertStage: null,
          status: 'active',
          verifiedById: caller.userId,
          verifiedAt: new Date(),
          documentId: dto.documentId ?? null,
          notes: dto.restrictions ? `Restrictions: ${dto.restrictions}` : null,
        };
        const existing = await tx.staffCredential.findFirst({ where: { staffProfileId: profile.id, credentialType: 'right_to_work' }, orderBy: { createdAt: 'desc' } });
        if (existing) await tx.staffCredential.update({ where: { id: existing.id }, data: credential });
        else await tx.staffCredential.create({ data: { ...credential, staffProfileId: profile.id, credentialType: 'right_to_work' } });
      }
      return check;
    });
    const names = await this.names([row.checkedById], caller.agencyId);
    return toView(row, names);
  }

  /** Everyone whose latest passed check needs a follow-up within `withinDays` (or is overdue). Active staff only. */
  async followUps(caller: AuthUser, withinDays: number): Promise<FollowUpView[]> {
    const today = await this.clock.todayString(caller.agencyId);
    const horizon = toDate(addDays(today, withinDays))!;
    const latest = await this.prisma.rightToWorkCheck.findMany({
      where: { agencyId: caller.agencyId, outcome: 'passed', staffProfile: { isActive: true } },
      orderBy: [{ staffProfileId: 'asc' }, { checkedOn: 'desc' }, { createdAt: 'desc' }],
      distinct: ['staffProfileId'],
      include: { staffProfile: { select: { id: true, discipline: true, user: { select: { firstName: true, lastName: true } } } } },
    });
    return latest
      .filter((c) => c.followUpOn && c.followUpOn <= horizon)
      .sort((a, b) => a.followUpOn!.getTime() - b.followUpOn!.getTime())
      .map((c) => ({
        staff: { id: c.staffProfile.id, firstName: c.staffProfile.user.firstName, lastName: c.staffProfile.user.lastName, discipline: c.staffProfile.discipline },
        followUpOn: fromDate(c.followUpOn)!,
        overdue: fromDate(c.followUpOn)! < today,
        checkId: c.id,
      }));
  }

  private async names(ids: string[], agencyId: string) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] }, agencyId }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, { id: u.id, name: `${u.firstName} ${u.lastName}` }]));
  }
}

function toView(
  r: {
    id: string;
    method: string;
    shareCode: string | null;
    documentType: string | null;
    seenHow: string | null;
    permission: string;
    permissionExpiresOn: Date | null;
    followUpOn: Date | null;
    restrictions: string | null;
    outcome: string;
    checkedOn: Date;
    checkedById: string;
    documentId: string | null;
    notes: string | null;
    createdAt: Date;
  },
  names: Map<string, { id: string; name: string }>,
): RightToWorkView {
  return {
    id: r.id,
    method: r.method,
    methodLabel: RTW_METHOD_LABELS[r.method as keyof typeof RTW_METHOD_LABELS] ?? r.method,
    shareCodeEnding: r.shareCode ? r.shareCode.slice(-3) : null,
    documentType: r.documentType,
    documentLabel: r.documentType ? (RTW_DOCUMENTS[r.documentType as RtwDocumentType]?.label ?? r.documentType) : null,
    seenHow: r.seenHow,
    permission: r.permission,
    permissionExpiresOn: fromDate(r.permissionExpiresOn),
    followUpOn: fromDate(r.followUpOn),
    restrictions: r.restrictions,
    outcome: r.outcome,
    checkedOn: fromDate(r.checkedOn)!,
    checkedBy: names.get(r.checkedById) ?? null,
    documentId: r.documentId,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

@ApiTags('staff')
@Controller('staff')
export class RightToWorkController {
  constructor(private readonly rtw: RightToWorkService) {}

  /** Staff whose Right to Work follow-up check is due soon or overdue. */
  @Permissions('staff:read')
  @Get('right-to-work/follow-ups')
  followUps(@CurrentUser() caller: AuthUser, @Query() query: FollowUpsQueryDto) {
    return this.rtw.followUps(caller, query.withinDays);
  }

  /** The person's checks, newest first (they may see their own). */
  @Get(':id/right-to-work')
  list(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rtw.list(caller, id);
  }

  @Permissions('staff:update')
  @Audit({ action: 'RECORD_RIGHT_TO_WORK_CHECK', resourceType: 'staff' })
  @Post(':id/right-to-work')
  record(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordRightToWorkDto) {
    return this.rtw.record(caller, id, dto);
  }
}
