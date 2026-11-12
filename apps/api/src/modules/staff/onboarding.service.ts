import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_REQUIRED_CREDENTIALS, DISCIPLINES, onboardingChecklist, type Discipline, type OnboardingChecklist } from '@alora/shared';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { healthStatus } from './health.js';

export type RequiredCredentials = Record<Discipline, string[]>;

const SELECT = {
  id: true,
  userId: true,
  discipline: true,
  hireDate: true,
  hourlyRate: true,
  addressLine1: true,
  town: true,
  postcode: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  user: { select: { firstName: true, lastName: true, phone: true, lastLoginAt: true } },
  _count: { select: { availability: true } },
  credentials: { where: { status: 'active' }, select: { credentialType: true, expiryDate: true } },
  signatureRequests: { where: { status: { not: 'cancelled' } }, select: { status: true } },
  healthDeclaration: { select: { outcome: true } },
} as const;
type Row = Prisma.StaffProfileGetPayload<{ select: typeof SELECT }>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const normalize = (types: string[]) => [...new Set(types.map((t) => t.trim().toLowerCase().replaceAll(/\s+/g, '_')).filter(Boolean))];

/**
 * Caregiver onboarding checklist (D-101): what's still missing before someone is ready to work — profile, pay,
 * availability and the credentials their discipline needs (agency setting, with defaults). Computed on demand.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AgencyClockService,
  ) {}

  async requirements(agencyId: string): Promise<RequiredCredentials> {
    const agency = await this.prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { settings: true } });
    const saved = isObject(agency.settings) && isObject(agency.settings.onboardingRequirements) ? agency.settings.onboardingRequirements : {};
    return Object.fromEntries(
      DISCIPLINES.map((d) => [d, Array.isArray(saved[d]) ? normalize(saved[d] as string[]) : DEFAULT_REQUIRED_CREDENTIALS[d]]),
    ) as RequiredCredentials;
  }

  async setRequirements(caller: AuthUser, value: Partial<Record<string, string[]>>): Promise<RequiredCredentials> {
    const unknown = Object.keys(value).filter((k) => !(DISCIPLINES as readonly string[]).includes(k));
    if (unknown.length) throw new BadRequestException(`Unknown discipline: ${unknown.join(', ')}`);
    const current = await this.requirements(caller.agencyId);
    for (const [d, types] of Object.entries(value)) {
      if (!Array.isArray(types) || types.some((t) => typeof t !== 'string' || t.length > 100) || types.length > 30) {
        throw new BadRequestException(`${d}: give a list of credential types`);
      }
      current[d as Discipline] = normalize(types);
    }
    const agency = await this.prisma.agency.findUniqueOrThrow({ where: { id: caller.agencyId }, select: { settings: true } });
    const settings = { ...(isObject(agency.settings) ? agency.settings : {}), onboardingRequirements: current } as Prisma.InputJsonObject;
    await this.prisma.agency.update({ where: { id: caller.agencyId }, data: { settings } });
    return current;
  }

  /**
   * Recruitment facts per user (S2-06): hired through an application (so the history with gaps explained is on file),
   * and how many of that application's references were received and verified.
   */
  private async recruitment(agencyId: string, userIds: string[]): Promise<Map<string, { fromApplication: boolean; verifiedReferences: number }>> {
    const apps = await this.prisma.application.findMany({
      where: { agencyId, hiredUserId: { in: userIds } },
      select: { hiredUserId: true, referenceRequests: { where: { status: 'received', verifiedAt: { not: null } }, select: { refereeId: true } } },
    });
    return new Map(apps.map((a) => [a.hiredUserId!, { fromApplication: true, verifiedReferences: new Set(a.referenceRequests.map((r) => r.refereeId)).size }]));
  }

  private checklist(row: Row, requirements: RequiredCredentials, today: string, recruitment?: { fromApplication: boolean; verifiedReferences: number }): OnboardingChecklist {
    const valid: string[] = [];
    const expired: string[] = [];
    for (const c of row.credentials) {
      const type = normalize([c.credentialType])[0]!;
      if (!c.expiryDate || c.expiryDate.toISOString().slice(0, 10) >= today) valid.push(type);
      else expired.push(type);
    }
    return onboardingChecklist(
      {
        signedIn: Boolean(row.user.lastLoginAt),
        hasPhone: Boolean(row.user.phone),
        hasAddress: Boolean(row.addressLine1 && row.town && row.postcode),
        hasHireDate: Boolean(row.hireDate),
        hasPayRate: row.hourlyRate !== null,
        hasAvailability: row._count.availability > 0,
        hasEmergencyContact: Boolean(row.emergencyContactName && row.emergencyContactPhone),
        documentsToSign: row.signatureRequests.length,
        documentsSigned: row.signatureRequests.filter((r) => r.status === 'signed').length,
        health: healthStatus(row.healthDeclaration),
        employmentHistory: recruitment?.fromApplication ?? false,
        verifiedReferences: recruitment?.verifiedReferences ?? 0,
        validCredentialTypes: valid,
        expiredCredentialTypes: expired.filter((t) => !valid.includes(t)),
      },
      requirements[row.discipline as Discipline] ?? [],
    );
  }

  async forStaff(caller: AuthUser, staffId: string): Promise<OnboardingChecklist> {
    const row = await this.prisma.staffProfile.findFirst({ where: { id: staffId, agencyId: caller.agencyId }, select: SELECT });
    if (!row) throw new NotFoundException('Staff member not found');
    const facts = await this.recruitment(caller.agencyId, [row.userId]);
    return this.checklist(row, await this.requirements(caller.agencyId), await this.clock.todayString(caller.agencyId), facts.get(row.userId));
  }

  /** The signed-in caregiver's own checklist (null when they have no staff profile). */
  async mine(caller: AuthUser): Promise<OnboardingChecklist | null> {
    const row = await this.prisma.staffProfile.findFirst({ where: { userId: caller.userId, agencyId: caller.agencyId }, select: SELECT });
    if (!row) return null;
    const facts = await this.recruitment(caller.agencyId, [row.userId]);
    return this.checklist(row, await this.requirements(caller.agencyId), await this.clock.todayString(caller.agencyId), facts.get(row.userId));
  }

  /** Every active staff member's readiness, least ready first. */
  async overview(caller: AuthUser): Promise<{ staffId: string; name: string; discipline: string; percent: number; ready: boolean; missing: string[] }[]> {
    const [rows, requirements, today] = await Promise.all([
      this.prisma.staffProfile.findMany({ where: { agencyId: caller.agencyId, isActive: true }, select: SELECT }),
      this.requirements(caller.agencyId),
      this.clock.todayString(caller.agencyId),
    ]);
    const facts = await this.recruitment(caller.agencyId, rows.map((r) => r.userId));
    return rows
      .map((row) => {
        const c = this.checklist(row, requirements, today, facts.get(row.userId));
        return {
          staffId: row.id,
          name: `${row.user.firstName} ${row.user.lastName}`,
          discipline: row.discipline,
          percent: c.percent,
          ready: c.ready,
          missing: c.items.filter((i) => i.required && !i.done).map((i) => i.label),
        };
      })
      .sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name));
  }
}
