import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { HolidayService, HolidaySettingsDto } from './holiday.js';
import { StaffService } from './staff.service.js';

/** Holiday and absence routes (S3-03). Separate from holiday.ts, which StaffService imports. */
const uuid = () => new ParseUUIDPipe();

@ApiTags('staff')
@Controller()
export class HolidayController {
  constructor(
    private readonly holiday: HolidayService,
    private readonly staff: StaffService,
  ) {}

  /** Holiday allowance and balance this leave year. The person themselves, or staff:read. */
  @Get('staff/:id/holiday')
  async summary(@CurrentUser() caller: AuthUser, @Param('id', uuid()) id: string) {
    await this.staff.assertSelfOr(caller, await this.staff.find(caller, id), 'staff:read');
    return this.holiday.summary(caller.agencyId, id);
  }

  @Permissions('staff:update')
  @Audit({ action: 'UPDATE_HOLIDAY_SETTINGS', resourceType: 'staff_profiles' })
  @Patch('staff/:id/holiday')
  async update(@CurrentUser() caller: AuthUser, @Param('id', uuid()) id: string, @Body() dto: HolidaySettingsDto) {
    await this.staff.find(caller, id);
    return this.holiday.updateSettings(caller.agencyId, id, dto);
  }

  /** Sickness over the last 52 weeks, with the Bradford factor. The person themselves, or staff:read. */
  @Get('staff/:id/absence')
  async absence(@CurrentUser() caller: AuthUser, @Param('id', uuid()) id: string) {
    await this.staff.assertSelfOr(caller, await this.staff.find(caller, id), 'staff:read');
    return this.holiday.absence(caller.agencyId, id);
  }

  /** Everyone's holiday balance and sickness, for the office. */
  @Permissions('staff:read')
  @Get('holiday/report')
  report(@CurrentUser() caller: AuthUser) {
    return this.holiday.report(caller.agencyId);
  }
}
