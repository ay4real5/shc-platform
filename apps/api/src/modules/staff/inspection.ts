import { DBS_LEVEL_LABELS, RTW_METHOD_LABELS, inspectionItems, inspectionSummary, type DbsLevel, type InspectionItem } from '@alora/shared';
import { BadRequestException, Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { fromDate } from '../../common/utils/dates.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { healthStatus } from './health.js';

export class InspectionPacksQueryDto {
  /** Staff IDs, comma separated (up to 100). */
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export interface InspectionPerson {
  staffId: string;
  name: string;
  discipline: string;
  employeeId: string | null;
  hireDate: string | null;
  isActive: boolean;
}

export interface InspectionOverviewRow extends InspectionPerson {
  counts: { ok: number; paper: number; attention: number; missing: number };
  ready: boolean;
  /** Titles of the missing items. */
  missing: string[];
}

export interface InspectionPack extends InspectionPerson {
  items: InspectionItem[];
  counts: { ok: number; paper: number; attention: number; missing: number };
  ready: boolean;
  /** Their documents on file (titles only), newest first. */
  documents: { id: string; title: string; documentType: string; createdAt: Date }[];
}

const SELECT = {
  id: true,
  discipline: true,
  employeeId: true,
  hireDate: true,
  isActive: true,
  user: { select: { id: true, firstName: true, lastName: true } },
  rightToWorkChecks: { where: { outcome: 'passed' }, orderBy: [{ checkedOn: 'desc' }, { createdAt: 'desc' }], take: 1 },
  dbsChecks: { orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }], take: 1, include: { statusChecks: { orderBy: { checkedOn: 'desc' }, take: 1 } } },
  credentials: { where: { status: 'active' }, orderBy: { createdAt: 'desc' } },
  healthDeclaration: { select: { outcome: true } },
  supervisions: { where: { status: 'completed', type: { in: ['supervision', 'appraisal'] } }, orderBy: { heldOn: 'desc' }, select: { type: true, heldOn: true } },
  documents: { where: { deletedAt: null, nextVersion: null }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, documentType: true, createdAt: true } },
} satisfies Prisma.StaffProfileSelect;

/**
 * CQC inspection pack (S4-02, DECISIONS S-020): each person's staff file against Regulation 19 / Schedule 3, from the
 * records SHC already holds. Read-only. Shows status and dates, never health answers or what a DBS certificate says.
 */
