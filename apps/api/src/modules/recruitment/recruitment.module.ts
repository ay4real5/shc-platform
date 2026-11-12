import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { AuthModule } from '../auth/auth.module.js';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import {
  AddNoteDto,
  ApplyDto,
  BookInterviewDto,
  CreateJobDto,
  HireDto,
  ListApplicationsQueryDto,
  ListJobsQueryDto,
  MoveStageDto,
  UpdateInterviewDto,
  UpdateJobDto,
} from './dto/recruitment.dto.js';
import { PipelineService } from './pipeline.service.js';
import { RecruitmentService } from './recruitment.service.js';

/** Applying: a handful per IP per minute is plenty for a person and slows down spam. */
const APPLY_LIMIT = { default: { limit: 5, ttl: 60_000 } };

/** Office side: job adverts and the applications they bring in. */
@ApiTags('recruitment')
@Controller('recruitment')
export class RecruitmentController {
  constructor(
    private readonly recruitment: RecruitmentService,
    private readonly pipeline: PipelineService,
  ) {}

  @Permissions('recruitment:read')
  @Get('jobs')
  listJobs(@CurrentUser() caller: AuthUser, @Query() query: ListJobsQueryDto) {
    return this.recruitment.listJobs(caller, query);
  }

  @Permissions('recruitment:manage')
  @Post('jobs')
  createJob(@CurrentUser() caller: AuthUser, @Body() dto: CreateJobDto) {
    return this.recruitment.createJob(caller, dto);
  }

  @Permissions('recruitment:read')
  @Get('jobs/:id')
  getJob(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruitment.getJob(caller, id);
  }

  @Permissions('recruitment:manage')
  @Patch('jobs/:id')
  updateJob(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobDto) {
    return this.recruitment.updateJob(caller, id, dto);
  }

  @Permissions('recruitment:read')
  @Get('applications')
  listApplications(@CurrentUser() caller: AuthUser, @Query() query: ListApplicationsQueryDto) {
    return this.recruitment.listApplications(caller, query);
  }

  @Permissions('recruitment:read')
  @Audit({ action: 'VIEW_APPLICATION', resourceType: 'applications' })
  @Get('applications/:id')
  getApplication(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruitment.getApplication(caller, id);
  }

  /** Stage changes, notes, emails and interviews, newest first. */
  @Permissions('recruitment:read')
  @Get('applications/:id/timeline')
  timeline(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pipeline.timeline(caller, id);
  }

  @Permissions('recruitment:manage')
  @Audit({ action: 'MOVE_APPLICATION', resourceType: 'applications' })
  @Post('applications/:id/stage')
  moveStage(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveStageDto) {
    return this.pipeline.moveStage(caller, id, dto);
  }

  @Permissions('recruitment:manage')
  @Post('applications/:id/notes')
  addNote(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddNoteDto) {
    return this.pipeline.addNote(caller, id, dto.text);
  }

  @Permissions('recruitment:manage')
  @Post('applications/:id/interviews')
  bookInterview(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BookInterviewDto) {
    return this.pipeline.bookInterview(caller, id, dto);
  }

  @Permissions('recruitment:manage')
  @Patch('interviews/:id')
  updateInterview(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInterviewDto) {
    return this.pipeline.updateInterview(caller, id, dto);
  }

  /** Creates the login and staff record. Needs staff:create as well: it adds a person to the company. */
  @Permissions('recruitment:manage', 'staff:create')
  @Audit({ action: 'HIRE_APPLICANT', resourceType: 'applications' })
  @Post('applications/:id/hire')
  hire(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HireDto) {
    return this.pipeline.hire(caller, id, dto);
  }
}

/** The public careers page: open jobs and the application form. No sign-in. */
@ApiTags('careers')
@Controller('careers')
export class CareersController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @Public()
  @Get(':slug')
  page(@Param('slug') slug: string) {
    return this.recruitment.careersPage(slug);
  }

  @Public()
  @Get(':slug/jobs/:jobId')
  job(@Param('slug') slug: string, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.recruitment.publicJob(slug, jobId);
  }

  @Public()
  @Throttle(APPLY_LIMIT)
  @Post(':slug/applications')
  apply(@Param('slug') slug: string, @Body() dto: ApplyDto) {
    return this.recruitment.apply(slug, dto);
  }
}

@Module({
  imports: [NotificationsModule, ComplianceModule, AuthModule],
  controllers: [RecruitmentController, CareersController],
  providers: [RecruitmentService, PipelineService],
})
export class RecruitmentModule {}
