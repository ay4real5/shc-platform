import {
  COS_REFERENCE,
  SPONSOR_EVENT_LABELS,
  SPONSOR_EVENTS,
  SPONSORED_ROUTES,
  VISA_ALERT_DAYS,
  VISA_ROUTE_LABELS,
  VISA_ROUTES,
  sponsorReportDueBy,
  visaState,
  type SponsorEvent,
  type VisaRoute,
  type VisaState,
} from '@alora/shared';
import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { fromDate, toDate } from '../../common/utils/dates.js';
import { trimmed, upperTrimmed } from '../../common/validators/fields.js';
import { IsDateOnly } from '../../common/validators/is-date-only.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RegionQueryDto } from './dto/staff.dto.js';
import { StaffService } from './staff.service.js';

export class SaveVisaDto {
  @IsIn(VISA_ROUTES)
  route!: VisaRoute;

  /** This company is their sponsor. */
  @IsOptional()
  @IsBoolean()
  sponsored?: boolean;

  /** Certificate of Sponsorship reference, 10 letters and digits. */
  @IsOptional()
  @Transform(upperTrimmed)
  @Matches(COS_REFERENCE, { message: 'The CoS reference is 10 letters and numbers' })
  cosReference?: string;

  /** Job code on the CoS (SOC 2020, 4 digits). */
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'The job code is 4 digits, e.g. 6135' })
  socCode?: string;

  @IsOptional()
  @IsDateOnly()
  startedOn?: string;

  @IsDateOnly()
  expiresOn!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  weeklyHoursLimit?: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RecordSponsorReportDto {
  @IsIn(SPONSOR_EVENTS)
  event!: SponsorEvent;

  @IsDateOnly()
  happenedOn!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class MarkReportedDto {
  @IsDateOnly()
  reportedOn!: string;
}

export interface VisaView {
  route: VisaRoute;
  routeLabel: string;
  sponsored: boolean;
  cosReference: string | null;
  socCode: string | null;
  startedOn: string | null;
  expiresOn: string;
  state: VisaState;
  weeklyHoursLimit: number | null;
  notes: string | null;
  updatedAt: Date;
}

export interface SponsorReportView {
  id: string;
  event: SponsorEvent;
  eventLabel: string;
  happenedOn: string;
  dueBy: string;
  reportedOn: string | null;
  overdue: boolean;
  notes: string | null;
}

export interface SponsoredWorkerRow {
  staffId: string;
  name: string;
  discipline: string;
  region: string | null;
  visa: VisaView;
  openReports: SponsorReportView[];
}

/**
 * Sponsored workers (S5-04, DECISIONS S-031): each person's visa and Certificate of Sponsorship, the sponsor duties to
 * report changes within 10 working days, and a company-wide list for Home Office compliance visits. The visa end date is
 * kept on a `visa` credential too, so the usual expiry reminders and the "checks expiring" lists include it. SHC stores
 * and reminds; it gives no immigration advice.
 */
@Injectable()
export class SponsorshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
    private readonly clock: AgencyClockService,
  ) {}

  async get(caller: AuthUser, staffId: string): Promise<{ visa: VisaView | null; reports: SponsorReportView[] }> {
    await this.staff.assertSelfOr(caller, await this.staff.find(caller, staffId), 'staff:read');
    const [visa, reports, today] = await Promise.all([
      this.prisma.visaRecord.findUnique({ where: { staffProfileId: staffId } }),
      this.prisma.sponsorReport.findMany({ where: { staffProfileId: staffId, agencyId: caller.agencyId }, orderBy: { happenedOn: 'desc' } }),
      this.clock.todayString(caller.agencyId),
    ]);
    return { visa: visa ? visaView(visa, today) : null, reports: reports.map((r) => reportView(r, today)) };
  }

  async save(caller: AuthUser, staffId: string, dto: SaveVisaDto): Promise<{ visa: VisaView | null; reports: SponsorReportView[] }> {
    await this.staff.find(caller, staffId);
    const sponsored = dto.sponsored ?? SPONSORED_ROUTES.includes(dto.route);
    if (sponsored && !SPONSORED_ROUTES.includes(dto.route)) throw new BadRequestException(`A ${VISA_ROUTE_LABELS[dto.route]} isn't sponsored by an employer`);
    if (dto.startedOn && dto.startedOn > dto.expiresOn) throw new BadRequestException('The visa ends before it starts');
    const data = {
      route: dto.route,
      sponsored,
      cosReference: sponsored ? (dto.cosReference ?? null) : null,
      socCode: sponsored ? (dto.socCode ?? null) : null,
      startedOn: toDate(dto.startedOn) ?? null,
      expiresOn: toDate(dto.expiresOn)!,
      weeklyHoursLimit: dto.weeklyHoursLimit ?? null,
      notes: dto.notes ?? null,
      recordedById: caller.userId,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.visaRecord.upsert({ where: { staffProfileId: staffId }, create: { ...data, agencyId: caller.agencyId, staffProfileId: staffId }, update: data });
      // The end date on a credential: expiry alerts, the dashboard and "checks expiring" pick it up (D-062).
      const credential = await tx.staffCredential.findFirst({ where: { staffProfileId: staffId, credentialType: 'visa', status: 'active' } });
      const fields = { credentialName: VISA_ROUTE_LABELS[dto.route], credentialNumber: data.cosReference, expiryDate: data.expiresOn, alertDaysBefore: VISA_ALERT_DAYS };
      if (credential) {
        const moved = fromDate(credential.expiryDate) !== dto.expiresOn;
        await tx.staffCredential.update({ where: { id: credential.id }, data: { ...fields, ...(moved ? { expiryAlertStage: null } : {}) } });
      } else {
        await tx.staffCredential.create({ data: { staffProfileId: staffId, credentialType: 'visa', ...fields, verifiedById: caller.userId, verifiedAt: new Date() } });
      }
    });
    return this.get(caller, staffId);
  }

  async report(caller: AuthUser, staffId: string, dto: RecordSponsorReportDto): Promise<{ visa: VisaView | null; reports: SponsorReportView[] }> {
    await this.staff.find(caller, staffId);
    const visa = await this.prisma.visaRecord.findUnique({ where: { staffProfileId: staffId }, select: { sponsored: true } });
    if (!visa?.sponsored) throw new BadRequestException('Only sponsored workers have changes to report');
    const today = await this.clock.todayString(caller.agencyId);
    if (dto.happenedOn > today) throw new BadRequestException('Record a change once it has happened');
    await this.prisma.sponsorReport.create({
      data: {
        agencyId: caller.agencyId,
        staffProfileId: staffId,
        event: dto.event,
        happenedOn: toDate(dto.happenedOn)!,
        dueBy: toDate(sponsorReportDueBy(dto.happenedOn))!,
        notes: dto.notes ?? null,
        recordedById: caller.userId,
      },
    });
    return this.get(caller, staffId);
  }

  async markReported(caller: AuthUser, staffId: string, reportId: string, dto: MarkReportedDto): Promise<{ visa: VisaView | null; reports: SponsorReportView[] }> {
    await this.staff.find(caller, staffId);
    const report = await this.prisma.sponsorReport.findFirst({ where: { id: reportId, staffProfileId: staffId, agencyId: caller.agencyId } });
    if (!report) throw new NotFoundException('Report not found');
    if (dto.reportedOn < fromDate(report.happenedOn)!) throw new BadRequestException('It was reported before it happened?');
    await this.prisma.sponsorReport.update({ where: { id: reportId }, data: { reportedOn: toDate(dto.reportedOn), reportedById: caller.userId } });
    return this.get(caller, staffId);
  }

  /** Everyone with a visa on record (active staff), sponsored first, soonest-ending first; open reports alongside. */
  async list(caller: AuthUser, region?: string): Promise<SponsoredWorkerRow[]> {
    const today = await this.clock.todayString(caller.agencyId);
    const rows = await this.prisma.visaRecord.findMany({
      where: { agencyId: caller.agencyId, staffProfile: { isActive: true, ...(region ? { region } : {}) } },
      include: {
        staffProfile: {
          select: {
            id: true,
            discipline: true,
            region: true,
            user: { select: { firstName: true, lastName: true } },
            sponsorReports: { where: { reportedOn: null }, orderBy: { dueBy: 'asc' } },
          },
        },
      },
      orderBy: [{ sponsored: 'desc' }, { expiresOn: 'asc' }],
    });
    return rows.map((r) => ({
      staffId: r.staffProfile.id,
      name: `${r.staffProfile.user.firstName} ${r.staffProfile.user.lastName}`,
      discipline: r.staffProfile.discipline,
      region: r.staffProfile.region,
      visa: visaView(r, today),
      openReports: r.staffProfile.sponsorReports.map((x) => reportView(x, today)),
    }));
  }

  /** Changes not yet reported (for the dashboard): how many, and how many are past their 10 working days. */
  async openReportCounts(agencyId: string, region?: string): Promise<{ open: number; overdue: number }> {
    const today = await this.clock.todayString(agencyId);
    const where = { agencyId, reportedOn: null, staffProfile: region ? { region } : {} };
    const [open, overdue] = await Promise.all([
      this.prisma.sponsorReport.count({ where }),
      this.prisma.sponsorReport.count({ where: { ...where, dueBy: { lt: toDate(today) } } }),
    ]);
    return { open, overdue };
  }
}

