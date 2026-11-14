import type { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { AzureOpenAiService, type FetchLike } from './azure-openai.service.js';

const settings = (over: Record<string, unknown> = {}) =>
  ({
    get: (key: string) =>
      ({
        APP_ENV: 'development',
        AZURE_OPENAI_ENDPOINT: 'https://fake-shc.openai.azure.com/',
        AZURE_OPENAI_API_KEY: 'FAKE-KEY',
        AZURE_OPENAI_DEPLOYMENT: 'shc-gpt',
        AZURE_OPENAI_API_VERSION: '2024-10-21',
        AI_DPA_CONFIRMED: false,
        ...over,
      })[key],
  }) as unknown as ConfigService<EnvironmentVariables, true>;

const reply = (choice: Record<string, unknown>, ok = true, status = 200) => vi.fn<FetchLike>(async () => ({ ok, status, json: async () => ({ choices: [choice] }) }));

describe('AzureOpenAiService (S-033)', () => {
  it('sends a strict structured-output request to the deployment and returns the parsed answer', async () => {
    const azure = new AzureOpenAiService(settings());
    azure.fetch = reply({ finish_reason: 'stop', message: { content: '{"text":"FAKE advert"}' } });
    const schema = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false };
    await expect(azure.structured('system words', 'user words', schema)).resolves.toEqual({ text: 'FAKE advert' });

    const [url, init] = vi.mocked(azure.fetch).mock.calls[0]!;
    expect(url).toBe('https://fake-shc.openai.azure.com/openai/deployments/shc-gpt/chat/completions?api-version=2024-10-21');
    expect(init.headers).toMatchObject({ 'api-key': 'FAKE-KEY' });
    const body = JSON.parse(init.body);
    expect(body.messages).toEqual([
      { role: 'system', content: 'system words' },
      { role: 'user', content: 'user words' },
    ]);
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'answer', strict: true, schema } });
  });

  it('turns refusals, filters, cut-offs and errors into a friendly 503', async () => {
    const azure = new AzureOpenAiService(settings());
    for (const [choice, message] of [
      [{ finish_reason: 'stop', message: { content: null, refusal: 'no' } }, /declined/],
      [{ finish_reason: 'content_filter', message: { content: null } }, /declined/],
      [{ finish_reason: 'length', message: { content: '{"te' } }, /too long/],
    ] as const) {
      azure.fetch = reply(choice);
      await expect(azure.structured('s', 'u', {})).rejects.toThrow(message);
    }
    azure.fetch = reply({}, false, 429);
    await expect(azure.structured('s', 'u', {})).rejects.toThrow(/unavailable right now/);
    azure.fetch = vi.fn<FetchLike>(async () => Promise.reject(new Error('offline')));
    await expect(azure.structured('s', 'u', {})).rejects.toThrow(/unavailable right now/);
  });

  it('is off until configured, and in production until the DPA is confirmed', () => {
    expect(new AzureOpenAiService(settings()).enabled).toBe(true);
    expect(new AzureOpenAiService(settings({ AZURE_OPENAI_API_KEY: undefined })).enabled).toBe(false);
    expect(new AzureOpenAiService(settings({ APP_ENV: 'production' })).enabled).toBe(false);
    expect(new AzureOpenAiService(settings({ APP_ENV: 'production', AI_DPA_CONFIRMED: true })).enabled).toBe(true);
  });
});
