import OpenAI from 'openai';

export interface AiClientOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export function createAiClient(options: AiClientOptions = {}) {
  const explicitApiKey =
    typeof options.apiKey === 'string' ? options.apiKey.trim() : undefined;
  const envApiKey =
    typeof process.env.OPENAI_API_KEY === 'string'
      ? process.env.OPENAI_API_KEY.trim()
      : undefined;
  const apiKey = explicitApiKey || envApiKey;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Pass apiKey to createAiClient or set the environment variable.',
    );
  }

  const explicitBaseURL =
    typeof options.baseURL === 'string' ? options.baseURL.trim() : undefined;
  const envBaseURL =
    typeof process.env.OPENAI_BASE_URL === 'string'
      ? process.env.OPENAI_BASE_URL.trim()
      : undefined;
  const baseURL = explicitBaseURL || envBaseURL || undefined;
  const model = options.model ?? 'gpt-4o-mini';

  const client = new OpenAI({ apiKey, baseURL });

  async function chat(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    opts?: { model?: string },
  ) {
    const response = await client.chat.completions.create({
      model: opts?.model ?? model,
      messages,
    });
    return response;
  }

  return { client, chat };
}

export type AiClient = ReturnType<typeof createAiClient>;
