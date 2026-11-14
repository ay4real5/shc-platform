import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { AzureOpenAiService } from './azure-openai.service.js';
import { ClaudeService, type CitedAnswer, type SourceDocument } from './claude.service.js';

export type AiProvider = 'azure_openai' | 'anthropic';

/**
 * The AI supplier SHC uses (S-033): one setting, AI_PROVIDER. Azure OpenAI is the default (data stays in the company's
 * UK Azure region under its Microsoft agreement); Anthropic stays available. Everything else calls this, never a
 * supplier directly.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly claude: ClaudeService,
    private readonly azure: AzureOpenAiService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  get provider(): AiProvider {
    return this.config.get('AI_PROVIDER', { infer: true });
  }

  private get current(): ClaudeService | AzureOpenAiService {
    return this.provider === 'anthropic' ? this.claude : this.azure;
  }

  get enabled(): boolean {
    return this.current.enabled;
  }

  structured<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T> {
    return this.current.structured<T>(system, user, schema);
  }

  askDocuments(system: string, documents: SourceDocument[], question: string): Promise<CitedAnswer> {
    return this.current.askDocuments(system, documents, question);
  }
}
