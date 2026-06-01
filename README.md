# OpenCode Langfuse Plugin

[![npm version](https://badge.fury.io/js/opencode-plugin-langfuse.svg)](https://www.npmjs.com/package/opencode-plugin-langfuse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Automatic LLM observability for OpenCode using Langfuse via OpenTelemetry.**

Zero-config tracing of sessions, messages, tool calls, costs, and performance.

---

## Installation

```bash
npm install opencode-plugin-langfuse
# or
bun add opencode-plugin-langfuse
```

---

## Setup

### 1. Get Langfuse Credentials

Sign up at [cloud.langfuse.com](https://cloud.langfuse.com) and create a project.

Go to **Settings → API Keys** and copy your keys.

### 2. Configure OpenCode

In `.opencode/opencode.json`, pass the Langfuse connection as plugin config.
OpenCode expects each `plugin` entry to be either a string or a two-item array
of `[plugin, options]`:

```json
{
  "experimental": {
    "openTelemetry": true
  },
  "plugin": [
    [
      "opencode-plugin-langfuse",
      {
        "publicKey": "pk-lf-...",
        "secretKey": "sk-lf-...",
        "baseUrl": "https://cloud.langfuse.com",
        "environment": "development"
      }
    ]
  ]
}
```

If you already have other plugins, keep them as separate entries and attach the
Langfuse options directly to the Langfuse plugin entry:

```json
{
  "experimental": {
    "openTelemetry": true
  },
  "plugin": [
    "opencode-gemini-auth@latest",
    [
      "opencode-plugin-langfuse",
      {
        "publicKey": "pk-lf-...",
        "secretKey": "sk-lf-...",
        "baseUrl": "https://cloud.langfuse.com",
        "environment": "development"
      }
    ]
  ]
}
```

Do not put the options object as its own `plugin` entry; OpenCode rejects that
shape before the plugin can read it.

You can also keep credentials in environment variables and reference them from the OpenCode config:

```json
{
  "experimental": {
    "openTelemetry": true
  },
  "plugin": [
    [
      "opencode-plugin-langfuse",
      {
        "publicKey": "{env:LANGFUSE_PUBLIC_KEY}",
        "secretKey": "{env:LANGFUSE_SECRET_KEY}"
      }
    ]
  ]
}
```

Environment variables are still supported as a fallback, so existing configs that only list `"opencode-plugin-langfuse"` continue to work.

### 3. Run OpenCode

That's it! All traces appear automatically in your Langfuse dashboard.

---

## How It Works

This plugin initializes a `LangfuseSpanProcessor` that captures all OpenTelemetry spans emitted by OpenCode when `experimental.openTelemetry` is enabled.

```
OpenCode (OTEL spans) → LangfuseSpanProcessor → Langfuse Dashboard
```

---

## Configuration

| OpenCode plugin option | Env fallback             | Required | Default                      | Description          |
| ---------------------- | ------------------------ | -------- | ---------------------------- | -------------------- |
| `publicKey`            | `LANGFUSE_PUBLIC_KEY`    | Yes      | -                            | Langfuse public key  |
| `secretKey`            | `LANGFUSE_SECRET_KEY`    | Yes      | -                            | Langfuse secret key  |
| `baseUrl`              | `LANGFUSE_BASEURL`       | No       | `https://cloud.langfuse.com` | Self-hosted instance |
| `environment`          | `LANGFUSE_ENVIRONMENT`   | No       | `development`                | Trace environment    |

OpenCode config values take precedence over environment variables. `baseURL` is accepted as an alias for `baseUrl`.

---

## Self-Hosting

```bash
export LANGFUSE_BASEURL="https://langfuse.yourcompany.com"
```

See [Langfuse self-hosting docs](https://langfuse.com/docs/deployment/self-host).

---

## Troubleshooting

### No traces appearing

1. Verify `experimental.openTelemetry: true` is set
2. Check credentials in plugin config or `echo $LANGFUSE_PUBLIC_KEY`
3. Check Langfuse health: `curl https://cloud.langfuse.com/api/public/health`

### Plugin not loading

- Ensure `opencode-plugin-langfuse` is in `dependencies` (not `devDependencies`)
- Verify `.opencode/opencode.json` syntax

---

## License

MIT © omercnet

---

## Related

- [OpenCode](https://opencode.ai/)
- [Langfuse](https://langfuse.com/)
- [Langfuse OTEL Integration](https://langfuse.com/docs/integrations/opentelemetry)
