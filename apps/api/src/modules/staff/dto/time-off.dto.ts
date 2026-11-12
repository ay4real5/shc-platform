import { TIME_OFF_STATUSES, TIME_OFF_TYPES } from '@alora/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { IsDateOnly } from '../../../common/validators/is-date-only.js';
import { trimmed } from '../../../common/validators/fields.js';

export { TIME_OFF_STATUSES, TIME_OFF_TYPES };
/** Longest single request; longer leave is arranged with the office. */
export const MAX_TIME_OFF_DAYS = 60;

export class RequestTimeOffDto {
  @IsDateOnly()
  startDate!: string;

  @IsDateOnly()
  endDate!: string;

  @IsIn(TIME_OFF_TYPES)
  type!: (typeof TIME_OFF_TYPES)[number];

  /** Working days it uses, in half days (e.g. 0.5 for a half day). Left out: counted on their working pattern. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(60)
  days?: number;

  /** For the office; keep it short and don't include patient details. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class DecideTimeOffDto {
  @IsIn(['approved', 'denied'])
  status!: 'approved' | 'denied';
}

export class ListTimeOffQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(TIME_OFF_STATUSES)
  status?: (typeof TIME_OFF_STATUSES)[number];

  /** Approvers only: one staff member's requests. */
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
