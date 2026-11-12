import {
  DEFAULT_LEAVE_YEAR_START_MONTH,
  bradfordBand,
  bradfordFactor,
  leaveYear,
  proRataHolidayDays,
  statutoryHolidayDays,
  workingDaysBetween,
} from '@alora/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { addDays, fromDate, toDate } from '../../common/utils/dates.js';
import { AgencyClockService } from '../../database/agency-clock.service.js';
import { PrismaService } from '../../database/prisma.service.js';

export class HolidaySettingsDto {
  /** Contracted working days a week, in half days. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(7)
  daysPerWeek?: number;

  /** Days a full leave year, overriding statutory (irregular hours, or a better contract). null = statutory. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(60)
  holidayDaysOverride?: number | null;
}

export interface HolidaySummary {
  leaveYear: { start: string; end: string };
  daysPerWeek: number;
  /** False when days per week isn't recorded (5 assumed). */
  daysPerWeekSet: boolean;
  /** 5.6 weeks × days per week, max 28. */
  statutory: number;
  override: number | null;
  /** This leave year's allowance: the override or statutory, pro-rated if they started this year. */
  entitlement: number;
  proRated: boolean;
  /** Approved and started. */
  taken: number;
  /** Approved, still to come. */
  booked: number;
  pending: number;
  remaining: number;
}

export interface AbsenceSummary {
  from: string;
  to: string;
  spells: number;
  days: number;
  bradford: number;
  band: ReturnType<typeof bradfordBand>;
  periods: { startDate: string; endDate: string; days: number }[];
}

export interface HolidayReportRow {
  staff: { id: string; name: string; discipline: string };
  holiday: Pick<HolidaySummary, 'entitlement' | 'taken' | 'booked' | 'pending' | 'remaining' | 'daysPerWeekSet'>;
  absence: Pick<AbsenceSummary, 'spells' | 'days' | 'bradford' | 'band'>;
}

type TimeOffRow = { startDate: Date; endDate: Date; type: string; status: string; days: unknown };
type ProfileFacts = { hireDate: Date | null; daysPerWeek: unknown; holidayDaysOverride: unknown; weekdays: number[]; timeOff: TimeOffRow[] };

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const isHalfDays = (n: number) => Number.isInteger(n * 2);

/** Working days a request uses: as entered, else counted on their pattern (availability days, or Monday to Friday). */
export function requestDays(row: { startDate: string; endDate: string; days?: number | null }, weekdays: number[]): number {
  return row.days ?? workingDaysBetween(row.startDate, row.endDate, weekdays);
}

