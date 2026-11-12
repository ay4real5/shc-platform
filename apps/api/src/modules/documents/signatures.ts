import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DISCIPLINES } from '@alora/shared';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { trimmed } from '../../common/validators/fields.js';
import { IsDateOnly } from '../../common/validators/is-date-only.js';
import { fromDate, toDate } from '../../common/utils/dates.js';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PermissionsService } from '../rbac/permissions.service.js';
import { DocumentStorage } from './document-storage.js';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// ---------- DTOs ----------

export class SendForSignatureDto {
  /** Staff profiles to ask. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  staffIds!: string[];

  @IsOptional()
  @IsDateOnly()
  dueOn?: string;
}

export class SignRequestDto {
  /** The signer types their full name. */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  typedName!: string;

  /** "I have read and agree to this document." */
  @IsBoolean()
  agreed!: boolean;
}

export class PackDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  /** Job roles it applies to; empty = everyone. */
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(DISCIPLINES, { each: true })
  disciplines!: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  documentIds!: string[];
}

// ---------- views ----------

export interface SignatureRequestView {
  id: string;
  document: { id: string; title: string; documentType: string; personal: boolean };
  staff: { id: string; firstName: string; lastName: string };
  /** pending | signed | cancelled */
  status: string;
  dueOn: string | null;
  requestedAt: Date;
  signedAt: Date | null;
  signedName: string | null;
}

export interface PackView {
  id: string;
  name: string;
  disciplines: string[];
  documents: { id: string; title: string }[];
}

const REQUEST_INCLUDE = {
  document: { select: { id: true, title: true, documentType: true, staffId: true } },
  staffProfile: { select: { id: true, userId: true, user: { select: { firstName: true, lastName: true } } } },
} as const;

/**
 * Documents to sign (S2-04): a document — a personal contract or a company policy — is sent to people; each signs
 * their own request (typed name, time, IP, browser, and the SHA-256 of exactly the file they signed). People can
 * open and sign what was sent to them without any documents permission. Onboarding packs send a set of company
 * documents by job role, automatically on hire.
 */
@Injectable()
export class SignaturesService {
  private readonly logger = new Logger(SignaturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorage,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
  ) {}

