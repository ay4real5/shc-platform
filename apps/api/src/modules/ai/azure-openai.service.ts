import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv, type EnvironmentVariables } from '../../config/env.validation.js';
import type { CitedAnswer, SourceDocument } from './claude.service.js';

/** The Azure OpenAI chat-completions reply, just the parts SHC reads. */
interface ChatCompletion {
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
}

/** Stand-in point for tests: same shape as the global fetch. */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Azure OpenAI for SHC's AI help (S-033): the same drafting as Claude, run in the company's own Azure subscription so
 * the data stays in the UK region (e.g. UK South) under its Microsoft agreement. Uses the chat-completions REST API
 * with structured outputs (json_schema, strict). Off until the endpoint, key and deployment are set; in production also
 * off until AI_DPA_CONFIRMED. Never logs prompt or response text.
 */
@Injectable()
export class AzureOpenAiService {
  private readonly logger = new Logger(AzureOpenAiService.name);
  /** Replaced in tests. */
  fetch: FetchLike = (url, init) => fetch(url, init);

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  get enabled(): boolean {
    const set = (k: 'AZURE_OPENAI_ENDPOINT' | 'AZURE_OPENAI_API_KEY' | 'AZURE_OPENAI_DEPLOYMENT') => Boolean(this.config.get(k, { infer: true }));
    if (!set('AZURE_OPENAI_ENDPOINT') || !set('AZURE_OPENAI_API_KEY') || !set('AZURE_OPENAI_DEPLOYMENT')) return false;
    const production = this.config.get('APP_ENV', { infer: true }) === AppEnv.Production;
    return !production || this.config.get('AI_DPA_CONFIRMED', { infer: true }) === true;
  }

  /** One answer in the shape of `schema` (strict structured output). */
  async structured<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T> {
    const content = await this.complete([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], schema);
    try {
      return JSON.parse(content) as T;
    } catch {
      throw new ServiceUnavailableException('The AI service didn’t return an answer. Please try again.');
    }
  }

  /**
   * Policy questions need the PDFs turned into text first (Azure OpenAI chat can't read PDF files). That needs a PDF
   * text reader added to the API, which is waiting for the owner's go-ahead (S-033); until then this says so plainly.
   */
  async askDocuments(_system: string, _documents: SourceDocument[], _question: string): Promise<CitedAnswer> {
    throw new ServiceUnavailableException('Policy questions aren’t ready on Azure OpenAI yet. Drafting works; policy questions come next.');
  }

  private async complete(messages: { role: 'system' | 'user'; content: string }[], schema: Record<string, unknown>): Promise<string> {
    if (!this.enabled) throw new ServiceUnavailableException('AI help isn’t switched on for this company');
    const endpoint = this.config.get('AZURE_OPENAI_ENDPOINT', { infer: true })!.replace(/\/+$/, '');
    const deployment = encodeURIComponent(this.config.get('AZURE_OPENAI_DEPLOYMENT', { infer: true })!);
    const version = encodeURIComponent(this.config.get('AZURE_OPENAI_API_VERSION', { infer: true }));
    let reply: ChatCompletion;
    try {
      const res = await this.fetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${version}`, {
        method: 'POST',
        headers: { 'api-key': this.config.get('AZURE_OPENAI_API_KEY', { infer: true })!, 'content-type': 'application/json' },
        body: JSON.stringify({
          messages,
          max_completion_tokens: 8000,
          response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema } },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        this.logger.warn(`AI call failed (${res.status})`);
        throw new ServiceUnavailableException('The AI service is unavailable right now. Please try again in a minute.');
      }
      reply = (await res.json()) as ChatCompletion;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn('AI call failed (network)');
      throw new ServiceUnavailableException('The AI service is unavailable right now. Please try again in a minute.');
    }
    const choice = reply.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw new ServiceUnavailableException('The AI declined this one. Try rewording it.');
    if (choice?.finish_reason === 'length') throw new ServiceUnavailableException('The answer was too long. Try asking for something shorter.');
    const content = choice?.message?.content;
    if (!content) throw new ServiceUnavailableException('The AI service didn’t return an answer. Please try again.');
    return content;
  }
}
