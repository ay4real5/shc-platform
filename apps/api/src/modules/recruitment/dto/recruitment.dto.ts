import {
  APPLICATION_STAGES,
  DISCIPLINES,
  EMPLOYMENT_TYPES,
  INTERVIEW_MODES,
  INTERVIEW_STATUSES,
  JOB_STATUSES,
  PAY_PERIODS,
  RIGHT_TO_WORK_ANSWERS,
} from '@alora/shared';
import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { IsDateOnly } from '../../../common/validators/is-date-only.js';
import { lowerTrimmed, PHONE, trimmed, UK_POSTCODE, upperTrimmed } from '../../../common/validators/fields.js';

const MONEY = { maxDecimalPlaces: 2 } as const;

// ---------- Job adverts (office) ----------

export class CreateJobDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @IsIn(DISCIPLINES)
  discipline!: (typeof DISCIPLINES)[number];

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];

  /** As shown to applicants, e.g. "Manchester (M14)". */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  location!: string;

  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(500_000)
  payFrom?: number;

  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(500_000)
  payTo?: number;

  @IsOptional()
  @IsIn(PAY_PERIODS)
  payPeriod?: (typeof PAY_PERIODS)[number];

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(150)
  hours?: string;

  /** One or two lines for the job list. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(300)
  summary?: string;

  /** Plain text; blank lines separate paragraphs. */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  description!: string;

  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: (typeof JOB_STATUSES)[number];

  /** Last day applications are accepted (company time). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateOnly()
  closesOn?: string | null;
}

export class UpdateJobDto extends PartialType(CreateJobDto) {}

export class ListJobsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: string;
}

export class ListApplicationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  jobPostingId?: string;

  @IsOptional()
  @IsIn(APPLICATION_STAGES)
  stage?: string;

  /** Matches name, email or reference. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

// ---------- Applications (public careers page) ----------

export class HistoryEntryDto {
  @IsIn(['job', 'gap'])
  kind!: 'job' | 'gap';

  @ValidateIf((o: HistoryEntryDto) => o.kind === 'job')
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Each job needs the employer' })
  @MaxLength(200)
  employer?: string;

  @ValidateIf((o: HistoryEntryDto) => o.kind === 'job')
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Each job needs a job title' })
  @MaxLength(150)
  jobTitle?: string;

  @IsDateOnly({ notInFuture: true })
  startDate!: string;

  /** Leave out (or null) for a current job. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateOnly({ notInFuture: true })
  endDate?: string | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  reasonForLeaving?: string;

  /** Worked with children or vulnerable adults. */
  @IsOptional()
  @IsBoolean()
  wasCareRole?: boolean;

  @ValidateIf((o: HistoryEntryDto) => o.kind === 'gap')
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Each gap needs a short explanation' })
  @MaxLength(1000)
  explanation?: string;
}

export class RefereeDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  organisation?: string;

  /** e.g. "Line manager at Sunrise Care". */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  relationship!: string;

  @Transform(lowerTrimmed)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @Transform(trimmed)
  @Matches(PHONE, { message: 'Referee phone must be a phone number' })
  phone?: string;

  @IsOptional()
  @IsBoolean()
  contactBeforeOffer?: boolean;
}

export class ApplyDto {
  /** Leave out for a general application to the company. */
  @IsOptional()
  @IsUUID()
  jobPostingId?: string;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @Transform(lowerTrimmed)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @Transform(trimmed)
  @Matches(PHONE, { message: 'phone must be a phone number' })
  phone!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(255)
  addressLine1?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  town?: string;

  @Transform(upperTrimmed)
  @Matches(UK_POSTCODE, { message: 'postcode must be a UK postcode, e.g. M1 1AA' })
  postcode!: string;

  @IsIn(RIGHT_TO_WORK_ANSWERS)
  rightToWork!: (typeof RIGHT_TO_WORK_ANSWERS)[number];

  @IsOptional()
  @IsBoolean()
  canDrive?: boolean;

  @IsOptional()
  @IsDateOnly()
  earliestStart?: string;

  /** e.g. "Weekdays and every other weekend". */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  availability?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(5000)
  coverNote?: string;

  /** Jobs and explained gaps (CQC Schedule 3). */
  @IsArray()
  @ArrayMinSize(1, { message: 'Add your employment history (or what you have been doing)' })
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => HistoryEntryDto)
  history!: HistoryEntryDto[];

  @IsArray()
  @ArrayMinSize(2, { message: 'Give two referees' })
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => RefereeDto)
  referees!: RefereeDto[];

  /** The applicant confirms the information is true and has read the privacy notice. */
  @Equals(true, { message: 'Please confirm the declaration' })
  declaration!: true;

  /** Spam trap: a hidden field people never fill in. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

// ---------- Pipeline (S1-05) ----------

export class MoveStageDto {
  @IsIn(APPLICATION_STAGES.filter((s) => s !== 'hired'))
  stage!: (typeof APPLICATION_STAGES)[number];

  /** Shown on the timeline (e.g. why rejected). Not sent to the applicant. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** Email the applicant (rejection: a polite "not this time"). */
  @IsOptional()
  @IsBoolean()
  notifyApplicant?: boolean;
}

export class AddNoteDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  text!: string;
}

export class BookInterviewDto {
  /** ISO date-time with offset, e.g. 2026-11-20T10:00:00Z. */
  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(240)
  durationMinutes?: number;

  @IsIn(INTERVIEW_MODES)
  mode!: (typeof INTERVIEW_MODES)[number];

  /** Address, video link or phone number, as told to the applicant. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsUUID()
  interviewerId?: string;

  /** Email the applicant the date, time and place. */
  @IsOptional()
  @IsBoolean()
  notifyApplicant?: boolean;
}

export class UpdateInterviewDto {
  @IsOptional()
  @IsIn(INTERVIEW_STATUSES)
  status?: (typeof INTERVIEW_STATUSES)[number];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(5)
  score?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['pass', 'fail'])
  outcome?: 'pass' | 'fail' | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(10_000)
  notes?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;
}

export class HireDto {
  /** Defaults to the job advert's role (or care_worker for a general application). */
  @IsOptional()
  @IsIn(DISCIPLINES)
  discipline?: (typeof DISCIPLINES)[number];

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];

  @IsOptional()
  @IsDateOnly()
  startDate?: string;

  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(1000)
  hourlyRate?: number;
}
