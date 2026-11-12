import {
  CARE_CERTIFICATE_STANDARDS,
  CARE_CERTIFICATE_WEEKS,
  TRAINING_MATRIX,
  credentialState,
  needsCareCertificate,
  type TrainingCellState,
} from '@alora/shared';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { addDays, fromDate, toDate } from '../../common/utils/dates.js';
import { IsDateOnly } from '../../common/validators/is-date-only.js';
import { trimmed } from '../../common/validators/fields.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { supersedeOlderCredentials } from './credentials.service.js';
import { StaffService } from './staff.service.js';

export class SignOffStandardDto {
  /** When the assessor saw the standard met. Not in the future. */
  @IsDateOnly({ notInFuture: true })
  completedOn!: string;

  /** e.g. how it was assessed (observed, workbook, discussion). */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export interface CareCertificateView {
  /** Whether their job role does the Care Certificate. */
  needed: boolean;
  startedOn: string | null;
  /** 12 weeks after starting. */
  dueBy: string | null;
  overdue: boolean;
  completed: number;
  total: number;
  /** The Care Certificate credential on file (awarded here, or recorded from elsewhere). */
  awarded: { credentialId: string; issueDate: string | null } | null;
  standards: { number: number; title: string; completedOn: string | null; signedOffBy: { id: string; name: string } | null; notes: string | null }[];
}

export interface TrainingMatrixCell {
  state: TrainingCellState;
  expiryDate: string | null;
}

export interface TrainingMatrix {
  columns: { type: string; label: string }[];
  rows: {
    staff: { id: string; name: string; discipline: string };
    cells: Record<string, TrainingMatrixCell>;
    /** Standards signed off so far, while the Care Certificate is in progress. */
    careCertificate: { completed: number; total: number; dueBy: string | null; overdue: boolean } | null;
  }[];
  totals: Record<string, { missing: number; expired: number; expiringSoon: number }>;
}

const TOTAL = CARE_CERTIFICATE_STANDARDS.length;

/** Care Certificate progress (16 standards, signed off by an assessor) and the training matrix (S3-02). */
@Injectable()
export class CareCertificateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
    private readonly clock: AgencyClockService,
  ) {}

  async get(caller: AuthUser, staffId: string): Promise<CareCertificateView> {
    const profile = await this.staff.find(caller, staffId);
    await this.staff.assertSelfOr(caller, profile, 'staff:read');
    return this.view(caller.agencyId, staffId);
  }

  /** Signs off one standard. Assessors can't sign off their own. All 16 done → the Care Certificate is recorded. */
  async signOff(caller: AuthUser, staffId: string, standard: number, dto: SignOffStandardDto): Promise<CareCertificateView> {
    const profile = await this.staff.find(caller, staffId);
    if (profile.userId === caller.userId) throw new ForbiddenException('Another assessor must sign off your own standards');
    if (!CARE_CERTIFICATE_STANDARDS.some((s) => s.number === standard)) throw new NotFoundException('No such Care Certificate standard');
    const today = await this.clock.todayString(caller.agencyId);
    if (dto.completedOn > today) throw new ConflictException('The completion date cannot be in the future');

    await this.prisma.$transaction(async (tx) => {
      const data = { completedOn: toDate(dto.completedOn)!, signedOffById: caller.userId, notes: dto.notes ?? null };
      await tx.careCertificateSignOff.upsert({
        where: { staffProfileId_standard: { staffProfileId: staffId, standard } },
        create: { agencyId: caller.agencyId, staffProfileId: staffId, standard, ...data },
        update: data,
      });
      const signOffs = await tx.careCertificateSignOff.findMany({ where: { staffProfileId: staffId }, select: { completedOn: true } });
      if (signOffs.length < TOTAL) return;
      const existing = await tx.staffCredential.findFirst({ where: { staffProfileId: staffId, credentialType: 'care_certificate', status: 'active' } });
      if (existing) return;
      const last = signOffs.map((s) => fromDate(s.completedOn)!).sort().at(-1)!;
      const credential = await tx.staffCredential.create({
        data: {
          staffProfileId: staffId,
          credentialType: 'care_certificate',
          credentialName: 'Care Certificate',
          issuingAuthority: 'Assessed in-house (all 16 standards signed off)',
          issueDate: toDate(last),
          verifiedById: caller.userId,
          verifiedAt: new Date(),
        },
      });
      await supersedeOlderCredentials(tx, staffId, 'care_certificate', credential.id);
    });
    return this.view(caller.agencyId, staffId);
  }

  /** Undoes a sign-off made in error. Not once the certificate is on file: remove that credential first. */
  async undo(caller: AuthUser, staffId: string, standard: number): Promise<CareCertificateView> {
    await this.staff.find(caller, staffId);
    const awarded = await this.prisma.staffCredential.count({ where: { staffProfileId: staffId, credentialType: 'care_certificate', status: 'active' } });
    if (awarded) throw new ConflictException('The Care Certificate is already on file');
    const { count } = await this.prisma.careCertificateSignOff.deleteMany({ where: { staffProfileId: staffId, standard, agencyId: caller.agencyId } });
    if (!count) throw new NotFoundException('That standard is not signed off');
    return this.view(caller.agencyId, staffId);
  }

  /** Every active member of staff against the training they need: valid, expiring, expired or missing. */
  async matrix(caller: AuthUser): Promise<TrainingMatrix> {
    const today = await this.clock.todayString(caller.agencyId);
    const types = TRAINING_MATRIX.map((t) => t.type);
    const profiles = await this.prisma.staffProfile.findMany({
      where: { agencyId: caller.agencyId, isActive: true, user: { isActive: true } },
      select: {
        id: true,
        discipline: true,
        hireDate: true,
        user: { select: { firstName: true, lastName: true } },
        credentials: { where: { status: 'active', credentialType: { in: types } }, select: { credentialType: true, expiryDate: true, alertDaysBefore: true } },
        _count: { select: { careCertificate: true } },
      },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      take: 1000,
    });
    const totals = Object.fromEntries(types.map((t) => [t, { missing: 0, expired: 0, expiringSoon: 0 }]));
    const rows = profiles.map((p) => {
      const cells: Record<string, TrainingMatrixCell> = {};
      for (const col of TRAINING_MATRIX) {
        const needed = (col.neededBy as readonly string[]).includes(p.discipline);
        // The best one on file: never expires, else the latest expiry.
        const best = p.credentials
          .filter((c) => c.credentialType === col.type)
          .sort((a, b) => (b.expiryDate?.getTime() ?? Infinity) - (a.expiryDate?.getTime() ?? Infinity))[0];
        let cell: TrainingMatrixCell;
        if (best) {
          const expiry = fromDate(best.expiryDate);
          const s = credentialState(expiry, best.alertDaysBefore, today);
          cell = { state: s === 'no_expiry' ? 'valid' : s, expiryDate: expiry };
        } else cell = { state: needed ? 'missing' : 'not_needed', expiryDate: null };
        if (needed) {
          const t = totals[col.type]!;
          if (cell.state === 'missing') t.missing++;
          if (cell.state === 'expired') t.expired++;
          if (cell.state === 'expiring_soon') t.expiringSoon++;
        }
        cells[col.type] = cell;
      }
      const inProgress = needsCareCertificate(p.discipline) && cells.care_certificate?.state === 'missing';
      const dueBy = p.hireDate ? addDays(fromDate(p.hireDate)!, CARE_CERTIFICATE_WEEKS * 7) : null;
      return {
        staff: { id: p.id, name: `${p.user.firstName} ${p.user.lastName}`, discipline: p.discipline },
        cells,
        careCertificate: inProgress ? { completed: p._count.careCertificate, total: TOTAL, dueBy, overdue: Boolean(dueBy && dueBy < today) } : null,
      };
    });
    return { columns: TRAINING_MATRIX.map(({ type, label }) => ({ type, label })), rows, totals };
  }

  private async view(agencyId: string, staffId: string): Promise<CareCertificateView> {
    const [profile, signOffs, credential, today] = await Promise.all([
      this.prisma.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { discipline: true, hireDate: true } }),
      this.prisma.careCertificateSignOff.findMany({
        where: { staffProfileId: staffId, agencyId },
        include: { signedOffBy: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.staffCredential.findFirst({
        where: { staffProfileId: staffId, credentialType: 'care_certificate', status: 'active' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, issueDate: true },
      }),
      this.clock.todayString(agencyId),
    ]);
    const byNumber = new Map(signOffs.map((s) => [s.standard, s]));
    const startedOn = fromDate(profile.hireDate);
    const dueBy = startedOn ? addDays(startedOn, CARE_CERTIFICATE_WEEKS * 7) : null;
    return {
      needed: needsCareCertificate(profile.discipline),
      startedOn,
      dueBy,
      overdue: Boolean(!credential && dueBy && dueBy < today && signOffs.length < TOTAL),
      completed: signOffs.length,
      total: TOTAL,
      awarded: credential ? { credentialId: credential.id, issueDate: fromDate(credential.issueDate) } : null,
      standards: CARE_CERTIFICATE_STANDARDS.map((s) => {
        const done = byNumber.get(s.number);
        return {
          number: s.number,
          title: s.title,
          completedOn: done ? fromDate(done.completedOn) : null,
          signedOffBy: done?.signedOffBy ? { id: done.signedOffBy.id, name: `${done.signedOffBy.firstName} ${done.signedOffBy.lastName}` } : null,
          notes: done?.notes ?? null,
        };
      }),
    };
  }
}

