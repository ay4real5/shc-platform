import { Module } from '@nestjs/common';
import { CredentialsService } from './credentials.service.js';
import { OnboardingService } from './onboarding.service.js';
import { RightToWorkController, RightToWorkService } from './right-to-work.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { TimeOffController } from './time-off.controller.js';
import { TimeOffService } from './time-off.service.js';

@Module({
  controllers: [RightToWorkController, StaffController, TimeOffController],
  providers: [StaffService, CredentialsService, TimeOffService, OnboardingService, RightToWorkService],
  exports: [StaffService, TimeOffService, OnboardingService],
})
export class StaffModule {}