  async send(caller: AuthUser, documentId: string, staffIds: string[], dueOn?: string): Promise<{ created: number; alreadyAsked: number }> {
    const doc = await this.prisma.document.findFirst({ where: { id: documentId, agencyId: caller.agencyId, deletedAt: null }, select: { id: true, title: true, staffId: true, nextVersion: { select: { id: true } } } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.nextVersion) throw new ConflictException('Send the newest version');
    if (doc.staffId && staffIds.some((s) => s !== doc.staffId)) throw new BadRequestException('A personal document can only be sent to its own person');
    const staff = await this.prisma.staffProfile.findMany({ where: { id: { in: [...new Set(staffIds)] }, agencyId: caller.agencyId, isActive: true }, select: { id: true, userId: true } });
    if (staff.length !== new Set(staffIds).size) throw new BadRequestException('Every person must be active staff in your company');
    return this.create(caller.agencyId, caller.userId, doc, staff, dueOn);
  }

  /** Sends every matching pack's documents to one staff member (used on hire and from the staff page). */
  async sendPacks(agencyId: string, actorId: string, staffProfileId: string): Promise<{ created: number; alreadyAsked: number }> {
    const profile = await this.prisma.staffProfile.findFirst({ where: { id: staffProfileId, agencyId }, select: { id: true, userId: true, discipline: true } });
    if (!profile) throw new NotFoundException('Staff member not found');
    const packs = await this.prisma.onboardingPack.findMany({ where: { agencyId } });
    const ids = [...new Set(packs.filter((p) => p.disciplines.length === 0 || p.disciplines.includes(profile.discipline)).flatMap((p) => p.documentIds))];
    const docs = await this.prisma.document.findMany({ where: { id: { in: ids }, agencyId, deletedAt: null, staffId: null, nextVersion: null }, select: { id: true, title: true, staffId: true } });
    let created = 0;
    let alreadyAsked = 0;
    for (const doc of docs) {
      const r = await this.create(agencyId, actorId, doc, [profile], undefined, false);
      created += r.created;
      alreadyAsked += r.alreadyAsked;
    }
    if (created) {
      await this.notifyQuietly(agencyId, actorId, [profile.userId], created === 1 ? `Please sign: ${docs[0]!.title}` : `You have ${created} documents to sign`);
    }
    return { created, alreadyAsked };
  }

  async forDocument(caller: AuthUser, documentId: string): Promise<SignatureRequestView[]> {
    const rows = await this.prisma.signatureRequest.findMany({ where: { documentId, agencyId: caller.agencyId }, include: REQUEST_INCLUDE, orderBy: { requestedAt: 'desc' } });
    return rows.map(toView);
  }

  /** A staff member's requests: the person themselves, or anyone with staff:read. */
  async forStaff(caller: AuthUser, staffId: string): Promise<SignatureRequestView[]> {
    const profile = await this.prisma.staffProfile.findFirst({ where: { id: staffId, agencyId: caller.agencyId }, select: { userId: true } });
    if (!profile) throw new NotFoundException('Staff member not found');
    if (profile.userId !== caller.userId && !(await this.permissions.forUser(caller)).permissions.has('staff:read')) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    const rows = await this.prisma.signatureRequest.findMany({ where: { staffProfileId: staffId, status: { not: 'cancelled' } }, include: REQUEST_INCLUDE, orderBy: { requestedAt: 'desc' } });
    return rows.map(toView);
  }

  async mine(caller: AuthUser): Promise<SignatureRequestView[]> {
    const rows = await this.prisma.signatureRequest.findMany({
      where: { agencyId: caller.agencyId, staffProfile: { userId: caller.userId }, status: { not: 'cancelled' } },
      include: REQUEST_INCLUDE,
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
    });
    return rows.map(toView);
  }

  /** The file, for the person asked to sign it (or anyone with documents:read). */
  async file(caller: AuthUser, requestId: string): Promise<{ fileName: string; mimeType: string; content: Buffer }> {
    const row = await this.own(caller, requestId, 'documents:read');
    const doc = await this.prisma.document.findUniqueOrThrow({ where: { id: row.documentId }, select: { id: true, fileName: true, mimeType: true, contentHash: true } });
    const content = await this.storage.load(doc.id);
    if (doc.contentHash && sha256(content) !== doc.contentHash) throw new ConflictException('The stored file does not match what was uploaded');
    return { fileName: doc.fileName, mimeType: doc.mimeType ?? 'application/octet-stream', content };
  }

  /** Only the person themselves signs. */
  async sign(caller: AuthUser, requestId: string, dto: SignRequestDto, client: { ip?: string; userAgent?: string }): Promise<SignatureRequestView> {
    if (!dto.agreed) throw new BadRequestException('Tick to confirm you have read and agree to the document');
    const row = await this.own(caller, requestId, null);
    if (row.status !== 'pending') throw new ConflictException(row.status === 'signed' ? 'Already signed' : 'This request was cancelled');
    const doc = await this.prisma.document.findUniqueOrThrow({ where: { id: row.documentId }, select: { id: true, staffId: true, contentHash: true, deletedAt: true, nextVersion: { select: { id: true } } } });
    if (doc.deletedAt || doc.nextVersion) throw new ConflictException('This document has been replaced; ask the office to send the new version');
    const content = await this.storage.load(doc.id);
    const hash = sha256(content);
    if (doc.contentHash && hash !== doc.contentHash) throw new ConflictException('The stored file does not match what was uploaded');
    const signedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.signatureRequest.updateMany({
        where: { id: row.id, status: 'pending' },
        data: { status: 'signed', signedAt, signedName: dto.typedName, contentHash: hash, ip: client.ip ?? null, userAgent: client.userAgent?.slice(0, 255) ?? null },
      });
      if (!done.count) throw new ConflictException('Already signed');
      // A personal document (e.g. their contract) also carries the signature itself, as before.
      if (doc.staffId === row.staffProfileId) {
        await tx.document.updateMany({
          where: { id: doc.id, isSigned: false },
          data: { isSigned: true, signatureData: { signedById: caller.userId, name: dto.typedName, signedAt: signedAt.toISOString(), contentHash: hash, ip: client.ip ?? null, userAgent: client.userAgent?.slice(0, 255) ?? null } },
        });
      }
    });
    return toView(await this.prisma.signatureRequest.findUniqueOrThrow({ where: { id: row.id }, include: REQUEST_INCLUDE }));
  }

  async cancel(caller: AuthUser, requestId: string): Promise<void> {
    const done = await this.prisma.signatureRequest.updateMany({ where: { id: requestId, agencyId: caller.agencyId, status: 'pending' }, data: { status: 'cancelled' } });
    if (!done.count) throw new ConflictException('Only a request still waiting to be signed can be cancelled');
  }

  // ---------- packs ----------

  async packs(caller: AuthUser): Promise<PackView[]> {
    const rows = await this.prisma.onboardingPack.findMany({ where: { agencyId: caller.agencyId }, orderBy: { name: 'asc' } });
    const docs = await this.prisma.document.findMany({ where: { id: { in: rows.flatMap((r) => r.documentIds) }, agencyId: caller.agencyId }, select: { id: true, title: true } });
    const titles = new Map(docs.map((d) => [d.id, d.title]));
    return rows.map((r) => ({ id: r.id, name: r.name, disciplines: r.disciplines, documents: r.documentIds.filter((id) => titles.has(id)).map((id) => ({ id, title: titles.get(id)! })) }));
  }

  async savePack(caller: AuthUser, dto: PackDto, id?: string): Promise<PackView> {
    const ids = [...new Set(dto.documentIds)];
    const valid = await this.prisma.document.count({ where: { id: { in: ids }, agencyId: caller.agencyId, staffId: null, deletedAt: null } });
    if (valid !== ids.length) throw new BadRequestException('A pack can only hold company documents (not someone’s personal file)');
    const data = { name: dto.name, disciplines: [...new Set(dto.disciplines)], documentIds: ids };
    if (id) {
      const done = await this.prisma.onboardingPack.updateMany({ where: { id, agencyId: caller.agencyId }, data });
      if (!done.count) throw new NotFoundException('Pack not found');
    } else {
      id = (await this.prisma.onboardingPack.create({ data: { ...data, agencyId: caller.agencyId } })).id;
    }
    return (await this.packs(caller)).find((p) => p.id === id)!;
  }

  async deletePack(caller: AuthUser, id: string): Promise<void> {
    const done = await this.prisma.onboardingPack.deleteMany({ where: { id, agencyId: caller.agencyId } });
    if (!done.count) throw new NotFoundException('Pack not found');
  }

  // ---------- helpers ----------

  private async create(
    agencyId: string,
    actorId: string,
    doc: { id: string; title: string },
    staff: { id: string; userId: string }[],
    dueOn?: string,
    notify = true,
  ): Promise<{ created: number; alreadyAsked: number }> {
    const existing = await this.prisma.signatureRequest.findMany({ where: { documentId: doc.id, staffProfileId: { in: staff.map((s) => s.id) }, status: { in: ['pending', 'signed'] } }, select: { staffProfileId: true } });
    const skip = new Set(existing.map((e) => e.staffProfileId));
    const fresh = staff.filter((s) => !skip.has(s.id));
    if (fresh.length) {
      await this.prisma.signatureRequest.createMany({
        data: fresh.map((s) => ({ agencyId, documentId: doc.id, staffProfileId: s.id, requestedById: actorId, dueOn: toDate(dueOn) ?? null })),
      });
      if (notify) await this.notifyQuietly(agencyId, actorId, fresh.map((s) => s.userId), `Please sign: ${doc.title}`);
    }
    return { created: fresh.length, alreadyAsked: skip.size };
  }

  private async notifyQuietly(agencyId: string, actorId: string, userIds: string[], title: string): Promise<void> {
    try {
      await this.notifications.notify({ agencyId, userIds, actorUserId: actorId, type: 'document_signature', title: title.slice(0, 200), body: 'Open the app to read and sign.' });
    } catch (error) {
      this.logger.error(`Signature notification failed: ${(error as Error).name}`);
    }
  }

  /** The request, if the caller is the person asked — or holds `permission` (null = the person only). */
  private async own(caller: AuthUser, requestId: string, permission: 'documents:read' | null) {
    const row = await this.prisma.signatureRequest.findFirst({ where: { id: requestId, agencyId: caller.agencyId }, include: { staffProfile: { select: { userId: true } } } });
    if (!row) throw new NotFoundException('Not found');
    if (row.staffProfile.userId === caller.userId) return row;
    if (permission && (await this.permissions.forUser(caller)).permissions.has(permission)) return row;
    throw new ForbiddenException(permission ? 'You do not have permission to do this' : 'Only the person asked can sign this');
  }
}

