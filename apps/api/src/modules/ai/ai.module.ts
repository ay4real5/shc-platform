import { Controller, Get, Global, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service.js';
import { AzureOpenAiService } from './azure-openai.service.js';
import { ClaudeService } from './claude.service.js';

/** Whether AI help is switched on (the website shows the AI buttons only then). Any signed-in user. */
@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  status() {
    return { enabled: this.ai.enabled };
  }
}

/** The AI suppliers and the switch between them (S-022, S-033). */
@Global()
@Module({ controllers: [AiController], providers: [ClaudeService, AzureOpenAiService, AiService], exports: [AiService, ClaudeService, AzureOpenAiService] })
export class AiModule {}
