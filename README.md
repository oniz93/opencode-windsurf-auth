# opencode-windsurf-auth

[![npm version](https://img.shields.io/npm/v/opencode-windsurf-auth.svg)](https://www.npmjs.com/package/opencode-windsurf-auth)
[![npm beta](https://img.shields.io/npm/v/opencode-windsurf-auth/beta.svg?label=beta)](https://www.npmjs.com/package/opencode-windsurf-auth)
[![npm downloads](https://img.shields.io/npm/dw/opencode-windsurf-codeium.svg)](https://www.npmjs.com/package/opencode-windsurf-auth)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Opencode plugin for Windsurf/Codeium authentication - use Windsurf models in Opencode.

## Features

- **OpenAI-compatible** `/v1/chat/completions` interface with streaming SSE.
- **Automatic Discovery**: CSRF tokens, dynamic ports, and API keys are fetched directly from your running Windsurf process.
- **Node.js & Bun Support**: Runs in standard Node.js environments (like default OpenCode) or Bun.
- **Enterprise Ready**: Supports exclusive Enterprise models, regional deployments, and private model slots (Kimi, Minimax, etc.).
- **Dynamic Model Sync**: Automatically update your `opencode.json` with the models actually enabled for your account.
- **Transparent gRPC Translation**: Translates REST requests to Windsurf's internal gRPC protocol over HTTP/2.

## Prerequisites

1. **Windsurf IDE installed** - Download from [windsurf.com](https://windsurf.com)
2. **Windsurf running** - The plugin communicates with the local language server process.
3. **Logged into Windsurf** - Ensure you are signed in within the IDE.

## Installation

```bash
bun add opencode-windsurf-auth@beta
```

## Model Synchronization

Windsurf account permissions vary by tier (Free, Pro, Enterprise). To ensure you only see and use models enabled for your account, use the built-in sync tool:

### Method 1: Via OpenCode (Recommended)
Run the login command and select **"Sync Models"**:
```bash
opencode login windsurf
```

### Method 2: Via CLI
Run the sync script directly from the plugin directory:
```bash
bun run sync-models
```
This will scan your Windsurf configuration and update `~/.config/opencode/opencode.json` with the correct model IDs and human-readable labels.

## Opencode Configuration

Your `opencode.json` should point to the local proxy started by the plugin. Use the sync tool above to populate the `models` list automatically.

```json
{
  "plugin": ["opencode-windsurf-auth@beta"],
  "provider": {
    "windsurf": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://127.0.0.1:42100/v1"
      },
      "models": {
        "claude-4.5-opus-thinking": {
          "name": "Claude 4.5 Opus Thinking (Windsurf)",
          "limit": {
            "context": 200000,
            "output": 8192
          }
        },
        "gpt-5.1-codex-max": {
          "name": "GPT 5.1 Codex Max (Windsurf)",
          "limit": {
            "context": 200000,
            "output": 8192
          },
          "variants": {
            "low": {},
            "medium": {},
            "high": {}
          }
        },
        "gemini-3.0-pro": {
          "name": "Gemini 3.0 Pro (Windsurf)",
          "limit": {
            "context": 200000,
            "output": 8192
          },
          "variants": {
            "minimal": {},
            "low": {},
            "medium": {},
            "high": {}
          }
        },
        "minimax-m2.1": {
          "name": "Minimax M2.1 (Windsurf)",
          "limit": {
            "context": 200000,
            "output": 8192
          }
        },
        "glm-4.7": {
          "name": "GLM 4.7 (Windsurf)",
          "limit": {
            "context": 200000,
            "output": 8192
          }
        },
        "glm-4.7-fast": {
          "name": "GLM 4.7 Fast (Windsurf)",
          "limit": {
            "context": 200000,
            "output": 8192
          }
        }
      }
    }
  }
}
```

After saving the config:

```bash
opencode models list                                            # confirm models appear under windsurf/
opencode chat --model=windsurf/claude-4.5-opus "Hello"          # quick smoke test
```

Keep Windsurf running and signed in—credentials are fetched live from the IDE process.

## Project Layout

```
src/
├── plugin.ts              # Proxy server & OpenCode hooks
├── plugin/
    ├── auth.ts            # Process-based credential discovery (CSRF/Port)
    ├── grpc-client.ts     # Protobuf/gRPC communication logic
    ├── models.ts          # Internal ID to Enum mapping
    └── types.ts           # Protobuf Enums including PRIVATE slots
scripts/
└── sync-models.ts         # Data-driven model discovery script
```

## How It Works

1. **Discovery**: The plugin finds the Windsurf process and extracts the CSRF token from its environment variables (`WINDSURF_CSRF_TOKEN`) and the dynamic port from its listener list.
2. **Proxy**: A local server (Node or Bun) starts to handle incoming OpenCode requests.
3. **Translation**: REST requests are converted to the internal gRPC format, including metadata like your API key and IDE version.
4. **Streaming**: Responses are streamed back in real-time using standard SSE.

## Development

```bash
# Install dependencies
bun install

# Build (TypeScript to JS)
bun run build

# Synchronize models for testing
bun run sync-models

# Run live verification
bun run tests/live/verify-plugin.ts
```

## Known Limitations

- **Windsurf must be running** - The plugin communicates with the local language server
- **macOS focus** - Linux/Windows paths need verification

## Further Reading

- [docs/WINDSURF_API_SPEC.md](https://github.com/rsvedant/opencode-windsurf-auth/blob/master/docs/WINDSURF_API_SPEC.md) – gRPC endpoints & protobuf notes
- [docs/REVERSE_ENGINEERING.md](https://github.com/rsvedant/opencode-windsurf-auth/blob/master/docs/REVERSE_ENGINEERING.md) – credential discovery + tooling
- [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) – related project

## License

MIT
