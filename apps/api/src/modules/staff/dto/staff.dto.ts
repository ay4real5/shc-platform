import { DISCIPLINES, EMPLOYMENT_TYPES, TIME_OFF_TYPES } from '@alora/shared';
import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { IsDateOnly } from '../../../common/validators/is-date-only.js';
import { trimmed, upperTrimmed, UK_POSTCODE } from '../../../common/validators/fields.js';

/** HMRC format: two prefix letters (not D, F, I, Q, U, V first; not D, F, I, O, Q, U, V second; not BG/GB/NK/KN/TN/NT/ZZ), six digits, A-D. */
const NI_NUMBER = /^(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/;
const niNumber = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value);
/** Digits with optional +, spaces, brackets and dashes. */
const PHONE = /^\+?[\d\s()-]{10,20}$/;
const MONEY = { maxDecimalPlaces: 2 } as const;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateStaffDto {
  /** The user account this profile belongs to (same agency, not already staff). */
  @IsUUID()
  userId!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(50)
  employeeId?: string;

  @IsIn(DISCIPLINES)
  discipline!: (typeof DISCIPLINES)[number];

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];

  @IsOptional()
  @IsDateOnly()
  hireDate?: string;

  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(1000)
  hourlyRate?: number;

  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(1500)
  overtimeRate?: number;

  /** Pounds per mile, e.g. 0.45. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(5)
  mileageRate?: number;

  /** National Insurance number, e.g. AB 12 34 56 C. Stored encrypted; only the last characters are ever returned, and only to pay viewers. */
  @IsOptional()
  @Transform(niNumber)
  @Matches(NI_NUMBER, { message: 'niNumber must be a National Insurance number like AB 12 34 56 C' })
  niNumber?: string;

  @IsOptional()
  @IsDateOnly()
  dateOfBirth?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(255)
  addressLine1?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  town?: string;

  @IsOptional()
  @Transform(upperTrimmed)
  @Matches(UK_POSTCODE, { message: 'postcode must be a UK postcode, e.g. M1 1AA' })
  postcode?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  emergencyContactName?: string;

  @IsOptional()
  @Transform(trimmed)
  @Matches(PHONE, { message: 'emergencyContactPhone must be a phone number' })
  emergencyContactPhone?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(50)
  emergencyContactRelationship?: string;

  /** Has a licence and a car they can use for work. */
  @IsOptional()
  @IsBoolean()
  canDrive?: boolean;

  @IsOptional()
  @IsIn(['female', 'male'])
  gender?: 'female' | 'male';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  languages?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class UpdateStaffDto extends PartialType(OmitType(CreateStaffDto, ['userId'] as const)) {}

export class TerminateStaffDto {
  /** Defaults to today. */
  @IsOptional()
  @IsDateOnly()
  terminationDate?: string;
}

export class ListStaffQueryDto extends PaginationQueryDto {
  /** Matches first name, last name, email or employee id. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(DISCIPLINES)
  discipline?: string;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

}

export class CreateCredentialDto {
  /** e.g. right_to_work, dbs_enhanced, care_certificate, first_aid, driving_licence */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  credentialType!: string;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  credentialName!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  credentialNumber?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(255)
  issuingAuthority?: string;

  @IsOptional()
  @IsDateOnly()
  issueDate?: string;

  @IsOptional()
  @IsDateOnly()
  expiryDate?: string;

  /** Warn this many days before expiry (default 30). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  alertDaysBefore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateCredentialDto extends PartialType(CreateCredentialDto) {
  /** true records the caller as having verified the credential against the original. */
  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}

export class ExpiringCredentialsQueryDto {
  /** Include credentials expiring within this many days (and already expired ones). Default 30. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  withinDays: number = 30;
}

export class AvailabilitySlotDto {
  /** 0 = Sunday … 6 = Saturday */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  /** HH:MM, 24-hour */
  @Matches(HH_MM, { message: 'startTime must be HH:MM (24-hour)' })
  startTime!: string;

  /** HH:MM, 24-hour, after startTime */
  @Matches(HH_MM, { message: 'endTime must be HH:MM (24-hour)' })
  endTime!: string;
}

export class SetAvailabilityDto {
  /** Replaces the whole weekly schedule. An empty list means "no set availability". */
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  slots!: AvailabilitySlotDto[];
}

export class CreateTimeOffDto {
  @IsDateOnly()
  startDate!: string;

  @IsDateOnly()
  endDate!: string;

  @IsIn(TIME_OFF_TYPES)
  type!: (typeof TIME_OFF_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class DecideTimeOffDto {
  /** approved/denied by an approver; cancelled by the requester (pending requests only). */
  @IsIn(['approved', 'denied', 'cancelled'])
  status!: 'approved' | 'denied' | 'cancelled';
}

/** Credential types each job role needs before working (D-101), e.g. `{ "care_worker": ["dbs_enhanced", "care_certificate"] }`. */
export class OnboardingRequirementsDto {
  @IsObject()
  requirements!: Record<string, string[]>;
}
