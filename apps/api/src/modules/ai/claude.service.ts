import Anthropic from '@anthropic-ai/sdk';
import { Controller, Get, Global, Injectable, Logger, Module, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppEnv, type EnvironmentVariables } from '../../config/env.validation.js';

/** Just the part of the SDK client used, so tests can stand in for Anthropic. */
export type MessagesClient = { beta: { messages: Pick<Anthropic['beta']['messages'], 'create'> } };

/** A source document for a question (a company policy), sent to Claude as a PDF with citations on. */
export interface SourceDocument {
  title: string;
  /** PDF bytes. */
  pdf: Buffer;
}

export interface CitedAnswer {
  text: string;
  /** Titles of the documents the answer quotes, in the order first cited. */
  sources: string[];
}

/**
 * The server-side refusal fallback: if the model declines (a safety classifier false positive), the API re-runs the
 * request on a fallback model it picks by category, inside the same call.
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Claude for SHC's AI help (S-022): drafting text and answering questions from the company's own policies, for admins
 * and managers. Off without ANTHROPIC_API_KEY; in production also off until AI_DPA_CONFIRMED (the UK GDPR paperwork
 * names Anthropic as a processor). Never logs prompt or response text.
 */
@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  /** Replaced in tests; created on first use from ANTHROPIC_API_KEY. */
  client: MessagesClient | null = null;

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  get enabled(): boolean {
    if (!this.config.get('ANTHROPIC_API_KEY', { infer: true })) return false;
    const production = this.config.get('APP_ENV', { infer: true }) === AppEnv.Production;
    return !production || this.config.get('AI_DPA_CONFIRMED', { infer: true }) === true;
  }

  get model(): string {
    return this.config.get('ASSISTANT_MODEL', { infer: true });
  }

  private api(): MessagesClient {
    if (!this.enabled) throw new ServiceUnavailableException('AI help isn’t switched on for this company');
    this.client ??= new Anthropic({ apiKey: this.config.get('ANTHROPIC_API_KEY', { infer: true })! });
    return this.client;
  }

  private async call(params: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, 'model' | 'betas' | 'fallbacks'>): Promise<Anthropic.Beta.BetaMessage> {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.api().beta.messages.create({ ...params, model: this.model, betas: [FALLBACK_BETA], fallbacks: 'default' });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const status = error instanceof Anthropic.APIError ? error.status : 'network';
      this.logger.warn(`AI call failed (${status})`);
      throw new ServiceUnavailableException('The AI service is unavailable right now. Please try again in a minute.');
    }
    if (response.stop_reason === 'refusal') throw new ServiceUnavailableException('The AI declined this one. Try rewording it.');
    if (response.stop_reason === 'max_tokens') throw new ServiceUnavailableException('The answer was too long. Try asking for something shorter.');
    return response;
  }

  /** One answer in the shape of `schema` (structured outputs: the reply is guaranteed to match it). */
  async structured<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T> {
    const response = await this.call({
      max_tokens: 16000,
      system,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: user }],
    });
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
    try {
      return JSON.parse(text ?? '') as T;
    } catch {
      throw new ServiceUnavailableException('The AI service didn’t return an answer. Please try again.');
    }
  }

  /**
   * Answers a question from the given documents only, quoting them (citations). The documents come first and are
   * cached, so several questions in a row about the same policies cost much less.
   */
  async askDocuments(system: string, documents: SourceDocument[], question: string): Promise<CitedAnswer> {
    const blocks: Anthropic.Beta.BetaContentBlockParam[] = documents.map((d, i) => ({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: d.pdf.toString('base64') },
      title: d.title,
      citations: { enabled: true },
      ...(i === documents.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));
    const response = await this.call({
      max_tokens: 16000,
      system,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: [...blocks, { type: 'text', text: question }] }],
    });
    const sources: string[] = [];
    let text = '';
    for (const block of response.content) {
      if (block.type !== 'text') continue;
      text += block.text;
      for (const c of block.citations ?? []) {
        const title = 'document_title' in c ? c.document_title : null;
        if (title && !sources.includes(title)) sources.push(title);
      }
    }
    if (!text.trim()) throw new ServiceUnavailableException('The AI service didn’t return an answer. Please try again.');
    return { text: text.trim(), sources };
  }
}

/** Whether AI help is switched on (the website shows the AI buttons only then). Any signed-in user. */
@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly claude: ClaudeService) {}

  @Get('status')
  status() {
    return { enabled: this.claude.enabled };
  }
}

@Global()
@Module({ controllers: [AiController], providers: [ClaudeService], exports: [ClaudeService] })
export class AiModule {}