/** Holiday allowance and balance (S3-03), sickness absence with the Bradford factor, and the company report. */
@Injectable()
export class HolidayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AgencyClockService,
  ) {}

  /** The company's first month of the leave year (settings.leaveYearStartMonth), April by default. */
  async leaveYearStartMonth(agencyId: string): Promise<number> {
    const agency = await this.prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { settings: true } });
    const m = (agency.settings as Record<string, unknown> | null)?.leaveYearStartMonth;
    return typeof m === 'number' && m >= 1 && m <= 12 ? m : DEFAULT_LEAVE_YEAR_START_MONTH;
  }

  /** The weekdays someone works (from their availability), for counting days off. */
  async weekdays(staffProfileId: string): Promise<number[]> {
    const slots = await this.prisma.staffAvailability.findMany({ where: { staffProfileId, isAvailable: true }, select: { dayOfWeek: true }, distinct: ['dayOfWeek'] });
    return slots.map((s) => s.dayOfWeek);
  }

  /**
   * Days a new request uses: as entered (half days), else counted on their pattern. Dates that miss the pattern
   * entirely (e.g. a weekend shift, with no availability recorded) count every day: they're asking off, so they work then.
   */
  async daysFor(staffProfileId: string, dto: { startDate: string; endDate: string; days?: number }): Promise<number> {
    if (dto.days !== undefined && !isHalfDays(dto.days)) throw new BadRequestException('Days must be whole or half days');
    return requestDays(dto, await this.weekdays(staffProfileId)) || workingDaysBetween(dto.startDate, dto.endDate, [0, 1, 2, 3, 4, 5, 6]);
  }

  /** Balance for the leave year containing `inYearOf` (default: today). Callers check access first. */
  async summary(agencyId: string, staffId: string, inYearOf?: string): Promise<HolidaySummary> {
    const [facts] = await this.facts(agencyId, [staffId]);
    return this.holiday(facts!, await this.clock.todayString(agencyId), await this.leaveYearStartMonth(agencyId), inYearOf);
  }

  async absence(agencyId: string, staffId: string): Promise<AbsenceSummary> {
    const [facts] = await this.facts(agencyId, [staffId]);
    return this.sickness(facts!, await this.clock.todayString(agencyId));
  }

  /** Annual leave someone asks for themselves must fit what's left in that leave year, counting pending requests. */
  async assertBalance(agencyId: string, staffId: string, startDate: string, days: number): Promise<void> {
    const h = await this.summary(agencyId, staffId, startDate);
    const left = Math.round((h.remaining - h.pending) * 10) / 10;
    if (days > left) {
      throw new BadRequestException(`That uses ${days} day${days === 1 ? '' : 's'}, but only ${Math.max(left, 0)} ${left === 1 ? 'is' : 'are'} left this leave year (including requests waiting for approval). Speak to the office.`);
    }
  }

  async updateSettings(agencyId: string, staffId: string, dto: HolidaySettingsDto): Promise<HolidaySummary> {
    if (dto.daysPerWeek !== undefined && !isHalfDays(dto.daysPerWeek)) throw new BadRequestException('Days per week must be whole or half days');
    await this.prisma.staffProfile.update({
      where: { id: staffId },
      data: {
        ...(dto.daysPerWeek !== undefined ? { daysPerWeek: dto.daysPerWeek } : {}),
        ...(dto.holidayDaysOverride !== undefined ? { holidayDaysOverride: dto.holidayDaysOverride } : {}),
      },
    });
    return this.summary(agencyId, staffId);
  }

  /** Every active member of staff: holiday balance and sickness over the last 52 weeks. */
  async report(agencyId: string): Promise<{ leaveYear: { start: string; end: string }; rows: HolidayReportRow[] }> {
    const today = await this.clock.todayString(agencyId);
    const startMonth = await this.leaveYearStartMonth(agencyId);
    const profiles = await this.prisma.staffProfile.findMany({
      where: { agencyId, isActive: true, user: { isActive: true } },
      select: { id: true, discipline: true, user: { select: { firstName: true, lastName: true } } },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      take: 1000,
    });
    const facts = await this.facts(agencyId, profiles.map((p) => p.id));
    const rows = profiles.map((p, i) => {
      const h = this.holiday(facts[i]!, today, startMonth);
      const a = this.sickness(facts[i]!, today);
      return {
        staff: { id: p.id, name: `${p.user.firstName} ${p.user.lastName}`, discipline: p.discipline },
        holiday: { entitlement: h.entitlement, taken: h.taken, booked: h.booked, pending: h.pending, remaining: h.remaining, daysPerWeekSet: h.daysPerWeekSet },
        absence: { spells: a.spells, days: a.days, bradford: a.bradford, band: a.band },
      };
    });
    return { leaveYear: leaveYear(today, startMonth), rows };
  }

  /** Facts per profile, in the order given. Time off from two years back covers the leave year and the last 52 weeks. */
  private async facts(agencyId: string, ids: string[]): Promise<ProfileFacts[]> {
    const since = toDate(addDays(await this.clock.todayString(agencyId), -800))!;
    const rows = await this.prisma.staffProfile.findMany({
      where: { id: { in: ids }, agencyId },
      select: {
        id: true,
        hireDate: true,
        daysPerWeek: true,
        holidayDaysOverride: true,
        availability: { where: { isAvailable: true }, select: { dayOfWeek: true } },
        timeOff: { where: { endDate: { gte: since }, status: { in: ['pending', 'approved'] } }, select: { startDate: true, endDate: true, type: true, status: true, days: true } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, { ...r, weekdays: [...new Set(r.availability.map((a) => a.dayOfWeek))] }]));
    return ids.map((id) => byId.get(id)!);
  }

  private holiday(p: ProfileFacts, today: string, startMonth: number, inYearOf = today): HolidaySummary {
    const year = leaveYear(inYearOf, startMonth);
    const perWeek = num(p.daysPerWeek);
    const daysPerWeek = perWeek ?? 5;
    const statutory = statutoryHolidayDays(daysPerWeek);
    const override = num(p.holidayDaysOverride);
    const startedOn = fromDate(p.hireDate);
    const entitlement = proRataHolidayDays(override ?? statutory, year, startedOn);
    let taken = 0;
    let booked = 0;
    let pending = 0;
    for (const t of p.timeOff) {
      if (t.type !== 'annual_leave') continue;
      const start = fromDate(t.startDate)!;
      if (start < year.start || start > year.end) continue; // counted in the leave year it starts in
      const days = requestDays({ startDate: start, endDate: fromDate(t.endDate)!, days: num(t.days) }, p.weekdays);
      if (t.status === 'pending') pending += days;
      else if (start <= today) taken += days;
      else booked += days;
    }
    return {
      leaveYear: year,
      daysPerWeek,
      daysPerWeekSet: perWeek !== null,
      statutory,
      override,
      entitlement,
      proRated: Boolean(startedOn && startedOn > year.start),
      taken,
      booked,
      pending,
      remaining: Math.round((entitlement - taken - booked) * 10) / 10,
    };
  }

  private sickness(p: ProfileFacts, today: string): AbsenceSummary {
    const from = addDays(today, -364);
    const periods = p.timeOff
      .filter((t) => t.type === 'sickness' && t.status === 'approved' && fromDate(t.endDate)! >= from && fromDate(t.startDate)! <= today)
      .map((t) => {
        const startDate = fromDate(t.startDate)!;
        const endDate = fromDate(t.endDate)!;
        // Only the part inside the 52 weeks counts.
        const days = num(t.days) ?? workingDaysBetween(startDate < from ? from : startDate, endDate > today ? today : endDate, p.weekdays);
        return { startDate, endDate, days };
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    const days = periods.reduce((n, s) => n + s.days, 0);
    const score = bradfordFactor(periods.length, days);
    return { from, to: today, spells: periods.length, days, bradford: score, band: bradfordBand(score), periods };
  }
}
