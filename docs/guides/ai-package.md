# AI Package

`@jainparichay/ai` is a thin wrapper around the [OpenAI Node.js SDK](https://github.com/openai/openai-node). It provides a typed client factory that resolves configuration from explicit options or environment variables.

Its source, tests, and release history live in [the packages repo](https://github.com/JainParichay/packages) (`packages/ai`), not in this repo. To add it to an app here, add `"@jainparichay/ai": "^0.1.0"` (or the current published version) to that app's `dependencies`. To change its behavior, make the change in the packages repo and publish a new version. Like most `@jainparichay/*` packages, it is ESM-only (`@jainparichay/ui` and `@jainparichay/db` are the exceptions — they additionally ship a CommonJS `require()` entry); a CommonJS consumer needs `await import('@jainparichay/ai')` instead of `require()`.

## Environment Variables

| Variable          | Required | Description                                                    |
| ----------------- | -------- | -------------------------------------------------------------- |
| `OPENAI_API_KEY`  | Yes      | Your OpenAI API key.                                           |
| `OPENAI_BASE_URL` | No       | Base URL for the API. Defaults to `https://api.openai.com/v1`. |

`OPENAI_BASE_URL` works with any OpenAI-compatible endpoint (e.g. local models, proxy services).

## Usage

### Explicit Configuration

```ts
import { createAiClient } from '@jainparichay/ai';

const ai = createAiClient({
  apiKey: 'sk-...',
  baseURL: 'https://custom.api.example.com',
  model: 'gpt-4o',
});

const response = await ai.chat([{ role: 'user', content: 'Hello!' }]);
```

### Environment Fallback

```ts
import { createAiClient } from '@jainparichay/ai';

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
