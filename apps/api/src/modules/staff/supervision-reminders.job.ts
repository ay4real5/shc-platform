import { SUPERVISION_TYPE_LABELS, type SupervisionType } from '@alora/shared';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { addDays, toDate } from '../../common/utils/dates.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SupervisionsService } from './supervisions.js';

/**
 * Daily (S3-04): reminds the person and the supervisor the day before a booked session, and tells the company's
 * supervisors (supervisions:manage) when people become overdue. Idempotent: reminders are claimed with a guarded update,
 * and each overdue (person, type, due date) is recorded once, so several API instances can run it.
 */
@Injectable()
export class SupervisionRemindersJob {
  private readonly logger = new Logger(SupervisionRemindersJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AgencyClockService,
    private readonly notifications: NotificationsService,
    private readonly supervisions: SupervisionsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  // 07:15 UTC: early morning in the UK.
  @Cron('15 7 * * *', { name: 'supervision-reminders' })
  async cron(): Promise<void> {
    if (!this.config.get('JOBS_ENABLED', { infer: true })) return;
    try {
      const { reminders, overdue } = await this.run();
      this.logger.log(`supervision reminders: ${reminders} reminders, ${overdue} newly overdue`);
    } catch (error) {
      this.logger.error('supervision reminders job failed', (error as Error).stack);
    }
  }

  /** `agencyId` limits it to one agency (tests). */
  async run(agencyId?: string): Promise<{ reminders: number; overdue: number }> {
    const agencies = await this.prisma.agency.findMany({ where: { isActive: true, ...(agencyId ? { id: agencyId } : {}) }, select: { id: true } });
    let reminders = 0;
    let overdue = 0;
    for (const { id } of agencies) {
      const today = await this.clock.todayString(id);
      reminders += await this.dayBefore(id, addDays(today, 1));
      overdue += await this.newlyOverdue(id);
    }
    return { reminders, overdue };
  }

  private async dayBefore(agencyId: string, tomorrow: string): Promise<number> {
    const rows = await this.prisma.supervision.findMany({
      where: { agencyId, status: 'scheduled', scheduledFor: toDate(tomorrow), reminderSentAt: null },
      select: { id: true, type: true, supervisorId: true, staffProfile: { select: { userId: true } } },
    });
    let sent = 0;
    for (const r of rows) {
      const claimed = await this.prisma.supervision.updateMany({ where: { id: r.id, reminderSentAt: null }, data: { reminderSentAt: new Date() } });
      if (!claimed.count) continue;
      await this.notifications.notify({
        agencyId,
        userIds: [r.staffProfile.userId, r.supervisorId ?? ''],
        type: 'supervision',
        title: `${SUPERVISION_TYPE_LABELS[r.type as SupervisionType]} tomorrow`,
        body: 'Details are in the app.',
        data: { supervisionId: r.id },
      });
      sent++;
    }
    return sent;
  }

  private async newlyOverdue(agencyId: string): Promise<number> {
    const { rows } = await this.supervisions.overview(agencyId);
    const items = rows.flatMap((r) => r.due.filter((d) => d.overdue).map((d) => ({ staffProfileId: r.staff.id, type: d.type, dueOn: toDate(d.dueOn)! })));
    if (!items.length) return 0;
    const { count } = await this.prisma.supervisionOverdueAlert.createMany({ data: items, skipDuplicates: true });
    if (!count) return 0;
    const managers = await this.prisma.user.findMany({
      where: {
        agencyId,
        isActive: true,
        userRoles: { some: { role: { OR: [{ agencyId: null }, { agencyId }], rolePermissions: { some: { permission: { resource: 'supervisions', action: 'manage' } } } } } },
      },
      select: { id: true },
    });
    await this.notifications.notify({
      agencyId,
      userIds: managers.map((m) => m.id),
      type: 'supervision',
      title: `${count} supervision${count === 1 ? '' : 's'}, appraisal${count === 1 ? '' : 's'} or spot check${count === 1 ? '' : 's'} now overdue`,
      body: 'See Supervisions to book them.',
      data: {},
    });
    return count;
  }
}
