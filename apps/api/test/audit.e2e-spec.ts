import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { IsOptional, IsString } from 'class-validator';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Audit, SkipAudit } from '../src/common/decorators/audit.decorator.js';
import { Permissions } from '../src/common/decorators/permissions.decorator.js';
import { Paginated, PaginationQueryDto } from '../src/common/dto/pagination.dto.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { purgeAuditLogs } from '../src/modules/audit/purge-audit-logs.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { setupApp } from '../src/setup-app.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const PASSWORD = 'Correct-Horse-9!';
const PERSONAL_MARKERS = ['Smith', 'QQ123456C', 'diabetes'];
const noThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};

class CreateFakeStaffDto {
  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  niNumber?: string;
}

class SearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

const CREATED_ID = randomUUID();

/** Test-only routes shaped like the real staff-record endpoints. */
@Controller('audit-probe/staff')
class AuditProbeController {
  @Permissions('staff:read')
  @Get()
  list(@Query() query: SearchQueryDto) {
    return Paginated.of([{ lastName: 'Smith' }, { lastName: 'Jones' }], 2, query);
  }

  @Permissions('staff:read')
  @Get(':id')
  get(@Param('id') id: string) {
    if (id === '00000000-0000-4000-8000-000000000000') throw new NotFoundException('Staff member not found');
    return { id, lastName: 'Smith', diagnosis: 'diabetes' };
  }

  @Permissions('staff:create')
  @Post()
  create(@Body() _dto: CreateFakeStaffDto) {
    return { id: CREATED_ID };
  }

  @Permissions('staff:update')
  @Audit({ action: 'SUSPEND_STAFF' })
  @Post(':id/suspend')
  suspend(@Param('id') id: string) {
    return { id, status: 'suspended' };
  }

  @Permissions('staff:read')
  @SkipAudit()
  @Get('-/poll')
  poll() {
    return { changed: false };
  }

  @Permissions('pay:read')
  @Get('-/billing')
  billing() {
    return 'billing';
  }
}

describe.skipIf(!hasDb)('Audit trail (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agencyId: string;
  let userId: string;
  let auth: { Authorization: string };
  const http = () => request(app.getHttpServer());

  /** Audit rows for this test's user, newest first. */
  const entries = (action?: string) =>
    prisma.auditLog.findMany({
      where: { userId, ...(action ? { action } : {}) },
      orderBy: { id: 'desc' },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AuditProbeController],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue(noThrottle)
      .compile();
    app = setupApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
    prisma = app.get(PrismaService);
    agencyId = (await prisma.agency.create({ data: { name: `Audit Test ${randomUUID()}` } })).id;

    const officeStaff = await prisma.role.findFirstOrThrow({ where: { agencyId: null, name: 'care_coordinator' } });
    const email = `audit-${randomUUID()}@example.test`;
    userId = (
      await prisma.user.create({
        data: {
          agencyId,
          email,
          passwordHash: await app.get(PasswordService).hash(PASSWORD),
          passwordChangedAt: new Date(),
          firstName: 'Audit',
          lastName: 'User',
          userRoles: { create: { roleId: officeStaff.id } },
        },
      })
    ).id;
    const { accessToken } = (await http().post('/api/v1/auth/login').send({ email, password: PASSWORD })).body.data;
    auth = { Authorization: `Bearer ${accessToken}` };
  });

  afterAll(async () => {
    await purgeAuditLogs(prisma, agencyId);
    await prisma.user.deleteMany({ where: { agencyId } });
    await prisma.agency.delete({ where: { id: agencyId } });
    await app.close();
  });

  it('records a read of one record: who, what, which record, route pattern, correlation id', async () => {
    const id = randomUUID();
    const res = await http().get(`/api/v1/audit-probe/staff/${id}`).set(auth).expect(200);

    const [entry] = await entries('VIEW_STAFF');
    expect(entry).toMatchObject({ agencyId, userId, resourceType: 'staff', resourceId: id });
    expect(entry!.details).toMatchObject({
      outcome: 'success',
      method: 'GET',
      route: '/api/v1/audit-probe/staff/:id',
      correlationId: res.headers['x-request-id'],
    });
    expect(entry!.ipAddress).toBeTruthy();
  });

  it('records list reads with a result count and query-parameter names, never their values', async () => {
    await http().get('/api/v1/audit-probe/staff?search=Smith&page=1').set(auth).expect(200);
    const [entry] = await entries('VIEW_STAFF');
    expect(entry!.resourceId).toBeNull();
    expect(entry!.details).toMatchObject({ resultCount: 2, queryKeys: ['page', 'search'] });
  });

  it('records creates with the new record id, and never stores the request body', async () => {
    await http()
      .post('/api/v1/audit-probe/staff')
      .set(auth)
      .send({ lastName: 'Smith', niNumber: 'QQ123456C' })
      .expect(201);
    const [entry] = await entries('CREATE_STAFF');
    expect(entry!.resourceId).toBe(CREATED_ID);
  });

  it('records failures too (e.g. reading a record that does not exist)', async () => {
    await http().get('/api/v1/audit-probe/staff/00000000-0000-4000-8000-000000000000').set(auth).expect(404);
    const [entry] = await entries('VIEW_STAFF');
    expect(entry!.details).toMatchObject({ outcome: 'error', status: 404 });
  });

  it('uses @Audit to name the action', async () => {
    const id = randomUUID();
    await http().post(`/api/v1/audit-probe/staff/${id}/suspend`).set(auth).expect(201);
    const [entry] = await entries('SUSPEND_STAFF');
    expect(entry!.resourceId).toBe(id);
  });

  it('records denied access with the missing permission', async () => {
    await http().get('/api/v1/audit-probe/staff/-/billing').set(auth).expect(403);
    const [entry] = await entries('ACCESS_DENIED');
    expect(entry!.details).toMatchObject({ missing: ['pay:read'] });
  });

  it('skips @SkipAudit routes and does not audit anonymous requests', async () => {
    const before = (await entries()).length;
    await http().get('/api/v1/audit-probe/staff/-/poll').set(auth).expect(200);
    await http().get('/api/v1/audit-probe/staff').expect(401);
    expect((await entries()).length).toBe(before);
  });

  it('never writes personal data into the audit trail', async () => {
    const all = await prisma.auditLog.findMany({ where: { agencyId } });
    const text = JSON.stringify(all.map(({ details, userAgent }) => ({ details, userAgent })));
    for (const marker of PERSONAL_MARKERS) expect(text).not.toContain(marker);
  });

  it('tells browsers and proxies not to cache API responses', async () => {
    const res = await http().get(`/api/v1/audit-probe/staff/${randomUUID()}`).set(auth).expect(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers.pragma).toBe('no-cache');
  });
});
