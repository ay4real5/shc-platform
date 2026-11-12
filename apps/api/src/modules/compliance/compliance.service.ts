import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MANDATORY_TWO_FACTOR_ROLES } from '@alora/shared';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Paginated } from '../../common/dto/pagination.dto.js';
import { addDays, toDate } from '../../common/utils/dates.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditLogQueryDto } from './dto/compliance.dto.js';

export interface SecurityCheck {
  area: string;
  item: string;
  ok: boolean;
  detail: string;
}

/**
 * Compliance: the at-a-glance dashboard (expired and expiring staff credentials, administrators without 2FA), the
 * audit-log search, and a data-protection checklist computed from the running configuration. Credential expiry alerts
 * run as a daily job.
 */
@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AgencyClockService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async dashboard(caller: AuthUser) {
    const agencyId = caller.agencyId;
    const today = await this.clock.todayString(agencyId);
    const activeStaff = { status: 'active', staffProfile: { agencyId, isActive: true } };
    const [credentialsExpired, credentialsExpiring, adminsWithout2fa] = await Promise.all([
      this.prisma.staffCredential.count({ where: { ...activeStaff, expiryDate: { lt: toDate(today) } } }),
      this.prisma.staffCredential.count({ where: { ...activeStaff, expiryDate: { gte: toDate(today), lte: toDate(addDays(today, 30)) } } }),
      this.prisma.user.count({
        where: { agencyId, isActive: true, is2faEnabled: false, userRoles: { some: { role: { name: { in: [...MANDATORY_TWO_FACTOR_ROLES] } } } } },
      }),
    ]);
    return {
      today,
      credentials: { expired: credentialsExpired, expiringWithin30Days: credentialsExpiring },
      security: { adminsWithout2fa },
    };
  }

  // ── Audit log ─────────────────────────────────────────────────────────────────────────────────────

  /** Who did what, newest first. Details never contain PHI (D-023), so they're returned as recorded. */
  async auditLogs(caller: AuthUser, query: AuditLogQueryDto) {
    if (query.from && query.to && query.to < query.from) throw new BadRequestException('to cannot be before from');
    const where: Prisma.AuditLogWhereInput = {
      agencyId: caller.agencyId,
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
              ...(query.to ? { lt: new Date(`${addDays(query.to, 1)}T00:00:00Z`) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    const userIds = [...new Set(rows.map((r) => r.userId).filter((u): u is string => Boolean(u)))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return Paginated.of(
      rows.map((r) => ({
        id: r.id.toString(),
        createdAt: r.createdAt,
        user: r.userId ? (byId.get(r.userId) ?? { id: r.userId, firstName: null, lastName: null, email: null }) : null,
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        details: r.details,
        ipAddress: r.ipAddress,
      })),
      total,
      query,
    );
  }

  // ── Data protection checklist ─────────────────────────────────────────────────────────────────────

  /**
   * Technical safeguards the system can verify about itself (UK GDPR Article 32, security of processing) — not a
   * substitute for the company's own policies, ICO registration and staff training, which are listed as reminders.
   */
  async securityChecklist(caller: AuthUser): Promise<SecurityCheck[]> {
    const env = (k: keyof EnvironmentVariables) => this.config.get(k, { infer: true });
    const production = env('APP_ENV') === 'production';
    const [admins, adminsWith2fa, auditToday] = await Promise.all([
      this.prisma.user.count({ where: { agencyId: caller.agencyId, isActive: true, userRoles: { some: { role: { name: { in: [...MANDATORY_TWO_FACTOR_ROLES] } } } } } }),
      this.prisma.user.count({
        where: { agencyId: caller.agencyId, isActive: true, is2faEnabled: true, userRoles: { some: { role: { name: { in: [...MANDATORY_TWO_FACTOR_ROLES] } } } } },
      }),
      this.prisma.auditLog.count({ where: { agencyId: caller.agencyId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    ]);
    const idle = Number(env('SESSION_IDLE_TIMEOUT_MINUTES'));
    return [
      { area: 'Access control', item: 'Unique user sign-in, role-based permissions', ok: true, detail: 'Every request is authenticated; permissions are checked per route.' },
      { area: 'Access control', item: 'Two-factor authentication for administrators', ok: admins === adminsWith2fa, detail: `${adminsWith2fa} of ${admins} active administrators have it on.` },
      { area: 'Access control', item: 'Automatic sign-out when idle', ok: idle <= 30, detail: `Sessions end after ${idle} minutes without activity.` },
      { area: 'Accountability', item: 'Access to staff and applicant records is logged', ok: auditToday > 0, detail: `${auditToday} audit entries in the last 24 hours.` },
      { area: 'Integrity', item: 'Documents checked against their upload fingerprint', ok: true, detail: 'SHA-256 verified on every download and before signing.' },
      { area: 'Encryption', item: 'Sensitive fields and files encrypted at rest', ok: Boolean(env('PHI_ENCRYPTION_KEY')), detail: 'AES-256-GCM for National Insurance numbers, 2FA secrets, messages and documents.' },
      { area: 'Encryption', item: 'Encryption in transit', ok: production, detail: production ? 'Production is served over HTTPS only.' : 'Development environment — HTTPS comes with hosting.' },
      { area: 'Availability', item: 'Rate limiting on sign-in', ok: !env('RATE_LIMITS_DISABLED'), detail: 'Brute-force protection plus account lockout after 5 wrong passwords.' },
      { area: 'Company', item: 'ICO registration and data processing agreement', ok: false, detail: 'Confirm the company is registered with the ICO and has signed the data processing agreement.' },
      { area: 'Company', item: 'Policies and staff data protection training', ok: false, detail: 'Company responsibility; record completion dates in your compliance file.' },
    ];
  }

  /** Active users in the agency whose role (built-in or this agency's) grants the permission. */
  async usersWithPermission(agencyId: string, resource: string, action: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        agencyId,
        isActive: true,
        userRoles: {
          some: { role: { OR: [{ agencyId: null }, { agencyId }], rolePermissions: { some: { permission: { resource, action } } } } },
        },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
}
