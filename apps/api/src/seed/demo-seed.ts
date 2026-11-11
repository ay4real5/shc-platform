import { randomUUID } from 'node:crypto';
import { MANDATORY_TWO_FACTOR_ROLES, todayInTimeZone, type Discipline, type Role } from '@alora/shared';
import { hash } from '@node-rs/argon2';
import { addDays, toDate, toTime } from '../common/utils/dates.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { purgeAuditLogs } from '../modules/audit/purge-audit-logs.js';

/**
 * Demo data for development and demos. Everything here is FAKE — invented names, example.test style emails, 07700 900xxx
 * phone numbers (Ofcom's range reserved for drama). Deterministic (fixed-seed PRNG), idempotent (the demo company is
 * wiped and rebuilt on every run), and refuses to run in production.
 */

export const DEMO_AGENCY_ID = '00000000-0000-4000-8000-00000000d3a0';
export const DEMO_EMAIL_DOMAIN = 'demo.shc.test';
export const DEFAULT_DEMO_PASSWORD = 'Demo-Password-1!';

export interface SeedSummary {
  agencyId: string;
  logins: { role: string; email: string }[];
  password: string;
  counts: Record<string, number>;
}

export interface SeedOptions {
  password?: string;
  appEnv?: string;
  /**
   * Encrypts a base32 TOTP secret the way users.two_fa_secret stores it. When provided, demo admins get 2FA already
   * on with DEMO_TOTP_SECRET (admins must use 2FA); otherwise they set it up at first sign-in.
   */
  encryptTwoFaSecret?: (base32Secret: string) => string;
  /** Encrypts a message's text (PhiCryptoService.encryptBytes with messageContentContext). No messages without it. */
  encryptMessage?: (text: string, messageId: string) => Uint8Array<ArrayBuffer>;
  /** Makes sure built-in roles exist (RbacSyncService.sync). */
  syncRoles: () => Promise<void>;
}

/**
 * The demo admins' authenticator secret (FAKE data, development only — the seed refuses to run in production).
 * Add it to an authenticator app, or compute codes from it in tests.
 */
export const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

/** Small deterministic PRNG (mulberry32), so every run produces the same demo company. */
function prng(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
  };
}

const FIRST = ['Amara', 'Ben', 'Chloe', 'Dami', 'Ellie', 'Femi', 'Grace', 'Harry', 'Isla', 'Jack', 'Kemi', 'Liam', 'Maya', 'Noah', 'Olu', 'Priya', 'Rosie', 'Sam', 'Tunde', 'Zara'];
const LAST = ['Ashworth', 'Bramley', 'Carver', 'Dalton', 'Ellison', 'Fenwick', 'Garside', 'Holloway', 'Ingram', 'Kershaw', 'Lockwood', 'Marsden', 'Northcott', 'Pemberton', 'Radcliffe', 'Shaw', 'Thornton', 'Whitaker'];

/** Staff to create: discipline, how many, their login role. */
const STAFF_PLAN: { discipline: Discipline; count: number; role: string }[] = [
  { discipline: 'RN', count: 1, role: 'registered_nurse' },
  { discipline: 'CNA', count: 3, role: 'home_health_aide' },
  { discipline: 'HHA', count: 8, role: 'home_health_aide' },
];
const OFFICE_ROLES = ['super_admin', 'agency_admin', 'supervisor', 'office_staff'];

