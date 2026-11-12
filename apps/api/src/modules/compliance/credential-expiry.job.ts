import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { addDays, fromDate, toDate } from '../../common/utils/dates.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ComplianceService } from './compliance.service.js';

/** Alert stages, in order. A credential is alerted once per stage (D-062). */
export const STAGES = ['due', 'week', 'expired'] as const;
export type ExpiryStage = (typeof STAGES)[number];

/** Which stage a credential is in on `today`, or null if it's not time to alert yet. */
export function expiryStage(expiryDate: string, today: string, alertDaysBefore: number): ExpiryStage | null {
  if (expiryDate < today) return 'expired';
  if (expiryDate <= addDays(today, 7)) return 'week';
  if (expiryDate <= addDays(today, Math.max(alertDaysBefore, 7))) return 'due';
  return null;
}

const daysUntil = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export interface ExpiryAlert {
  title: string;
  body: string;
  /** Whether the staff member is told too, or only the office. */
  toStaff: boolean;
}

/**
 * What the alert says, per kind of check (S3-01). Right to Work and DBS "expiry" dates are follow-up dates (S-007,
 * S-008), so they read as checks due, not as something expiring. DBS wording stays neutral and goes to the office only:
 * the record may be waiting on a risk decision, and a status check is an office task.
 */
export function expiryAlertText(credentialType: string, credentialName: string, stage: ExpiryStage, days: number, who: string): ExpiryAlert {
  const inDays = days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`;
  switch (credentialType) {
    case 'right_to_work':
      return {
        title: stage === 'expired' ? 'Right to Work follow-up check overdue' : `Right to Work follow-up check due ${inDays}`,
        body: `${who}: check their right to work again (share code or documents) and record it in Staff. Without it they can't keep working.`,
        toStaff: true,
      };
    case 'dbs_enhanced':
      return {
        title: stage === 'expired' ? 'DBS check needs attention' : `DBS status check due ${inDays}`,
        body: `${who}: open their DBS record in Staff and bring it up to date.`,
        toStaff: false,
      };
    default:
      return {
        title: stage === 'expired' ? `Expired: ${credentialName}` : `Expires ${inDays}: ${credentialName}`,
        body: `${who}: renew it (or retake the course in Training) and update it in Staff.`,
        toStaff: true,
      };
  }
}

/**
 * Daily: tells staff and their managers (staff:update holders) about checks and credentials entering an expiry stage —
 * Right to Work follow-ups, DBS, training, driving licence, insurance (S3-01). Superseded credentials are skipped.
 * Idempotent:
 * the stage is claimed with a guarded update before anyone is notified, so several API instances can run it.
 */
@Injectable()
export class CredentialExpiryJob {
  private readonly logger = new Logger(CredentialExpiryJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AgencyClockService,
    private readonly notifications: NotificationsService,
    private readonly compliance: ComplianceService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  // 07:00 UTC: 7am (winter) or 8am (summer) in the UK, before the office opens.
  @Cron('0 7 * * *', { name: 'credential-expiry' })
  async cron(): Promise<void> {
    if (!this.config.get('JOBS_ENABLED', { infer: true })) return;
    try {
      const sent = await this.run();
      this.logger.log(`credential expiry: ${sent} alerts`);
    } catch (error) {
      this.logger.error('credential expiry job failed', (error as Error).stack);
    }
  }

  /** Returns how many credentials were alerted. `agencyId` limits it to one agency (tests). */
  async run(agencyId?: string): Promise<number> {
    const horizon = toDate(addDays(new Date().toISOString().slice(0, 10), 120))!;
    const rows = await this.prisma.staffCredential.findMany({
      where: {
        expiryDate: { lte: horizon },
        status: 'active',
        // Not yet told it's expired (spelled out: NOT (stage = 'expired') would also drop NULL stages in SQL).
        OR: [{ expiryAlertStage: null }, { expiryAlertStage: { not: 'expired' } }],
        staffProfile: { isActive: true, user: { isActive: true }, ...(agencyId ? { agencyId } : {}) },
      },
      select: {
        id: true,
        credentialType: true,
        credentialName: true,
        expiryDate: true,
        alertDaysBefore: true,
        expiryAlertStage: true,
        staffProfile: { select: { agencyId: true, userId: true, user: { select: { firstName: true, lastName: true } } } },
      },
    });
    const todayByAgency = new Map<string, string>();
    const managersByAgency = new Map<string, string[]>();
    let sent = 0;
    for (const c of rows) {
      const agency = c.staffProfile.agencyId;
      if (!todayByAgency.has(agency)) todayByAgency.set(agency, await this.clock.todayString(agency));
      const today = todayByAgency.get(agency)!;
      const expiry = fromDate(c.expiryDate)!;
      const stage = expiryStage(expiry, today, c.alertDaysBefore);
      if (!stage) continue;
      const current = c.expiryAlertStage as ExpiryStage | null;
      if (current && STAGES.indexOf(current) >= STAGES.indexOf(stage)) continue;
      const claimed = await this.prisma.staffCredential.updateMany({
        where: { id: c.id, expiryAlertStage: current },
        data: { expiryAlertStage: stage },
      });
      if (!claimed.count) continue; // another instance got it
      if (!managersByAgency.has(agency)) managersByAgency.set(agency, await this.compliance.usersWithPermission(agency, 'staff', 'update'));
      const who = `${c.staffProfile.user.firstName} ${c.staffProfile.user.lastName}`;
      const alert = expiryAlertText(c.credentialType, c.credentialName, stage, daysUntil(today, expiry), who);
      const managers = managersByAgency.get(agency)!;
      const userIds = [...new Set(alert.toStaff ? [c.staffProfile.userId, ...managers] : managers)];
      if (!userIds.length) continue;
      await this.notifications.notify({
        agencyId: agency,
        userIds,
        type: 'credential_expiry',
        title: alert.title,
        body: alert.body,
        data: { credentialId: c.id },
      });
      sent++;
    }
    return sent;
  }
}
