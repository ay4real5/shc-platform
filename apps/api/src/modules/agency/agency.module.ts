import { Body, Controller, Get, Injectable, Module, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { DEFAULT_LEAVE_YEAR_START_MONTH } from '@alora/shared';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { lowerTrimmed, PHONE, trimmed, UK_POSTCODE, upperTrimmed } from '../../common/validators/fields.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

export class UpdateAgencyDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Matches(PHONE)
  phone?: string;

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

  /** UK postcode. */
  @IsOptional()
  @Transform(upperTrimmed)
  @Matches(UK_POSTCODE, { message: 'postcode must be a UK postcode, e.g. M1 1AA' })
  postcode?: string;

  /** Public careers page address: /careers/<careersSlug>. Lower-case letters, digits and dashes. */
  @IsOptional()
  @Transform(lowerTrimmed)
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, { message: 'careersSlug may use lower-case letters, digits and dashes' })
  careersSlug?: string;

  /** Show staff recognition badges in the app (D-097). Off by default. */
  @IsOptional()
  @IsBoolean()
  recognitionBadges?: boolean;

  /** First month of the holiday leave year, 1–12 (S3-03). April by default. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  leaveYearStartMonth?: number;
}

export interface AgencyView {
  id: string;
  name: string;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  postcode: string | null;
  timezone: string;
  careersSlug: string | null;
  recognitionBadges: boolean;
  leaveYearStartMonth: number;
}

const SELECT = {
  id: true,
  name: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  town: true,
  postcode: true,
  timezone: true,
  careersSlug: true,
  settings: true,
} as const;

/** Agency setting (off by default): show staff recognition badges in the app. */
function recognitionEnabled(settings: unknown): boolean {
  return typeof settings === 'object' && settings !== null && (settings as Record<string, unknown>).recognitionBadges === true;
}

const isObject = (v: unknown): v is Prisma.JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

function view({ settings, ...agency }: Prisma.AgencyGetPayload<{ select: typeof SELECT }>): AgencyView {
  const month = isObject(settings) ? settings.leaveYearStartMonth : undefined;
  return { ...agency, recognitionBadges: recognitionEnabled(settings), leaveYearStartMonth: typeof month === 'number' ? month : DEFAULT_LEAVE_YEAR_START_MONTH };
}

/**
 * The caller's company profile: name, phone, address and postcode. The timezone
 * is not editable here (it changes what "today" means for every date already recorded).
 */
@Injectable()
export class AgencyService {
  constructor(private readonly prisma: PrismaService) {}

  async get(caller: AuthUser): Promise<AgencyView> {
    return view(await this.prisma.agency.findUniqueOrThrow({ where: { id: caller.agencyId }, select: SELECT }));
  }

  async update(caller: AuthUser, dto: UpdateAgencyDto): Promise<AgencyView> {
    const { recognitionBadges, leaveYearStartMonth, ...fields } = dto;
    let settings: Prisma.InputJsonObject | undefined;
    if (recognitionBadges !== undefined || leaveYearStartMonth !== undefined) {
      const current = await this.prisma.agency.findUniqueOrThrow({ where: { id: caller.agencyId }, select: { settings: true } });
      settings = {
        ...(isObject(current.settings) ? current.settings : {}),
        ...(recognitionBadges !== undefined ? { recognitionBadges } : {}),
        ...(leaveYearStartMonth !== undefined ? { leaveYearStartMonth } : {}),
      };
    }
    return view(await this.prisma.agency.update({ where: { id: caller.agencyId }, data: { ...fields, ...(settings ? { settings } : {}) }, select: SELECT }));
  }
}

@ApiTags('agency')
@Controller('agency')
export class AgencyController {
  constructor(private readonly agency: AgencyService) {}

  @Permissions('settings:read')
  @Get()
  get(@CurrentUser() caller: AuthUser) {
    return this.agency.get(caller);
  }

  @Permissions('settings:update')
  @Audit({ action: 'UPDATE_AGENCY', resourceType: 'agency' })
  @Patch()
  update(@CurrentUser() caller: AuthUser, @Body() dto: UpdateAgencyDto) {
    return this.agency.update(caller, dto);
  }
}

@Module({ controllers: [AgencyController], providers: [AgencyService], exports: [AgencyService] })
export class AgencyModule {}
