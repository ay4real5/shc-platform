import { CREDENTIAL_TYPE_LABELS, DBS_ALERT_DAYS, DBS_LEVEL_LABELS, DBS_LEVELS_FOR_CARE, DISCIPLINE_DEFAULT_ROLE, RTW_ALERT_DAYS, RTW_IMPORTED_METHOD, dbsNextDue } from '@alora/shared';
import { Body, Controller, HttpCode, HttpStatus, Injectable, Logger, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { toDate } from '../../common/utils/dates.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import { PermissionsService } from '../rbac/permissions.service.js';
import { planImport, planSummary, type ImportPlanRow } from './staff-import.plan.js';

export class StaffImportDto {
  /** The CSV file's text (the template's columns). */
  @IsString()
  @MaxLength(2_000_000)
  csv!: string;

  /** true = check only and show the preview; nothing is saved. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export interface StaffImportRowView {
  row: number;
  name: string;
  email: string;
  jobRole: string | null;
  /** ready (preview), imported, skipped, error */
  status: 'ready' | 'imported' | 'skipped' | 'error';
  problems: string[];
  warnings: string[];
  /** What goes on their file. */
  adds: string[];
  staffId: string | null;
}

export interface StaffImportResult {
  dryRun: boolean;
  fileErrors: string[];
  ignoredColumns: string[];
  counts: { ready: number; imported: number; skipped: number; error: number };
  rows: StaffImportRowView[];
}

const IMPORT_NOTE = 'Imported from the staff spreadsheet. The check was done before SHC: keep the evidence on their file.';

/**
 * Staff spreadsheet import (S4-01, DECISIONS S-019). Each row becomes a login (role from the job role, password unknown
 * to anyone: they set their own with "Forgot password"), a staff record, and their checks. Rows are saved one by one
 * in their own transaction, so one bad row never blocks the rest; rows with problems are listed to fix and upload again
 * (people already imported are skipped by email). Nothing is emailed and no onboarding packs are sent.
 */
@Injectable()
export class StaffImportService {
  private readonly logger = new Logger(StaffImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AgencyClockService,
    private readonly passwords: PasswordService,
    private readonly permissions: PermissionsService,
  ) {}

  async run(caller: AuthUser, dto: StaffImportDto): Promise<StaffImportResult> {
    const dryRun = dto.dryRun ?? false;
    const [today, users, ids] = await Promise.all([
      this.clock.todayString(caller.agencyId),
      this.prisma.user.findMany({ select: { email: true } }),
      this.prisma.staffProfile.findMany({ where: { agencyId: caller.agencyId, employeeId: { not: null } }, select: { employeeId: true } }),
    ]);
    const plan = planImport(dto.csv, {
      today,
      existingEmails: new Set(users.map((u) => u.email.toLowerCase())),
      existingEmployeeIds: new Set(ids.map((p) => p.employeeId!.toLowerCase())),
    });

    // Roles each job role gets, and whether the caller may hand that access out (same rule as hiring).
    const roles = await this.prisma.role.findMany({ where: { agencyId: null }, include: { rolePermissions: { include: { permission: true } } } });
    const mine = (await this.permissions.forUser(caller)).permissions;
    const roleFor = (discipline: string) => roles.find((r) => r.name === (DISCIPLINE_DEFAULT_ROLE[discipline] ?? 'care_worker'));
    for (const row of plan.rows) {
      if (!row.discipline || row.errors.length) continue;
      const role = roleFor(row.discipline);
      if (!role) row.errors.push(`No login role for ${row.discipline}`);
      else if (role.rolePermissions.some((rp) => !mine.has(`${rp.permission.resource}:${rp.permission.action}`))) {
        row.errors.push('This job role has more access than yours: ask an administrator to import it');
      }
      if (row.errors.length) row.skip = null;
    }

    const views: StaffImportRowView[] = [];
    for (const row of plan.rows) {
      const base = {
        row: row.row,
        name: `${row.firstName} ${row.lastName}`.trim(),
        email: row.email,
        jobRole: row.discipline,
        problems: row.errors,
        warnings: row.warnings,
        adds: planSummary(row),
        staffId: null as string | null,
      };
      if (row.errors.length) views.push({ ...base, status: 'error' });
      else if (row.skip) views.push({ ...base, status: 'skipped', problems: [row.skip], adds: [] });
      else if (dryRun || plan.fileErrors.length) views.push({ ...base, status: 'ready' });
      else {
        try {
          const staffId = await this.save(caller, row, roleFor(row.discipline!)!.id);
          views.push({ ...base, status: 'imported', staffId });
        } catch (error) {
          this.logger.error(`Staff import row ${row.row} failed: ${(error as Error).name}`);
          const taken = (error as { code?: string }).code === 'P2002';
          views.push({ ...base, status: 'error', problems: [taken ? 'Someone with this email or employee ID was added meanwhile' : 'Could not be saved; try again'] });
        }
      }
    }
    const count = (s: StaffImportRowView['status']) => views.filter((v) => v.status === s).length;
    return {
      dryRun,
      fileErrors: plan.fileErrors,
      ignoredColumns: plan.ignoredColumns,
      counts: { ready: count('ready'), imported: count('imported'), skipped: count('skipped'), error: count('error') },
      rows: views,
    };
  }

  private async save(caller: AuthUser, row: ImportPlanRow, roleId: string): Promise<string> {
    // Nobody knows this password: they choose their own with "Forgot password" (or a welcome email, once email is on).
    const passwordHash = await this.passwords.hash(randomBytes(32).toString('base64url'));
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          agencyId: caller.agencyId,
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone,
          passwordHash,
          passwordChangedAt: new Date(),
          userRoles: { create: { roleId } },
        },
        select: { id: true },
      });
      const profile = await tx.staffProfile.create({
        data: {
          userId: user.id,
          agencyId: caller.agencyId,
          discipline: row.discipline!,
          employmentType: row.employmentType,
          employeeId: row.employeeId,
          hireDate: toDate(row.hireDate ?? undefined) ?? null,
          dateOfBirth: toDate(row.dateOfBirth ?? undefined) ?? null,
          hourlyRate: row.hourlyRate,
          addressLine1: row.addressLine1,
          town: row.town,
          postcode: row.postcode,
        },
        select: { id: true },
      });
      const staffProfileId = profile.id;
      // Not "verified": nobody in SHC has seen the evidence yet. The inspection pack shows these as needing evidence.
      const credential = (type: string, name: string, data: { issueDate?: string | null; expiryDate?: string | null; alertDaysBefore?: number; number?: string | null; authority?: string; notes?: string }) =>
        tx.staffCredential.create({
          data: {
            staffProfileId,
            credentialType: type,
            credentialName: name,
            credentialNumber: data.number ?? null,
            issuingAuthority: data.authority ?? null,
            issueDate: toDate(data.issueDate ?? undefined) ?? null,
            expiryDate: toDate(data.expiryDate ?? undefined) ?? null,
            alertDaysBefore: data.alertDaysBefore ?? 30,
            notes: data.notes ?? IMPORT_NOTE,
          },
        });

      if (row.rtw) {
        await tx.rightToWorkCheck.create({
          data: {
            agencyId: caller.agencyId,
            staffProfileId,
            method: RTW_IMPORTED_METHOD,
            permission: row.rtw.permission,
            permissionExpiresOn: toDate(row.rtw.followUpOn ?? undefined) ?? null,
            followUpOn: toDate(row.rtw.followUpOn ?? undefined) ?? null,
            outcome: 'passed',
            checkedOn: toDate(row.rtw.checkedOn)!,
            checkedById: caller.userId,
            notes: IMPORT_NOTE,
          },
        });
        await credential('right_to_work', 'Right to Work: checked before SHC', {
          issueDate: row.rtw.checkedOn,
          expiryDate: row.rtw.followUpOn,
          alertDaysBefore: RTW_ALERT_DAYS,
          authority: 'Home Office',
        });
      }

      if (row.dbs) {
        const nextDue = dbsNextDue({ issueDate: row.dbs.issueDate, updateService: row.dbs.updateService });
        await tx.dbsCheck.create({
          data: {
            agencyId: caller.agencyId,
            staffProfileId,
            certificateNumber: row.dbs.certificateNumber,
            issueDate: toDate(row.dbs.issueDate)!,
            level: row.dbs.level,
            result: row.dbs.result,
            updateService: row.dbs.updateService,
            nextDueOn: toDate(nextDue)!,
            recordedById: caller.userId,
            notes: IMPORT_NOTE,
          },
        });
        // Same rule as recording one by hand: only a clear certificate at a care level counts; anything else shows as
        // not cleared (expired today) until a manager deals with it in the DBS section.
        const counts = (DBS_LEVELS_FOR_CARE as readonly string[]).includes(row.dbs.level) && row.dbs.result === 'clear';
        await credential('dbs_enhanced', `DBS: ${DBS_LEVEL_LABELS[row.dbs.level]}`, {
          issueDate: row.dbs.issueDate,
          expiryDate: counts ? nextDue : (await this.clock.todayString(caller.agencyId)),
          alertDaysBefore: DBS_ALERT_DAYS,
          number: row.dbs.certificateNumber,
          authority: 'Disclosure and Barring Service',
          notes: counts ? IMPORT_NOTE : 'Not cleared to start: see the DBS section.',
        });
      }

      if (row.referencesChecked) await credential('references', CREDENTIAL_TYPE_LABELS.references, {});
      if (row.historyChecked) await credential('employment_history', CREDENTIAL_TYPE_LABELS.employment_history, {});
      for (const c of row.credentials) await credential(c.type, c.label, { issueDate: c.issueDate, expiryDate: c.expiryDate });
      return staffProfileId;
    });
  }
}

@ApiTags('staff')
@Controller('staff-import')
export class StaffImportController {
  constructor(private readonly imports: StaffImportService) {}

  /** Check a staff spreadsheet (dryRun) or import it. Needs both staff and user creation. */
  @Permissions('staff:create', 'users:create')
  @Audit({ action: 'IMPORT_STAFF' })
  @Post()
  @HttpCode(HttpStatus.OK)
  run(@CurrentUser() caller: AuthUser, @Body() dto: StaffImportDto) {
    return this.imports.run(caller, dto);
  }
}