export async function runDemoSeed(prisma: PrismaClient, options: SeedOptions): Promise<SeedSummary> {
  if (options.appEnv === 'production') {
    throw new Error('Refusing to seed demo data into a production environment');
  }
  const password = options.password ?? DEFAULT_DEMO_PASSWORD;
  const rand = prng(20261111);
  await options.syncRoles();

  await wipeDemoAgency(prisma);
  const timezone = 'Europe/London';
  await prisma.agency.create({
    data: {
      id: DEMO_AGENCY_ID,
      name: 'Demo Care Services (FAKE DATA)',
      phone: '07700 900100',
      email: `office@${DEMO_EMAIL_DOMAIN}`,
      addressLine1: '1 Demo Street',
      city: 'Manchester',
      zip: 'M1 1AA',
      timezone,
    },
  });

  const roles = new Map((await prisma.role.findMany({ where: { agencyId: null, isSystem: true } })).map((r) => [r.name, r.id]));
  const passwordHash = await hash(password); // same fake password for every demo login
  const logins: SeedSummary['logins'] = [];

  const makeUser = async (role: string, email: string, firstName: string, lastName: string) => {
    const user = await prisma.user.create({
      data: {
        agencyId: DEMO_AGENCY_ID,
        email,
        passwordHash,
        passwordChangedAt: new Date(),
        firstName,
        lastName,
        phone: `07700 900${String(rand.int(100, 999))}`,
        userRoles: { create: { roleId: roles.get(role)! } },
        ...(MANDATORY_TWO_FACTOR_ROLES.includes(role as Role) && options.encryptTwoFaSecret
          ? { is2faEnabled: true, twoFaSecret: options.encryptTwoFaSecret(DEMO_TOTP_SECRET) }
          : {}),
      },
    });
    return user.id;
  };

  for (const role of OFFICE_ROLES) {
    const email = `${role.replaceAll('_', '.')}@${DEMO_EMAIL_DOMAIN}`;
    await makeUser(role, email, rand.pick(FIRST), rand.pick(LAST));
    logins.push({ role, email });
  }

  // Staff, each with a profile, credentials and weekday availability.
  const today = todayInTimeZone(timezone);
  let staffNo = 0;
  let credentials = 0;
  for (const plan of STAFF_PLAN) {
    for (let i = 0; i < plan.count; i++) {
      staffNo++;
      const first = rand.pick(FIRST);
      const last = rand.pick(LAST);
      const loginEmail = i === 0 ? `${plan.discipline.toLowerCase()}@${DEMO_EMAIL_DOMAIN}` : `${first}.${last}.${staffNo}@${DEMO_EMAIL_DOMAIN}`.toLowerCase();
      const userId = await makeUser(plan.role, loginEmail, first, last);
      if (i === 0) logins.push({ role: `${plan.role} (${plan.discipline})`, email: loginEmail });

      const profile = await prisma.staffProfile.create({
        data: {
          userId,
          agencyId: DEMO_AGENCY_ID,
          employeeId: `D${String(staffNo).padStart(4, '0')}`,
          discipline: plan.discipline,
          employmentType: rand.pick(['full_time', 'full_time', 'part_time', 'per_diem']),
          hireDate: toDate(addDays(today, -rand.int(30, 1500))),
          hourlyRate: plan.discipline === 'RN' ? 22 + rand.int(0, 6) : 12 + rand.int(0, 3),
          city: 'Manchester',
          zip: rand.pick(['M1 2AB', 'M4 5CD', 'M14 6EF', 'M20 7GH']),
          languages: rand.next() < 0.3 ? ['English', 'Yoruba'] : ['English'],
        },
      });

      // Credentials: most valid, some expiring within the month, one already expired — so alerts have data.
      const dbsExpiry = staffNo === 2 ? addDays(today, -5) : addDays(today, staffNo % 4 === 0 ? rand.int(3, 25) : rand.int(90, 700));
      const rows = [
        { staffProfileId: profile.id, credentialType: 'dbs_enhanced', credentialName: 'Enhanced DBS with adult barred list (FAKE)', credentialNumber: `00${rand.int(1000000000, 9999999999)}`, expiryDate: toDate(dbsExpiry) },
        { staffProfileId: profile.id, credentialType: 'right_to_work', credentialName: 'Right to Work check', expiryDate: staffNo % 5 === 0 ? toDate(addDays(today, rand.int(20, 60))) : null },
        { staffProfileId: profile.id, credentialType: 'care_certificate', credentialName: 'Care Certificate', issueDate: toDate(addDays(today, -rand.int(30, 600))) },
        { staffProfileId: profile.id, credentialType: 'moving_handling', credentialName: 'Moving & handling', expiryDate: toDate(addDays(today, rand.int(-10, 365))) },
      ];
      await prisma.staffCredential.createMany({ data: rows });
      credentials += rows.length;
      await prisma.staffAvailability.createMany({
        data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ staffProfileId: profile.id, dayOfWeek, startTime: toTime('08:00'), endTime: toTime('20:00') })),
      });
    }
  }

  const messages = options.encryptMessage ? await seedMessages(prisma, options.encryptMessage) : 0;
  return {
    agencyId: DEMO_AGENCY_ID,
    logins,
    password,
    counts: { users: logins.length + staffNo - STAFF_PLAN.length, staff: staffNo, credentials, messages },
  };
}

async function seedMessages(prisma: PrismaClient, encrypt: (text: string, messageId: string) => Uint8Array<ArrayBuffer>): Promise<number> {
  const byEmail = async (local: string) =>
    (await prisma.user.findFirstOrThrow({ where: { agencyId: DEMO_AGENCY_ID, email: `${local}@${DEMO_EMAIL_DOMAIN}` } })).id;
  const [office, supervisor, rn, hha] = await Promise.all(['office.staff', 'supervisor', 'rn', 'hha'].map(byEmail));
  const threads: { subject?: string; people: string[]; lines: [string, string][] }[] = [
    {
      people: [office!, hha!],
      lines: [
        [office!, 'Your DBS update check is due — can you pop into the office this week?'],
        [hha!, 'Yes, I can come in on Thursday morning.'],
      ],
    },
    {
      subject: 'Team leaders',
      people: [supervisor!, rn!, office!],
      lines: [
        [supervisor!, 'Three new starters next week — inductions on Monday.'],
        [rn!, 'I can run the medication training on Tuesday.'],
      ],
    },
  ];
  let count = 0;
  const start = Date.now() - 3 * 3_600_000;
  for (const [t, thread] of threads.entries()) {
    const conversation = await prisma.conversation.create({
      data: {
        agencyId: DEMO_AGENCY_ID,
        type: thread.people.length === 2 ? 'direct' : 'group',
        subject: thread.subject ?? null,
        createdById: thread.lines[0]![0],
        participants: { create: thread.people.map((userId) => ({ userId })) },
      },
    });
    let at = new Date();
    for (const [i, [senderId, text]] of thread.lines.entries()) {
      at = new Date(start + (t * 60 + i * 20) * 60_000);
      const id = randomUUID();
      await prisma.message.create({
        data: { id, agencyId: DEMO_AGENCY_ID, conversationId: conversation.id, senderId, contentEncrypted: encrypt(text, id), createdAt: at },
      });
      await prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId: conversation.id, userId: senderId } },
        data: { lastReadAt: at },
      });
      count++;
    }
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: at } });
  }
  return count;
}

export async function wipeDemoAgency(prisma: PrismaClient): Promise<void> {
  const where = { agencyId: DEMO_AGENCY_ID };
  await prisma.notification.deleteMany({ where });
  await purgeAuditLogs(prisma, DEMO_AGENCY_ID);
  await prisma.conversation.deleteMany({ where }); // participants and messages cascade
  await prisma.document.deleteMany({ where }); // stored files cascade; version links are cleared
  await prisma.trainingCourse.deleteMany({ where }); // questions and completions cascade
  await prisma.user.deleteMany({ where }); // staff profiles, credentials, availability, tokens, roles-links cascade
  await prisma.role.deleteMany({ where });
  await prisma.agency.deleteMany({ where: { id: DEMO_AGENCY_ID } });
}
