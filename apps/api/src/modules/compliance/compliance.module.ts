import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ComplianceService } from './compliance.service.js';
import { CredentialExpiryJob } from './credential-expiry.job.js';
import { AuditLogQueryDto } from './dto/compliance.dto.js';

/** Compliance: dashboard, audit-log search, data-protection checklist. */
@ApiTags('compliance')
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Permissions('compliance:read')
  @Get('dashboard')
  dashboard(@CurrentUser() caller: AuthUser) {
    return this.compliance.dashboard(caller);
  }

  /** Searching the audit log is itself audited. */
  @Permissions('audit_logs:read')
  @Audit({ action: 'SEARCH_AUDIT_LOG', resourceType: 'audit_logs' })
  @Get('audit-logs')
  auditLogs(@CurrentUser() caller: AuthUser, @Query() query: AuditLogQueryDto) {
    return this.compliance.auditLogs(caller, query);
  }

  @Permissions('audit_logs:read')
  @Get('security-checklist')
  securityChecklist(@CurrentUser() caller: AuthUser) {
    return this.compliance.securityChecklist(caller);
  }
}

@Module({
  controllers: [ComplianceController],
  providers: [ComplianceService, CredentialExpiryJob],
  exports: [ComplianceService, CredentialExpiryJob],
})
export class ComplianceModule {}