function toView(r: {
  id: string;
  status: string;
  dueOn: Date | null;
  requestedAt: Date;
  signedAt: Date | null;
  signedName: string | null;
  staffProfileId: string;
  document: { id: string; title: string; documentType: string; staffId: string | null };
  staffProfile: { id: string; user: { firstName: string; lastName: string } };
}): SignatureRequestView {
  return {
    id: r.id,
    document: { id: r.document.id, title: r.document.title, documentType: r.document.documentType, personal: r.document.staffId === r.staffProfileId },
    staff: { id: r.staffProfile.id, firstName: r.staffProfile.user.firstName, lastName: r.staffProfile.user.lastName },
    status: r.status,
    dueOn: fromDate(r.dueOn),
    requestedAt: r.requestedAt,
    signedAt: r.signedAt,
    signedName: r.signedName,
  };
}

// ---------- controller ----------

@ApiTags('documents')
@Controller()
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Permissions('documents:create')
  @Audit({ action: 'SEND_FOR_SIGNATURE', resourceType: 'documents' })
  @Post('documents/:id/signature-requests')
  send(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendForSignatureDto) {
    return this.signatures.send(caller, id, dto.staffIds, dto.dueOn);
  }

  @Permissions('documents:read')
  @Get('documents/:id/signature-requests')
  forDocument(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.signatures.forDocument(caller, id);
  }

  @Get('staff/:id/signature-requests')
  forStaff(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.signatures.forStaff(caller, id);
  }

  @Permissions('documents:create')
  @Audit({ action: 'SEND_ONBOARDING_PACK', resourceType: 'staff' })
  @Post('staff/:id/onboarding-pack')
  sendPack(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.signatures.sendPacks(caller.agencyId, caller.userId, id);
  }

  /** What I've been asked to sign. */
  @Get('signature-requests/mine')
  mine(@CurrentUser() caller: AuthUser) {
    return this.signatures.mine(caller);
  }

  @Audit({ action: 'VIEW_DOCUMENT_TO_SIGN', resourceType: 'signature_requests' })
  @Get('signature-requests/:id/file')
  async file(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.signatures.file(caller, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName.replace(/["\\\r\n]/g, '_')}"`);
    return new StreamableFile(file.content);
  }

  @Audit({ action: 'SIGN_DOCUMENT', resourceType: 'signature_requests' })
  @HttpCode(HttpStatus.OK)
  @Post('signature-requests/:id/sign')
  sign(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SignRequestDto, @Req() req: Request) {
    return this.signatures.sign(caller, id, dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Permissions('documents:create')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('signature-requests/:id/cancel')
  cancel(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.signatures.cancel(caller, id);
  }

  @Permissions('documents:read')
  @Get('onboarding-packs')
  packs(@CurrentUser() caller: AuthUser) {
    return this.signatures.packs(caller);
  }

  @Permissions('documents:create')
  @Post('onboarding-packs')
  createPack(@CurrentUser() caller: AuthUser, @Body() dto: PackDto) {
    return this.signatures.savePack(caller, dto);
  }

  @Permissions('documents:create')
  @Patch('onboarding-packs/:id')
  updatePack(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PackDto) {
    return this.signatures.savePack(caller, dto, id);
  }

  @Permissions('documents:create')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('onboarding-packs/:id')
  deletePack(@CurrentUser() caller: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.signatures.deletePack(caller, id);
  }
}
