import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

var MockOpenAI: ReturnType<typeof vi.fn>;
var mockChatCompletionsCreate: ReturnType<typeof vi.fn>;

vi.mock('openai', () => {
  mockChatCompletionsCreate = vi.fn();
  MockOpenAI = vi.fn(function (this: Record<string, unknown>) {
    this.chat = {
      completions: {
        create: mockChatCompletionsCreate,
      },
    };
  });
  return { default: MockOpenAI };
});

import OpenAI from 'openai';
import { createAiClient } from '../src/client.js';

describe('createAiClient', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  describe('constructor', () => {
    it('does not construct the SDK at import time', () => {
      expect(OpenAI).not.toHaveBeenCalled();
    });

    it('passes explicit options to the OpenAI constructor', () => {
      createAiClient({
        apiKey: 'sk-explicit',
        baseURL: 'https://custom.example.com',
      });

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-explicit',
        baseURL: 'https://custom.example.com',
      });
    });

    it('falls back to env vars when options are not provided', () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-env');
      vi.stubEnv('OPENAI_BASE_URL', 'https://env.example.com');

      createAiClient();

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-env',
        baseURL: 'https://env.example.com',
      });
    });

    it('sets baseURL to undefined when neither option nor env provides it', () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-env');
      delete process.env.OPENAI_BASE_URL;

      createAiClient();

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-env',
        baseURL: undefined,
      });
    });

    it('throws when no apiKey is available', () => {
      delete process.env.OPENAI_API_KEY;

      expect(() => createAiClient()).toThrow(
        'OPENAI_API_KEY is not set. Pass apiKey to createAiClient or set the environment variable.',
      );
    });

    it('throws for empty-string apiKey in env', () => {
      vi.stubEnv('OPENAI_API_KEY', '');

      expect(() => createAiClient()).toThrow(
        'OPENAI_API_KEY is not set. Pass apiKey to createAiClient or set the environment variable.',
      );
    });

    it('throws for whitespace-only apiKey in env', () => {
      vi.stubEnv('OPENAI_API_KEY', '   ');

      expect(() => createAiClient()).toThrow(
        'OPENAI_API_KEY is not set. Pass apiKey to createAiClient or set the environment variable.',
      );
    });

    it('falls back to env key when explicit apiKey is empty string', () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-env');

      createAiClient({ apiKey: '' });

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-env' }),
      );
    });

    it('treats empty-string OPENAI_BASE_URL as undefined', () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-env');
      vi.stubEnv('OPENAI_BASE_URL', '');

      createAiClient();

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-env',
        baseURL: undefined,
      });
    });
  });

  describe('chat', () => {
    it('uses the default model when no per-call override is given', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-env');
      mockChatCompletionsCreate.mockResolvedValue({ id: 'chat-1' });

      const client = createAiClient();
      await client.chat([{ role: 'user', content: 'hello' }]);

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
      });
    });

    it('respects an explicit default model', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-env');
      mockChatCompletionsCreate.mockResolvedValue({ id: 'chat-2' });

      const messages = [{ role: 'user' as const, content: 'hi' }];
      const client = createAiClient({ model: 'gpt-4o' });
      await client.chat(messages);

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages,
      });
    });

    it('allows per-call model override', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-env');
      mockChatCompletionsCreate.mockResolvedValue({ id: 'chat-3' });

      const client = createAiClient({ model: 'gpt-4o-mini' });
      await client.chat([{ role: 'user', content: 'hi' }], {
        model: 'gpt-4.1',
      });

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4.1' }),
      );
    });

    it('passes messages through correctly', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-env');
      mockChatCompletionsCreate.mockResolvedValue({ id: 'chat-4' });

      const messages = [
        { role: 'system' as const, content: 'You are helpful.' },
        { role: 'user' as const, content: 'What is 2+2?' },
      ];

      const client = createAiClient();
      await client.chat(messages);

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ messages }),
      );
    });

    it('returns the mocked completion', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-env');
      const mockResult = {
        id: 'chat-5',
        choices: [{ message: { content: '4' } }],
      };
      mockChatCompletionsCreate.mockResolvedValue(mockResult);

      const client = createAiClient();
      const result = await client.chat([{ role: 'user', content: '2+2?' }]);

      expect(result).toEqual(mockResult);
    });
  });
});
