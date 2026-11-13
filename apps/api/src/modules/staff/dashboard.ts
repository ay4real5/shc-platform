import { APPLICATION_STAGE_LABELS, OPEN_APPLICATION_STAGES, type ApplicationStage } from '@alora/shared';
import { Controller, Get, Injectable } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { addDays } from '../../common/utils/dates.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CareCertificateService } from './care-certificate.js';
import { CredentialsService } from './credentials.service.js';
import { OnboardingService } from './onboarding.service.js';
import { SupervisionsService } from './supervisions.js';

/** How many of each list the dashboard shows; the counts are always complete. */
const LIST = 8;

export interface ManagerDashboard {
  today: string;
  staff: { active: number; ready: number };
  /** Who can't work yet, least ready first, and what's missing. */
  notReady: { total: number; people: { staffId: string; name: string; discipline: string; percent: number; missing: string[] }[] };
  /** Checks and training expired or expiring in the next 30 days, soonest first. */
  expiring: {
    expired: number;
    within30Days: number;
    items: { credentialId: string; staffId: string; name: string; credentialName: string; credentialType: string; expiryDate: string | null; state: string }[];
  };
  hiring: {
    openJobs: number;
    newApplicationsThisWeek: number;
    byStage: { stage: ApplicationStage; label: string; count: number }[];
    interviewsNext7Days: number;
    /** Applications sitting in one stage for over a week. */
    waitingOverAWeek: number;
  };
  /** Things waiting on the office. */
  attention: {
    timeOffToApprove: number;
    supervisionsOverdue: number;
    peopleOverdueSupervision: number;
    recordsAwaitingSignature: number;
    healthToReview: number;
    trainingGaps: number;
    careCertificatesOverdue: number;
  };
}

/** The manager's home page in one call (S3-05): who can't work and why, what's expiring, hiring, and what's waiting. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AgencyClockService,
    private readonly onboarding: OnboardingService,
    private readonly credentials: CredentialsService,
    private readonly careCertificate: CareCertificateService,
    private readonly supervisions: SupervisionsService,
  ) {}

  async manager(caller: AuthUser): Promise<ManagerDashboard> {
    const agencyId = caller.agencyId;
    const today = await this.clock.todayString(agencyId);
    const weekAgo = new Date(`${addDays(today, -7)}T00:00:00Z`);
    const in7Days = new Date(`${addDays(today, 8)}T00:00:00Z`);
    const [readiness, expiring, matrix, supervisions, openJobs, newApplications, stages, interviews, waiting, timeOff, health] = await Promise.all([
      this.onboarding.overview(caller),
      this.credentials.expiring(caller, 30),
      this.careCertificate.matrix(caller),
      this.supervisions.overview(agencyId),
      this.prisma.jobPosting.count({ where: { agencyId, status: 'open' } }),
      this.prisma.application.count({ where: { agencyId, createdAt: { gte: weekAgo } } }),
      this.prisma.application.groupBy({ by: ['stage'], where: { agencyId, stage: { in: [...OPEN_APPLICATION_STAGES] } }, _count: { _all: true } }),
      this.prisma.interview.count({ where: { application: { agencyId }, status: 'scheduled', startsAt: { gte: new Date(), lt: in7Days } } }),
      this.prisma.application.count({ where: { agencyId, stage: { in: [...OPEN_APPLICATION_STAGES] }, stageChangedAt: { lt: weekAgo } } }),
      this.prisma.staffTimeOff.count({ where: { status: 'pending', staffProfile: { agencyId, isActive: true } } }),
      this.prisma.healthDeclaration.count({ where: { agencyId, outcome: null, staffProfile: { isActive: true } } }),
    ]);

    const notReady = readiness.filter((r) => !r.ready);
    const stageCount = new Map(stages.map((s) => [s.stage, s._count._all]));
    const overdueItems = supervisions.rows.flatMap((r) => r.due.filter((d) => d.overdue));
    const gaps = Object.values(matrix.totals).reduce((n, t) => n + t.missing + t.expired, 0);

    return {
      today,
      staff: { active: readiness.length, ready: readiness.length - notReady.length },
      notReady: { total: notReady.length, people: notReady.slice(0, LIST) },
      expiring: {
        expired: expiring.filter((c) => c.state === 'expired').length,
        within30Days: expiring.filter((c) => c.state !== 'expired').length,
        items: expiring.slice(0, LIST).map((c) => ({
          credentialId: c.id,
          staffId: c.staff.id,
          name: `${c.staff.firstName} ${c.staff.lastName}`,
          credentialName: c.credentialName,
          credentialType: c.credentialType,
          expiryDate: c.expiryDate,
          state: c.state,
        })),
      },
      hiring: {
        openJobs,
        newApplicationsThisWeek: newApplications,
        byStage: OPEN_APPLICATION_STAGES.map((stage) => ({ stage, label: APPLICATION_STAGE_LABELS[stage], count: stageCount.get(stage) ?? 0 })),
        interviewsNext7Days: interviews,
        waitingOverAWeek: waiting,
      },
      attention: {
        timeOffToApprove: timeOff,
        supervisionsOverdue: overdueItems.length,
        peopleOverdueSupervision: supervisions.rows.filter((r) => r.due.some((d) => d.overdue)).length,
        recordsAwaitingSignature: supervisions.rows.reduce((n, r) => n + r.awaitingSignature, 0),
        healthToReview: health,
        trainingGaps: gaps,
        careCertificatesOverdue: matrix.rows.filter((r) => r.careCertificate?.overdue).length,
      },
    };
  }
}

@ApiTags('staff')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Everything a manager needs first thing (staff:read). */
  @Permissions('staff:read')
  @Get('manager')
  manager(@CurrentUser() caller: AuthUser) {
    return this.dashboard.manager(caller);
  }
}
