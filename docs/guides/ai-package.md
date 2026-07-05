# AI Package

`@workspace-starter/ai` is a thin wrapper around the [OpenAI Node.js SDK](https://github.com/openai/openai-node). It provides a typed client factory that resolves configuration from explicit options or environment variables.

## Environment Variables

| Variable          | Required | Description                                                    |
| ----------------- | -------- | -------------------------------------------------------------- |
| `OPENAI_API_KEY`  | Yes      | Your OpenAI API key.                                           |
| `OPENAI_BASE_URL` | No       | Base URL for the API. Defaults to `https://api.openai.com/v1`. |

`OPENAI_BASE_URL` works with any OpenAI-compatible endpoint (e.g. local models, proxy services).

## Usage

### Explicit Configuration

```ts
import { createAiClient } from '@workspace-starter/ai';

const ai = createAiClient({
  apiKey: 'sk-...',
  baseURL: 'https://custom.api.example.com',
  model: 'gpt-4o',
});

const response = await ai.chat([{ role: 'user', content: 'Hello!' }]);
```

### Environment Fallback

```ts
import { createAiClient } from '@workspace-starter/ai';

// Reads OPENAI_API_KEY and OPENAI_BASE_URL from the environment.
// Throws if OPENAI_API_KEY is not set.
const ai = createAiClient();

await ai.chat([{ role: 'user', content: 'What is 2+2?' }]);
```

Per-call model override:

```ts
await ai.chat([{ role: 'user', content: 'Hi' }], { model: 'gpt-4.1' });
```

### Raw SDK Access

The configured `OpenAI` instance is exposed as `ai.client` for advanced use (streaming, assistants, etc.).
