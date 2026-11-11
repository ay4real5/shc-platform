import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service.js';

// Runs against a real, migrated Postgres. CI provides one; locally it is skipped when DATABASE_URL is unset.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('database schema (e2e)', () => {
  let prisma: PrismaService;
  let agencyId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
    const agency = await prisma.agency.create({ data: { name: `Test Agency ${randomUUID()}` } });
    agencyId = agency.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { agencyId } }); // staff profiles and credentials cascade
    await prisma.agency.delete({ where: { id: agencyId } });
    await prisma.$disconnect();
  });

  async function staff(email = `db-${randomUUID()}@example.test`) {
    const user = await prisma.user.create({ data: { agencyId, email, passwordHash: 'x', firstName: 'Test', lastName: 'Staff' } });
    return prisma.staffProfile.create({ data: { agencyId, userId: user.id, discipline: 'care_worker' } });
  }

  it('applies database defaults (uuid, timestamps, status)', async () => {
    const profile = await staff();
    expect(profile.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(profile.isActive).toBe(true);
    expect(profile.employmentType).toBe('full_time');
    expect(profile.createdAt).toBeInstanceOf(Date);
  });

  it('enforces unique email addresses', async () => {
    const data = { agencyId, email: `dup-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'A', lastName: 'B' };
    await prisma.user.create({ data });
    await expect(prisma.user.create({ data })).rejects.toThrow();
  });

  it('cascades staff children on delete', async () => {
    const profile = await staff();
    await prisma.staffCredential.create({ data: { staffProfileId: profile.id, credentialType: 'dbs_enhanced', credentialName: 'DBS' } });
    await prisma.user.delete({ where: { id: profile.userId } });
    expect(await prisma.staffCredential.count({ where: { staffProfileId: profile.id } })).toBe(0);
  });
});
