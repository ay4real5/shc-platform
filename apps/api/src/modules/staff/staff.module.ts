import { DashboardController, DashboardService } from './dashboard.js';
import { SupervisionRemindersJob } from './supervision-reminders.job.js';
import { SupervisionsController, SupervisionsService } from './supervisions.js';
import { HolidayService } from './holiday.js';
import { HolidayController } from './holiday.controller.js';
import { CareCertificateController, CareCertificateService } from './care-certificate.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StaffImportController, StaffImportService } from './staff-import.js';
import { CredentialsService } from './credentials.service.js';
import { DbsController, DbsService } from './dbs.js';
import { HealthController, HealthService } from './health.js';
import { OnboardingService } from './onboarding.service.js';
import { RightToWorkController, RightToWorkService } from './right-to-work.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { TimeOffController } from './time-off.controller.js';
import { TimeOffService } from './time-off.service.js';

@Module({
  imports: [AuthModule],
  controllers: [StaffImportController, DashboardController, SupervisionsController, CareCertificateController, HolidayController, RightToWorkController, DbsController, HealthController, StaffController, TimeOffController],
  providers: [StaffImportService, DashboardService, SupervisionsService, SupervisionRemindersJob, CareCertificateService, HolidayService, StaffService, CredentialsService, TimeOffService, OnboardingService, RightToWorkService, DbsService, HealthService],
  exports: [StaffService, TimeOffService, OnboardingService],
})
export class StaffModule {}
