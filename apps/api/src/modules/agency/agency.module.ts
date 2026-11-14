import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Injectable, Module, Patch, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { DEFAULT_LEAVE_YEAR_START_MONTH, DEFAULT_SUPERVISION_INTERVALS, MAX_REGIONS, SUPERVISION_TYPES, agencyRegions, cleanRegions, type SupervisionType } from '@alora/shared';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsObject, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
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

  /** Months between supervisions, appraisals and spot checks (S3-04), e.g. `{ "supervision": 2 }`. 1–24 each. */
  @IsOptional()
  @IsObject()
  supervisionEveryMonths?: Partial<Record<SupervisionType, number>>;

  /** The company's regions (S-028), e.g. ["Greater Manchester", "Bristol"]. Replaces the list; [] removes regions. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REGIONS * 2)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  regions?: string[];
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
  supervisionEveryMonths: Record<SupervisionType, number>;
  regions: string[];
  /** The careers-page logo as a data: URL (S-032), or null. */
  logo: string | null;
}

/** Largest logo accepted (S-032): enough for a sharp header logo, small enough to send inside the careers page. */
export const MAX_LOGO_BYTES = 200_000;

/** The image type from its first bytes: PNG, JPEG or WebP only (never SVG, which can carry script). */
export function logoType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const b = (i: number) => bytes[i];
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp';
  return null;
}

export function logoDataUrl(logo: Uint8Array | null, type: string | null): string | null {
  return logo && type ? `data:${type};base64,${Buffer.from(logo).toString('base64')}` : null;
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
  logo: true,
  logoType: true,
} as const;

/** Agency setting (off by default): show staff recognition badges in the app. */
function recognitionEnabled(settings: unknown): boolean {
  return typeof settings === 'object' && settings !== null && (settings as Record<string, unknown>).recognitionBadges === true;
}

const isObject = (v: unknown): v is Prisma.JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

function view({ settings, logo, logoType: type, ...agency }: Prisma.AgencyGetPayload<{ select: typeof SELECT }>): AgencyView {
  const month = isObject(settings) ? settings.leaveYearStartMonth : undefined;
  const custom = isObject(settings) && isObject(settings.supervisionEveryMonths) ? settings.supervisionEveryMonths : {};
  const supervisionEveryMonths = Object.fromEntries(
    SUPERVISION_TYPES.map((t) => [t, typeof custom[t] === 'number' ? (custom[t] as number) : DEFAULT_SUPERVISION_INTERVALS[t].everyMonths]),
  ) as Record<SupervisionType, number>;
  return {
    ...agency,
    recognitionBadges: recognitionEnabled(settings),
    leaveYearStartMonth: typeof month === 'number' ? month : DEFAULT_LEAVE_YEAR_START_MONTH,
    supervisionEveryMonths,
    regions: agencyRegions(settings),
    logo: logoDataUrl(logo, type),
  };
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

  /** Sets the careers-page logo (S-032). */
  async setLogo(caller: AuthUser, file: { buffer: Buffer; size: number } | undefined): Promise<AgencyView> {
    if (!file?.size) throw new BadRequestException('Choose an image file');
    if (file.size > MAX_LOGO_BYTES) throw new BadRequestException('The logo must be 200 KB or smaller');
    const type = logoType(file.buffer);
    if (!type) throw new BadRequestException('The logo must be a PNG, JPEG or WebP image');
    return view(await this.prisma.agency.update({ where: { id: caller.agencyId }, data: { logo: new Uint8Array(file.buffer), logoType: type }, select: SELECT }));
  }

  async removeLogo(caller: AuthUser): Promise<void> {
    await this.prisma.agency.update({ where: { id: caller.agencyId }, data: { logo: null, logoType: null } });
  }

  /** Just the region names (S-028), for anyone who works with staff lists. */
  async regions(caller: AuthUser): Promise<string[]> {
    const agency = await this.prisma.agency.findUniqueOrThrow({ where: { id: caller.agencyId }, select: { settings: true } });
    return agencyRegions(agency.settings);
  }

  async update(caller: AuthUser, dto: UpdateAgencyDto): Promise<AgencyView> {
    const { recognitionBadges, leaveYearStartMonth, supervisionEveryMonths, regions: regionInput, ...fields } = dto;
    let regions: string[] | undefined;
    if (regionInput) {
      const cleaned = cleanRegions(regionInput);
      if (cleaned.problem) throw new BadRequestException(cleaned.problem);
      regions = cleaned.regions;
    }
    if (supervisionEveryMonths) {
      for (const [k, v] of Object.entries(supervisionEveryMonths)) {
        if (!(SUPERVISION_TYPES as readonly string[]).includes(k) || !Number.isInteger(v) || v < 1 || v > 24) {
          throw new BadRequestException('supervisionEveryMonths: each of supervision, appraisal, spot_check must be 1 to 24 months');
        }
      }
    }
    let settings: Prisma.InputJsonObject | undefined;
    if (recognitionBadges !== undefined || leaveYearStartMonth !== undefined || supervisionEveryMonths !== undefined || regions !== undefined) {
      const current = await this.prisma.agency.findUniqueOrThrow({ where: { id: caller.agencyId }, select: { settings: true } });
      settings = {
        ...(isObject(current.settings) ? current.settings : {}),
        ...(recognitionBadges !== undefined ? { recognitionBadges } : {}),
        ...(leaveYearStartMonth !== undefined ? { leaveYearStartMonth } : {}),
        ...(regions !== undefined ? { regions } : {}),
        ...(supervisionEveryMonths !== undefined
          ? { supervisionEveryMonths: { ...(isObject(current.settings) && isObject(current.settings.supervisionEveryMonths) ? current.settings.supervisionEveryMonths : {}), ...supervisionEveryMonths } }
          : {}),
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
  @Audit({ action: 'UPDATE_AGENCY_LOGO', resourceType: 'agency' })
  @Put('logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LOGO_BYTES + 1, files: 1 } }))
  setLogo(@CurrentUser() caller: AuthUser, @UploadedFile() file: { buffer: Buffer; size: number } | undefined) {
    return this.agency.setLogo(caller, file);
  }

  @Permissions('settings:update')
  @Audit({ action: 'REMOVE_AGENCY_LOGO', resourceType: 'agency' })
  @Delete('logo')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeLogo(@CurrentUser() caller: AuthUser) {
    return this.agency.removeLogo(caller);
  }

  /** The company's regions, for region filters and pickers (S-028). */
  @Permissions('staff:read')
  @Get('regions')
  regions(@CurrentUser() caller: AuthUser) {
    return this.agency.regions(caller);
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
