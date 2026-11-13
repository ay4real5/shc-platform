import { DISCIPLINES } from '@alora/shared';
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Injectable, Module, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { trimmed } from '../../common/validators/fields.js';
import { PrismaService } from '../../database/prisma.service.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { DocumentsService } from '../documents/documents.service.js';
import { ClaudeService } from './claude.service.js';

export const DRAFT_KINDS = ['job_advert', 'interview_questions', 'supervision_write_up'] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export class DraftDto {
  @IsIn(DRAFT_KINDS)
  kind!: DraftKind;

  /** The manager's own notes or bullet points. */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  notes!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  jobTitle?: string;

  @IsOptional()
  @IsIn(DISCIPLINES)
  discipline?: (typeof DISCIPLINES)[number];

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  location?: string;
}

export class PolicyQuestionDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  question!: string;
}

/** Most policies (and total size) sent with one question: keeps each request well inside the API's limits. */
const POLICY_LIMITS = { count: 25, bytes: 20 * 1024 * 1024 };

const HOUSE_STYLE = `Write in plain UK English (British spelling, £, dates as 14 March 2026). Be warm, clear and brief. Use plain text: no Markdown symbols such as #, ** or tables. Separate sections with a blank line and use "- " for bullet points.`;

const DRAFT_SYSTEM: Record<DraftKind, string> = {
  job_advert: `You write job adverts for a UK home care and supported living provider, regulated by CQC. From the manager's notes, write an advert with: a short opening that sells the role, what the person will do, what we're looking for, what we offer, and how to apply. Use only facts from the notes for pay, hours, benefits and location; where something isn't given, write a placeholder in square brackets such as [add hourly rate]. Never add requirements that could discriminate (age, gender, nationality, health, "native English"); say "a full UK driving licence" only if the notes say driving is needed. Mention that the role needs an enhanced DBS check and the right to work in the UK. ${HOUSE_STYLE}`,
  interview_questions: `You write interview questions for a UK home care and supported living provider, regulated by CQC. From the role and the manager's notes, write 8 to 10 questions: values-based questions (dignity, respect, person-centred care), scenario questions (for example a client refusing care, a safeguarding concern, a missed visit), and questions on experience. Under each, add one line starting "Look for:" describing a good answer. Never ask about age, health, family plans, religion, nationality or anything else protected by the Equality Act 2010. ${HOUSE_STYLE}`,
  supervision_write_up: `You turn a care manager's rough notes from a supervision meeting into a clear, professional record for the staff member's file. Keep every fact from the notes and add none: don't invent concerns, praise, dates or actions. Write in the third person ("Sam said..."), using the name only if the notes give one. Use these sections: Wellbeing, Work going well, Concerns or learning needs, Training, Actions agreed (each with who and by when, as given in the notes; write "[date to agree]" where no date was given). ${HOUSE_STYLE}`,
};

const POLICY_SYSTEM = `You answer questions from managers at a UK care provider using only the company policies provided. Quote or closely follow the policy wording and cite it. If the policies don't cover the question, say so plainly and suggest checking with the registered manager; don't fill the gap with general advice. If the question describes an emergency or someone at risk, start by saying to follow the emergency procedure and call 999 if needed. ${HOUSE_STYLE}`;

const TEXT_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string', description: 'The finished draft, ready for the manager to edit.' } },
  required: ['text'],
  additionalProperties: false,
};

/**
 * AI help for admins and managers (S-022, `ai:use`). A person always reads and edits the result: drafts are returned
 * to the page, never saved by this service. Never scores, ranks or decides about people.
 */
@Injectable()
export class AiHelpService {
  constructor(
    private readonly claude: ClaudeService,
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
  ) {}

  async draft(caller: AuthUser, dto: DraftDto): Promise<{ text: string }> {
    const company = await this.prisma.agency.findUniqueOrThrow({ where: { id: caller.agencyId }, select: { name: true } });
    const facts = [
      `Company: ${company.name}`,
      dto.jobTitle && `Job title: ${dto.jobTitle}`,
      dto.discipline && `Job role: ${dto.discipline.replaceAll('_', ' ')}`,
      dto.location && `Location: ${dto.location}`,
    ].filter(Boolean);
    const user = `${facts.join('\n')}\n\nManager's notes:\n${dto.notes}`;
    return this.claude.structured<{ text: string }>(DRAFT_SYSTEM[dto.kind], user, TEXT_SCHEMA);
  }

  async policyQuestion(caller: AuthUser, dto: PolicyQuestionDto): Promise<{ answer: string; sources: string[]; policiesRead: number; skipped: string[] }> {
    if (!this.claude.enabled) throw new ServiceUnavailableException('AI help isn’t switched on for this company');
    const { pdfs, skipped } = await this.documents.policiesForAi(caller.agencyId, POLICY_LIMITS);
    if (!pdfs.length) {
      throw new BadRequestException(
        skipped.length
          ? 'Your policies need to be PDFs for AI questions. Save them as PDF and upload them in Documents with the type "Policy".'
          : 'No policies yet. Upload your policies as PDFs in Documents with the type "Policy", then ask again.',
      );
    }
    const answer = await this.claude.askDocuments(POLICY_SYSTEM, pdfs.map((p) => ({ title: p.title, pdf: p.pdf })), dto.question);
    return { answer: answer.text, sources: answer.sources, policiesRead: pdfs.length, skipped };
  }
}

@ApiTags('ai')
@Controller('ai')
export class AiHelpController {
  constructor(private readonly help: AiHelpService) {}

  /** Draft a job advert, interview questions or a supervision write-up from the manager's notes. */
  @Permissions('ai:use')
  @Audit({ action: 'AI_DRAFT' })
  @Post('draft')
  @HttpCode(HttpStatus.OK)
  draft(@CurrentUser() caller: AuthUser, @Body() dto: DraftDto) {
    return this.help.draft(caller, dto);
  }

  /** Answer a question from the company's own policies (PDFs of type "policy"), naming the policies used. */
  @Permissions('ai:use')
  @Audit({ action: 'AI_POLICY_QUESTION' })
  @Post('policy-question')
  @HttpCode(HttpStatus.OK)
  policyQuestion(@CurrentUser() caller: AuthUser, @Body() dto: PolicyQuestionDto) {
    return this.help.policyQuestion(caller, dto);
  }
}

@Module({ imports: [DocumentsModule], controllers: [AiHelpController], providers: [AiHelpService] })
export class AiHelpModule {}
