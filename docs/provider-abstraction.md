# Provider Abstraction

Winter routes every model call through a small provider adapter layer in `src/ai/provider-adapters.js`.

The goal is simple: the rest of Winter can speak one internal message shape while each provider gets the request format it expects.

## Supported API Formats

| `apiFormat` | Request style | Typical providers |
|---|---|---|
| `openai` | OpenAI-compatible `/chat/completions` | OpenAI, Groq, Ollama, Qwen DashScope, Kimi/Moonshot, MiniMax, OpenRouter, DeepSeek, Mistral, Fireworks, Together, SiliconFlow |
| `anthropic` | Anthropic native `/messages` | Anthropic Claude or compatible native endpoints |
| `gemini` | Gemini native `models/{model}:generateContent` | Google Gemini or compatible native endpoints |

## Preset Providers

Winter ships with presets for common providers. A preset can provide:

- display name
- API format
- base URL
- default model

Current presets include:

- `openai`
- `azure`
- `groq`
- `ollama`
- `openrouter`
- `together`
- `fireworks`
- `deepseek`
- `mistral`
- `xai`
- `perplexity`
- `cerebras`
- `siliconflow`
- `zhipu`
- `baichuan`
- `01ai`
- `qwen`
- `dashscope`
- `kimi`
- `moonshot`
- `minimax`
- `anthropic`
- `claude`
- `gemini`

## Custom Provider

`custom` is the escape hatch for any provider or gateway.

By default, `custom` is OpenAI-compatible:

```json
{
  "defaultProvider": "custom",
  "custom": {
    "baseURL": "http://localhost:4000/v1",
    "apiKey": "your-key",
    "model": "gpt-4o-mini"
  }
}
```

You can switch it to Anthropic native:

```json
{
  "defaultProvider": "custom",
  "custom": {
    "apiFormat": "anthropic",
    "apiKey": "your-key",
    "model": "claude-3-5-sonnet-latest"
  }
}
```

You can switch it to Gemini native:

```json
{
  "defaultProvider": "custom",
  "custom": {
    "apiFormat": "gemini",
    "apiKey": "your-key",
    "model": "gemini-1.5-pro"
  }
}
```

## Named Provider Sections

Any non-reserved config section can become a provider if it has provider-like fields or a known preset.

Example:

```json
{
  "defaultProvider": "qwen",
  "qwen": {
    "apiKey": "dashscope-key"
  },
  "kimi": {
    "apiKey": "moonshot-key"
  },
  "minimax": {
    "apiKey": "minimax-key"
  }
}
```

Because these names have presets, Winter can fill in the base URL and default model automatically.

## How Requests Are Built

Internal call sites pass:

- provider config
- OpenAI-style messages
- options such as model, stream, tools, and reasoning

The adapter returns:

```js
{
  url,
  headers,
  body
}
```

Then `AIProviderManager` performs the fetch.

## Response Normalization

Provider responses are normalized back toward an OpenAI-style shape:

```js
{
  choices: [
    {
      message: {
        role: 'assistant',
        content: '...'
      },
      finish_reason: '...'
    }
  ],
  usage,
  raw
}
```

This keeps the rest of the CLI independent from each provider's native response format.

## Streaming

Streaming chunks are normalized with `normalizeProviderStreamChunk()`.

The normalized stream chunk shape is:

```js
{
  content,
  usage,
  raw
}
```

OpenAI-compatible, Anthropic native, and Gemini native chunks are handled separately.

## Tool Calling Notes

Winter can include tool definitions in provider requests. The adapter converts tool schema where needed:

- OpenAI-compatible: passes tools through
- Anthropic: converts to `input_schema`
- Gemini: converts to `functionDeclarations`

Provider-native tool response semantics can still vary. When integrating a new native provider, test both simple chat and tool-call loops.

## Adding a New Provider Preset

Edit `PROVIDER_PRESETS` in `src/ai/provider-adapters.js`:

```js
export const PROVIDER_PRESETS = {
  myprovider: {
    name: 'My Provider',
    apiFormat: 'openai',
    baseURL: 'https://api.myprovider.example/v1',
    model: 'my-default-model'
  }
};
```

Then add or update tests near `src/ai/providers.test.js`.

Recommended test cases:

1. provider config without `baseURL` resolves the preset URL
2. request URL is correct
3. auth headers are correct
4. response is normalized
5. streaming chunks are normalized if the provider supports streaming