@Injectable()
export class InspectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AgencyClockService,
  ) {}

  /** Every active staff member, least ready first. */
  async overview(caller: AuthUser): Promise<InspectionOverviewRow[]> {
    const packs = await this.build(caller, { isActive: true });
    return packs
      .map(({ items, documents: _documents, ...rest }) => ({ ...rest, missing: items.filter((i) => i.status === 'missing').map((i) => i.title) }))
      .sort((a, b) => b.counts.missing - a.counts.missing || b.counts.attention - a.counts.attention || a.name.localeCompare(b.name));
  }

  /** Packs for chosen people, with the company name and the date, for the cover page. */
  async packs(caller: AuthUser, ids: string[]): Promise<{ company: string; generatedOn: string; packs: InspectionPack[] }> {
    const packs = await this.build(caller, { id: { in: [...new Set(ids)] } });
    if (packs.length !== new Set(ids).size) throw new BadRequestException('Some of these people are not in your company');
    const [agency, generatedOn] = await Promise.all([
      this.prisma.agency.findUniqueOrThrow({ where: { id: caller.agencyId }, select: { name: true } }),
      this.clock.todayString(caller.agencyId),
    ]);
    return { company: agency.name, generatedOn, packs: packs.sort((a, b) => a.name.localeCompare(b.name)) };
  }

  private async build(caller: AuthUser, where: { isActive?: boolean; id?: { in: string[] } }): Promise<InspectionPack[]> {
    const [rows, today] = await Promise.all([
      this.prisma.staffProfile.findMany({ where: { ...where, agencyId: caller.agencyId }, select: SELECT }),
      this.clock.todayString(caller.agencyId),
    ]);
    const userIds = rows.map((r) => r.user.id);
    const apps = await this.prisma.application.findMany({
      where: { agencyId: caller.agencyId, hiredUserId: { in: userIds } },
      select: { hiredUserId: true, referenceRequests: { where: { status: 'received', verifiedAt: { not: null } }, select: { refereeId: true } } },
    });
    const recruitment = new Map(apps.map((a) => [a.hiredUserId!, new Set(a.referenceRequests.map((r) => r.refereeId)).size]));

    return rows.map((r) => {
      const rtw = r.rightToWorkChecks[0];
      const dbs = r.dbsChecks[0];
      const newest = new Map<string, (typeof r.credentials)[number]>();
      for (const c of r.credentials) if (!newest.has(c.credentialType)) newest.set(c.credentialType, c);
      const documentTypes: Record<string, number> = {};
      for (const d of r.documents) documentTypes[d.documentType] = (documentTypes[d.documentType] ?? 0) + 1;
      const last = (type: string) => fromDate(r.supervisions.find((s) => s.type === type && s.heldOn)?.heldOn ?? null);

      const items = inspectionItems(
        {
          discipline: r.discipline,
          hireDate: fromDate(r.hireDate),
          rightToWork: rtw
            ? {
                method: rtw.method,
                methodLabel: RTW_METHOD_LABELS[rtw.method as keyof typeof RTW_METHOD_LABELS] ?? rtw.method,
                checkedOn: fromDate(rtw.checkedOn)!,
                permission: rtw.permission,
                followUpOn: fromDate(rtw.followUpOn),
                hasDocument: Boolean(rtw.documentId),
              }
            : null,
          dbs: dbs
            ? {
                certificateNumber: dbs.certificateNumber,
                issueDate: fromDate(dbs.issueDate)!,
                levelLabel: DBS_LEVEL_LABELS[dbs.level as DbsLevel] ?? dbs.level,
                result: dbs.result,
                decision: dbs.decision,
                updateService: dbs.updateService,
                statusChanged: dbs.statusChanged,
                nextDueOn: fromDate(dbs.nextDueOn)!,
                lastStatusCheckOn: fromDate(dbs.statusChecks[0]?.checkedOn ?? null),
              }
            : null,
          credentials: [...newest.values()].map((c) => ({
            type: c.credentialType.trim().toLowerCase().replaceAll(/\s+/g, '_'),
            name: c.credentialName,
            number: c.credentialNumber,
            issueDate: fromDate(c.issueDate),
            expiryDate: fromDate(c.expiryDate),
            verified: Boolean(c.verifiedById),
            hasDocument: Boolean(c.documentId),
            notes: c.notes,
          })),
          verifiedReferences: recruitment.get(r.user.id) ?? 0,
          fromApplication: recruitment.has(r.user.id),
          health: healthStatus(r.healthDeclaration),
          lastSupervision: last('supervision'),
          lastAppraisal: last('appraisal'),
          documentTypes,
        },
        today,
      );
      const { ready, ...counts } = inspectionSummary(items);
      return {
        staffId: r.id,
        name: `${r.user.firstName} ${r.user.lastName}`,
        discipline: r.discipline,
        employeeId: r.employeeId,
        hireDate: fromDate(r.hireDate),
        isActive: r.isActive,
        items,
        counts,
        ready,
        documents: r.documents,
      };
    });
  }
}

@ApiTags('compliance')
@Controller('inspection')
export class InspectionController {
  constructor(private readonly inspection: InspectionService) {}

  /** Team health check: every active person's staff file, least ready first. */
  @Permissions('compliance:read', 'staff:read')
  @Get('overview')
  overview(@CurrentUser() caller: AuthUser) {
    return this.inspection.overview(caller);
  }

  /** Full packs for the people an inspector asked about (?ids=a,b,c). */
  @Permissions('compliance:read', 'staff:read')
  @Audit({ action: 'INSPECTION_PACK' })
  @Get('packs')
  packs(@CurrentUser() caller: AuthUser, @Query() query: InspectionPacksQueryDto) {
    return this.inspection.packs(caller, query.ids);
  }
}
