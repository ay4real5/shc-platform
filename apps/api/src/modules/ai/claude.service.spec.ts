import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AppEnv, type EnvironmentVariables } from '../../config/env.validation.js';
import { ClaudeService, type MessagesClient } from './claude.service.js';

const config = (values: Partial<EnvironmentVariables>) =>
  ({ get: (key: keyof EnvironmentVariables) => ({ ASSISTANT_MODEL: 'claude-opus-5-5', APP_ENV: AppEnv.Development, ...values })[key] }) as unknown as ConfigService<EnvironmentVariables, true>;

function withReply(reply: Record<string, unknown>) {
  const service = new ClaudeService(config({ ANTHROPIC_API_KEY: 'test-key' }));
  const create = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', ...reply });
  service.client = { beta: { messages: { create } } } as unknown as MessagesClient;
  return { service, create };
}

describe('ClaudeService', () => {
  it('is off without a key, and off in production until the UK GDPR paperwork is confirmed', () => {
    expect(new ClaudeService(config({})).enabled).toBe(false);
    expect(new ClaudeService(config({ ANTHROPIC_API_KEY: 'k' })).enabled).toBe(true);
    expect(new ClaudeService(config({ ANTHROPIC_API_KEY: 'k', APP_ENV: AppEnv.Production })).enabled).toBe(false);
    expect(new ClaudeService(config({ ANTHROPIC_API_KEY: 'k', APP_ENV: AppEnv.Production, AI_DPA_CONFIRMED: true })).enabled).toBe(true);
  });

  it('asks for structured output with the refusal fallback on, and parses the reply', async () => {
    const { service, create } = withReply({ content: [{ type: 'text', text: '{"text":"Draft"}' }] });
    await expect(service.structured('sys', 'notes', { type: 'object' })).resolves.toEqual({ text: 'Draft' });
    const params = create.mock.calls[0]![0];
    expect(params).toMatchObject({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: { type: 'object' } } },
    });
    expect(params.tool_choice).toBeUndefined(); // forced tool choice is refused by current models
  });

  it('turns refusals, cut-off answers and API errors into a friendly 503', async () => {
    await expect(withReply({ stop_reason: 'refusal', content: [] }).service.structured('s', 'u', {})).rejects.toThrow(/declined/);
    await expect(withReply({ stop_reason: 'max_tokens', content: [] }).service.structured('s', 'u', {})).rejects.toThrow(/too long/);
    const { service, create } = withReply({});
    create.mockRejectedValue(new Error('boom'));
    await expect(service.structured('s', 'u', {})).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sends policies as cited PDFs, caches them, and returns the policies quoted', async () => {
    const { service, create } = withReply({
      content: [
        { type: 'text', text: 'Call the office first. ', citations: [{ type: 'page_location', document_title: 'Lone working' }] },
        { type: 'text', text: 'Then log it.', citations: [{ type: 'page_location', document_title: 'Lone working' }, { type: 'page_location', document_title: 'Incidents' }] },
      ],
    });
    const answer = await service.askDocuments('sys', [{ title: 'Lone working', pdf: Buffer.from('%PDF-1') }, { title: 'Incidents', pdf: Buffer.from('%PDF-2') }], 'What if a visit feels unsafe?');
    expect(answer).toEqual({ text: 'Call the office first. Then log it.', sources: ['Lone working', 'Incidents'] });
    const content = create.mock.calls[0]![0].messages[0].content;
    expect(content[0]).toMatchObject({ type: 'document', title: 'Lone working', citations: { enabled: true } });
    expect(content[0].cache_control).toBeUndefined();
    expect(content[1].cache_control).toEqual({ type: 'ephemeral' }); // the last document closes the cached prefix
    expect(content[2]).toEqual({ type: 'text', text: 'What if a visit feels unsafe?' });
  });
});