function visaView(
  r: { route: string; sponsored: boolean; cosReference: string | null; socCode: string | null; startedOn: Date | null; expiresOn: Date; weeklyHoursLimit: number | null; notes: string | null; updatedAt: Date },
  today: string,
): VisaView {
  const expiresOn = fromDate(r.expiresOn)!;
  return {
    route: r.route as VisaRoute,
    routeLabel: VISA_ROUTE_LABELS[r.route as VisaRoute] ?? r.route,
    sponsored: r.sponsored,
    cosReference: r.cosReference,
    socCode: r.socCode,
    startedOn: fromDate(r.startedOn),
    expiresOn,
    state: visaState(expiresOn, today),
    weeklyHoursLimit: r.weeklyHoursLimit,
    notes: r.notes,
    updatedAt: r.updatedAt,
  };
}

function reportView(r: { id: string; event: string; happenedOn: Date; dueBy: Date; reportedOn: Date | null; notes: string | null }, today: string): SponsorReportView {
  const dueBy = fromDate(r.dueBy)!;
  const reportedOn = fromDate(r.reportedOn);
  return {
    id: r.id,
    event: r.event as SponsorEvent,
    eventLabel: SPONSOR_EVENT_LABELS[r.event as SponsorEvent] ?? r.event,
    happenedOn: fromDate(r.happenedOn)!,
    dueBy,
    reportedOn,
    overdue: !reportedOn && dueBy < today,
    notes: r.notes,
  };
}