const uuid = () => new ParseUUIDPipe();

@ApiTags('staff')
@Controller()
export class CareCertificateController {
  constructor(private readonly careCertificate: CareCertificateService) {}

  /** Progress on the 16 standards. The person themselves, or staff:read. */
  @Get('staff/:id/care-certificate')
  get(@CurrentUser() caller: AuthUser, @Param('id', uuid()) id: string) {
    return this.careCertificate.get(caller, id);
  }

  @Permissions('training:manage')
  @Audit({ action: 'SIGN_OFF_CARE_CERTIFICATE_STANDARD', resourceType: 'staff_profiles' })
  @Put('staff/:id/care-certificate/:standard')
  signOff(@CurrentUser() caller: AuthUser, @Param('id', uuid()) id: string, @Param('standard', ParseIntPipe) standard: number, @Body() dto: SignOffStandardDto) {
    return this.careCertificate.signOff(caller, id, standard, dto);
  }

  @Permissions('training:manage')
  @Audit({ action: 'UNDO_CARE_CERTIFICATE_STANDARD', resourceType: 'staff_profiles' })
  @Delete('staff/:id/care-certificate/:standard')
  @HttpCode(HttpStatus.OK)
  undo(@CurrentUser() caller: AuthUser, @Param('id', uuid()) id: string, @Param('standard', ParseIntPipe) standard: number) {
    return this.careCertificate.undo(caller, id, standard);
  }

  /** Who has which training: valid, expiring, expired or missing, per active member of staff. */
  @Permissions('staff:read')
  @Get('training/matrix')
  matrix(@CurrentUser() caller: AuthUser) {
    return this.careCertificate.matrix(caller);
  }
}
