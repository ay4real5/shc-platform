import { Transform, Type } from 'class-transformer';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { trimmed } from '../../../common/validators/fields.js';
import { IsDateOnly } from '../../../common/validators/is-date-only.js';

export class AuditLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Exact action, e.g. VIEW_PATIENTS, LOGIN_FAILED. */
  @IsOptional()
  @Transform(trimmed)
  @Matches(/^[A-Z0-9_]{2,60}$/, { message: 'action is an UPPER_SNAKE name' })
  action?: string;

  @IsOptional()
  @Transform(trimmed)
  @Matches(/^[a-z_]{2,50}$/, { message: 'resourceType is a lower_snake name, e.g. patients' })
  resourceType?: string;

  /** Everything that happened to one record (e.g. a patient ID). */
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsDateOnly()
  from?: string;

  @IsOptional()
  @IsDateOnly()
  to?: string;
}

export class CredentialAlertsQueryDto {
  @IsOptional()
  @Type(() => Number)
  withinDays?: number;
}