@ApiTags('staff')
@Controller()
export class SponsorshipController {
  constructor(private readonly sponsorship: SponsorshipService) {}

  /** Everyone with a visa on record, for Home Office compliance visits (S-031). */
  @Permissions('staff:read')
  @Get('sponsorship')
  list(@CurrentUser() caller: AuthUser, @Query() query: RegionQueryDto) {
    return this.sponsorship.list(caller, query.region);
  }

  /** Their visa and sponsor reports (they may see their own). */
  @Get('staff/:id/visa')
  get(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sponsorship.get(caller, id);
  }

  @Permissions('staff:update')
  @Audit({ action: 'SAVE_VISA_RECORD', resourceType: 'staff' })
  @Put('staff/:id/visa')
  save(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveVisaDto) {
    return this.sponsorship.save(caller, id, dto);
  }

  @Permissions('staff:update')
  @Audit({ action: 'RECORD_SPONSOR_CHANGE', resourceType: 'staff' })
  @Post('staff/:id/sponsor-reports')
  report(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordSponsorReportDto) {
    return this.sponsorship.report(caller, id, dto);
  }

  @Permissions('staff:update')
  @Audit({ action: 'MARK_SPONSOR_CHANGE_REPORTED', resourceType: 'staff' })
  @Post('staff/:id/sponsor-reports/:reportId/reported')
  markReported(
    @CurrentUser() caller: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: MarkReportedDto,
  ) {
    return this.sponsorship.markReported(caller, id, reportId, dto);
  }
}
