# Context7 MCP — Live Library Documentation Lookup

**Last updated:** 2026-04-06
**Repo:** https://github.com/upstash/context7
**npm:** `@upstash/context7-mcp`

## What It Does

Context7 fetches **current, version-specific library documentation** at runtime. Instead of generating code from training data (which may be months old), the agent gets the actual API docs before writing code. This prevents hallucinated APIs, deprecated methods, and wrong function signatures.

## Setup

### Claude Code

Add to `~/.claude/settings.json` (or run the one-liner):

```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
```

Or manually in settings.json:
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
```

### OpenCode

Add to `opencode.json` (project) or `~/.config/opencode/opencode.json` (global):

```json
{
  "mcp": {
    "context7": {
      "type": "local",
      "command": ["npx", "-y", "@upstash/context7-mcp@latest"],
      "enabled": true
    }
  }
}
```

**Faster option — remote HTTP (no npx cold start):**
```json
{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "enabled": true
    }
  }
}
```

### API Key (Optional but Recommended)

Get a free key at https://context7.com/dashboard for higher rate limits.

Add as environment variable:
- Claude Code: `"env": { "CONTEXT7_API_KEY": "your-key" }` in mcpServers config
- OpenCode: `"environment": { "CONTEXT7_API_KEY": "your-key" }` in mcp config
- Or set globally: `export CONTEXT7_API_KEY=your-key`

## Tools Provided

### `resolve-library-id`

Converts a human library name to a Context7 ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `libraryName` | string | yes | e.g., `"react"`, `"fastapi"`, `"express"`, `"go-chi"` |

Returns: Context7 library ID (e.g., `/facebook/react`)

### `get-library-docs`

Fetches current documentation for a library.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `context7CompatibleLibraryID` | string | yes | ID from resolve-library-id |
| `topic` | string | no | Focus area: `"routing"`, `"authentication"`, `"hooks"` |
| `tokens` | number | no | Max tokens to return (default: 5000) |

Returns: Current documentation text + code examples.

## How Agents Should Use It

### Before Writing Code That Uses an External Library

```
1. Call resolve-library-id({ libraryName: "express" })
   → Returns "/expressjs/express"

2. Call get-library-docs({ 
     context7CompatibleLibraryID: "/expressjs/express",
     topic: "middleware",
     tokens: 5000
   })
   → Returns current Express middleware docs

3. Write code based on the returned documentation, NOT training data
```

### Trigger Phrase

Users can add `use context7` to any prompt to trigger automatic lookup:
```
Build a REST API with Hono framework. use context7
```

### When to Call Context7

**Always call before:**
- Importing a library you haven't used in this session
- Using a library API you're not 100% certain about
- Writing configuration for a framework (versions change configs frequently)
- Checking if a method/function still exists in the current version

**Don't call for:**
- Standard library / language built-ins (these don't change)
- Code you've already verified in this session
- Simple, well-known patterns (e.g., `console.log`)

## Supported Libraries

Context7 covers thousands of libraries across all major languages. Common examples:

| Language | Libraries |
|----------|-----------|
| JavaScript/TypeScript | React, Next.js, Express, Hono, Fastify, Prisma, Drizzle, shadcn/ui, TanStack, Zod |
| Python | FastAPI, Django, Flask, SQLAlchemy, Pydantic, pytest |
| Go | chi, gin, echo, pgx, cobra, viper |
| Rust | tokio, actix-web, serde, sqlx, axum |
| Java | Spring Boot, Quarkus, Hibernate |

If `resolve-library-id` returns no results, the library may not be indexed. Fall back to reading `node_modules/`, official docs, or source code directly.
