import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Paginated } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { DocumentStorage } from './document-storage.js';
import type { ListDocumentsQueryDto, UploadDocumentDto } from './dto/documents.dto.js';
import {
  ACCEPTED_FILES,
  detectFileKind,
  MAX_DOCUMENT_BYTES,
  safeFileName,
  type AcceptedKind,
} from './file-type.js';

const INCLUDE = {
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
  nextVersion: { select: { id: true } },
} satisfies Prisma.DocumentInclude;
type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof INCLUDE }>;

export interface DocumentView {
  id: string;
  documentType: string;
  title: string;
  description: string | null;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  staffId: string | null;
  version: number;
  previousVersionId: string | null;
  /** A newer version exists. */
  superseded: boolean;
  isSigned: boolean;
  signature: { name: string; signedAt: string; signedById: string } | null;
  uploadedBy: { id: string; firstName: string; lastName: string };
  deleted: boolean;
  createdAt: Date;
}

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/**
 * Photos sent in secure messages (D-089). They are stored like any document (encrypted, hashed), but they are not part
 * of the agency's document library: only the people in the conversation can open them, through Messages.
 */
export const MESSAGE_PHOTO = 'message_photo';

/**
 * Documents (DESIGN.md §6.9, DECISIONS D-056): upload, list, download, versions, e-sign, soft delete. Files are
 * recognised by content (PDF, PNG, JPEG, DOCX; 10 MB), stored through `DocumentStorage` (encrypted), and streamed back
 * through the API so every download is audited. A document is the agency's, optionally about one staff member.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorage,
  ) {}

  async upload(
    caller: AuthUser,
    file: UploadedFile | undefined,
    dto: UploadDocumentDto,
  ): Promise<DocumentView> {
    if (!file) throw new BadRequestException('Attach a file (field "file")');
    if (file.size > MAX_DOCUMENT_BYTES)
      throw new PayloadTooLargeException('Files can be at most 10 MB');
    const kind = detectFileKind(file.buffer, file.originalname);
    if (!kind)
      throw new UnsupportedMediaTypeException(
        'Only PDF, PNG, JPEG and Word (.docx) files are accepted',
      );

    let links = { staffId: dto.staffId ?? null };
    let type: string = dto.documentType;
    let version = 1;
    let previousVersionId: string | null = null;
    if (dto.replacesDocumentId) {
      const previous = await this.find(caller, dto.replacesDocumentId);
      if (previous.deletedAt) throw new ConflictException('That document was deleted');
      if (previous.nextVersion)
        throw new ConflictException('A newer version already exists — replace that one');
      links = { staffId: previous.staffId };
      type = previous.documentType;
      version = previous.version + 1;
      previousVersionId = previous.id;
    } else {
      await this.assertLinks(caller, links);
    }

    const id = (
      await this.prisma.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`
    )[0]!.id;
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.document.create({
          data: {
            id,
            agencyId: caller.agencyId,
            ...links,
            uploadedById: caller.userId,
            documentType: type,
            title: dto.title,
            description: dto.description ?? null,
            fileName: safeFileName(file.originalname, kind),
            fileSize: file.size,
            mimeType: ACCEPTED_FILES[kind].mime,
            s3Key: 'pending',
            contentHash: sha256(file.buffer),
            version,
            previousVersionId,
            tags: [],
          },
        });
        const key = await this.storage.save(id, file.buffer, tx);
        return tx.document.update({ where: { id }, data: { s3Key: key }, include: INCLUDE });
      });
      return toView(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'Someone else just replaced this document — reload and try again',
        );
      }
      throw error;
    }
  }

  /** Stores a photo for a message (PNG or JPEG, by its bytes). Attaching and viewing are Messaging's job. */
  async uploadMessagePhoto(caller: AuthUser, file: UploadedFile | undefined): Promise<{ id: string; fileName: string; mimeType: string }> {
    if (!file) throw new BadRequestException('Attach a photo (field "file")');
    if (file.size > MAX_DOCUMENT_BYTES) throw new PayloadTooLargeException('Photos can be at most 10 MB');
    const kind = detectFileKind(file.buffer, file.originalname);
    if (kind !== 'jpeg' && kind !== 'png') throw new UnsupportedMediaTypeException('Only JPEG and PNG photos can be sent');
    const id = (await this.prisma.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0]!.id;
    const fileName = safeFileName(file.originalname || 'photo', kind);
    await this.prisma.$transaction(async (tx) => {
      await tx.document.create({
        data: {
          id,
          agencyId: caller.agencyId,
          uploadedById: caller.userId,
          documentType: MESSAGE_PHOTO,
          title: 'Photo',
          fileName,
          fileSize: file.size,
          mimeType: ACCEPTED_FILES[kind].mime,
          s3Key: 'pending',
          contentHash: sha256(file.buffer),
          tags: [],
        },
      });
      const key = await this.storage.save(id, file.buffer, tx);
      await tx.document.update({ where: { id }, data: { s3Key: key } });
    });
    return { id, fileName, mimeType: ACCEPTED_FILES[kind].mime };
  }

  /** A message photo's bytes. The caller (Messaging) has already checked the viewer is in the conversation. */
  async loadMessagePhoto(agencyId: string, id: string): Promise<{ fileName: string; mimeType: string; content: Buffer }> {
    const doc = await this.prisma.document.findFirst({ where: { id, agencyId, documentType: MESSAGE_PHOTO, deletedAt: null } });
    if (!doc) throw new NotFoundException('Photo not found');
    const content = await this.storage.load(doc.id);
    if (doc.contentHash && sha256(content) !== doc.contentHash) {
      throw new ConflictException('The stored file does not match what was uploaded');
    }
    return { fileName: doc.fileName, mimeType: doc.mimeType ?? 'image/jpeg', content };
  }

  async list(caller: AuthUser, query: ListDocumentsQueryDto): Promise<Paginated<DocumentView>> {
    const where: Prisma.DocumentWhereInput = {
      agencyId: caller.agencyId,
      nextVersion: null, // latest versions only
      documentType: query.documentType ?? { not: MESSAGE_PHOTO },
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.staffId ? { staffId: query.staffId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.document.count({ where }),
    ]);
    return Paginated.of(rows.map(toView), total, query);
  }

  async get(caller: AuthUser, id: string): Promise<DocumentView> {
    return toView(await this.find(caller, id));
  }

  /** Every version, newest first. */
  async versions(caller: AuthUser, id: string): Promise<DocumentView[]> {
    let current: DocumentRow | null = await this.find(caller, id);
    // Walk forward to the newest, then back through the chain.
    while (current.nextVersion) current = await this.find(caller, current.nextVersion.id);
    const out: DocumentView[] = [];
    while (current) {
      out.push(toView(current));
      current = current.previousVersionId
        ? await this.find(caller, current.previousVersionId)
        : null;
    }
    return out;
  }

  async download(
    caller: AuthUser,
    id: string,
  ): Promise<{ fileName: string; mimeType: string; content: Buffer }> {
    const doc = await this.find(caller, id);
    if (doc.deletedAt) throw new NotFoundException('Document not found');
    const content = await this.storage.load(doc.id);
    if (doc.contentHash && sha256(content) !== doc.contentHash) {
      throw new ConflictException('The stored file does not match what was uploaded');
    }
    return {
      fileName: doc.fileName,
      mimeType: doc.mimeType ?? 'application/octet-stream',
      content,
    };
  }

  /**
   * Electronic signature: who, when, from where, and the SHA-256 of exactly the file signed. Signing the latest
   * version only; a signed document can't be signed again (upload a new version).
   */
  async sign(
    caller: AuthUser,
    id: string,
    typedName: string,
    client: { ip?: string; userAgent?: string },
  ): Promise<DocumentView> {
    const doc = await this.find(caller, id);
    if (doc.deletedAt) throw new NotFoundException('Document not found');
    if (doc.nextVersion) throw new ConflictException('Sign the newest version');
    const content = await this.storage.load(doc.id);
    const hash = sha256(content);
    if (doc.contentHash && hash !== doc.contentHash)
      throw new ConflictException('The stored file does not match what was uploaded');
    const signed = await this.prisma.document.updateMany({
      where: { id, isSigned: false },
      data: {
        isSigned: true,
        signatureData: {
          signedById: caller.userId,
          name: typedName,
          signedAt: new Date().toISOString(),
          contentHash: hash,
          ip: client.ip ?? null,
          userAgent: client.userAgent?.slice(0, 255) ?? null,
        },
      },
    });
    if (!signed.count) throw new ConflictException('Already signed');
    return this.get(caller, id);
  }

  /** Soft delete with a reason — records are retained (HIPAA/state retention); the file stays stored. */
  async remove(caller: AuthUser, id: string, reason: string): Promise<void> {
    const doc = await this.find(caller, id);
    if (doc.deletedAt) throw new ConflictException('Already deleted');
    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: caller.userId, deleteReason: reason },
    });
  }

  private async find(
    caller: AuthUser,
    id: string,
  ): Promise<DocumentRow & { deletedAt: Date | null }> {
    const doc = await this.prisma.document.findFirst({
      where: {
        id,
        agencyId: caller.agencyId,
        documentType: { not: MESSAGE_PHOTO },
      },
      include: INCLUDE,
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  private async assertLinks(caller: AuthUser, links: { staffId: string | null }): Promise<void> {
    if (links.staffId) {
      const staff = await this.prisma.staffProfile.count({ where: { id: links.staffId, agencyId: caller.agencyId } });
      if (!staff) throw new BadRequestException('staffId does not match a staff member in this agency');
    }
  }
}

function toView(d: DocumentRow & { deletedAt: Date | null }): DocumentView {
  const sig = d.signatureData as { name: string; signedAt: string; signedById: string } | null;
  return {
    id: d.id,
    documentType: d.documentType,
    title: d.title,
    description: d.description,
    fileName: d.fileName,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    staffId: d.staffId,
    version: d.version,
    previousVersionId: d.previousVersionId,
    superseded: Boolean(d.nextVersion),
    isSigned: d.isSigned,
    signature: sig ? { name: sig.name, signedAt: sig.signedAt, signedById: sig.signedById } : null,
    uploadedBy: d.uploadedBy,
    deleted: Boolean(d.deletedAt),
    createdAt: d.createdAt,
  };
}

export type { AcceptedKind };
