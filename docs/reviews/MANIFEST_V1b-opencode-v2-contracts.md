# Completion Manifest — WP-V1b: OpenCode v2 contracts verified (attest 3.15.1)

Branch `fix/opencode-v2-contracts` (from `main` @ b2d6a9e = v3.15.0). Supersedes the `ASSUMPTION` / VERIFY-ON-MAC items of
`MANIFEST_M-V1-opencode-v1-v2.md` and `MANIFEST_M-X3-compaction-trigger.md` (v2 parts).
Verified on 2026-11-01 against `@opencode/plugin` 2.2.5 (+ `@opencode/schema`, `@opencode/client`) and the real `opencode` 2.2.5 binary.
Method: the installed `.d.ts` / `.js`, `opencode run --help`, `opencode debug config|agents`, and a fake OpenAI-compatible provider
(`providers.fake` with `package: "@opencode/ai/providers/openai-compatible"`, `settings.baseURL`) that scripted real tool calls, a title request and a compaction.

## What each ASSUMPTION turned out to be

| Assumption (WP-V1) | Fact |
|---|---|
| `opencode run` v2 flags equal v1 incl. `--dir` | **`--dir` does not exist.** v2: `--model/-m provider/model#variant`, `--agent`, `--format default\|json`, `--session/-s`, `--continue/-c`, `--fork`, `--file/-f`, `--title`, `--thinking`, `--auto`. The project is the process cwd. `opencodeRunSpec()` returns `{args, cwd}`; unattended v2 adds `--auto`. |
| `ctx.$` may exist, else shim | No `ctx.$` and no `ctx.client`. Shim stays (`plugins/lib/shell-shim.ts`). |
| hook event carries `{tool, sessionID, args}`; `(ev, out)` pair; `out.output` string | One mutable event. `execute.before` `{tool, sessionID, agent, messageID, id, input}`; `execute.after` adds `status:'completed'` + `result: Tool.Result {output?, content?: string\|Content[], metadata?}` or `status:'error'` + `error`. Truncation edits `result.content` (string or text parts). |
| `ctx.session.hook('prompt')` no-op needed | Dropped; the stall guard needs no prompt hook. |
| `ctx.event.subscribe(cb)` delivering `message.updated` / `message.part.updated` | `subscribe({types, signal})` is an `AsyncIterable` of `{id, created, type, data}`; payload is under `.data`. Assistant message data comes from `session.step.started` (agent, model, started) + `session.step.ended` / `session.step.failed` (finish, cost, `tokens{input,output,reasoning,cache{read,write}}`). |
| text parts via `message.part.updated` | `session.text.ended {assistantMessageID, ordinal, text}`. `session.message.content.updated` is **replay-only** and not in the subscribable list. `session.usage.updated` is **ephemeral with no message id**; not usable for per-turn counting, so step events are the source (same token numbers). |
| `session.compacted` | `session.compaction.started/ended/failed` `{sessionID, reason:'auto'\|'manual', ...}`. |
| `ctx.client.session.summarize` / `ctx.session.summarize` | Neither. `ctx.session.compact({sessionID, id?, delivery?:'steer'\|'queue'})`. `delivery` is left to the host default. |
| `ctx.session.hook('context')` `out.system` is `string[]` | `system: SystemPart[]` = `{type:'text', text, cache?, metadata?}`; push a part. `compaction` and `generate` also carry `system`; `title` is a `SessionRequest` (we skip it: no value, pure token cost). |
| `compaction` hook `out.context` | None; the pointers-to-preserve text rides in `system` of the summarizer request (seen arriving, below). |
| `process.cwd()` is the project | The server may be a shared background service; `ctx.location.directory` is the project. |
| `editor.add({name, description, input, execute(args, ctx)})` | Shape confirmed, **but** a tool added without `options.codemode:false` is hidden behind Code Mode (registered in `ctx.tool.list()`, absent from the model's tool list: `No tool named "bash" is currently available`). All 17 now register `options:{codemode:false, permission}`; `permission` makes the host assert that action (a plugin tool with none runs unchecked). Tool.Context has `progress`, not `metadata`, and no `directory`: shimmed. |
| (unlisted) built-in tool names/args | v2 direct built-ins: `edit`, `patch`, `glob`, `grep`, `question`, `read`, `shell`, `skill`, `subagent`, `webfetch`, `websearch` (+ `execute` Code Mode). Shell is **`shell`** (not `bash`), file argument is **`path`** (not `filePath`): the dangerous-command, `.env`, config-protection and ledger guards never matched. Mapped in `plugins/lib/v2-tools.ts`. |
| `cached_tokens` reported? | Yes. Provider `prompt_tokens 1000 / cached_tokens 700` arrived as `tokens {input:300, cache.read:700}`: **`input` is the non-cached remainder**; the trigger's `input + cache.read + cache.write` is therefore right. |
| v2 config shapes | `mcp.servers.<n>` (`type`, `command`, `disabled`, `codemode`), `permissions: [{action, resource, effect}]`, `compaction.{auto, keep.tokens, buffer}`. Actions seen in the 2.2.5 bundle: `edit`, `webfetch`, `external_directory`, `shell`, `read`, `question`, `execute`. v2 also auto-converts v1-shaped `permission.bash`/`mcp.*` when reading (`opencode debug config`), so the install rewrite is belt-and-braces. |

## Commits

1. `fix(opencode-v2): run argv has no --dir ... adds --auto when unattended` — `scripts/lib/opencode-cli.mjs`, conductor, integration-review, `test-install-version.ts`.
2. `build(types): add @opencode/plugin 2.2.5 + typescript devDeps, strict plugins-v2 tsconfig, fix implicit-any in plugins/lib/tools`.
3. `fix(opencode-v2): rewrite expert-hooks and resume-anchor shells ...` — shells, `plugins/lib/{v2-events,tool-output,post-edit}.ts`, `scripts/test-plugins-v2-types.ts`, `scripts/test.ts`, `install.sh` (+ `scripts/lib/opencode-config-v2.jq`), `doctor.sh`.
4. `fix(opencode-v2): tool names/args, direct tools with permissions, disabled protocol docs` — `plugins/lib/v2-tools.ts`, `build-agents.mjs`.
5. `docs: ...` — this manifest, README, CHANGELOG `## [3.15.1] — Unreleased`, UNATTENDED_EXECUTION, TOKEN_OPTIMIZATION_PLAN §F.

## Smoke on the real binary (E) — exact lines

Scratch project: `.opencode/agents/` = `dist/agents-v2` (+ `shared/full/*.full.md`, as install.sh lays it out), `.opencode/plugins/{expert-hooks,resume-anchor,lib}`, `.opencode/scripts/lib`.
Command (cwd = scratch project, 60 s cap): `opencode --standalone --print-logs run --agent guide --format json "say ok"` (no model configured; it reached the network, got `ECONNRESET`, and was killed by `timeout`; the plugin/agent evidence is in the first second):

```
level=INFO run=d10a36bd message="cli starting" version=2.2.5 channel=latest ...
level=INFO run=d10a36bd message="location services booted" directory=<proj> ... durationMs=112
level=INFO run=d10a36bd msg="loading plugin" id=<proj>/.opencode/plugins/expert-hooks entrypoint=file://<proj>/.opencode/plugins/expert-hooks/index.ts
level=INFO run=d10a36bd msg="loading plugin" id=<proj>/.opencode/plugins/resume-anchor entrypoint=file://<proj>/.opencode/plugins/resume-anchor/index.ts
level=INFO run=d10a36bd message=event event.type=agent.updated ...
{"type":"error",...,"error":{"type":"unknown","message":"Transport: ECONNRESET: ..."}}
```
No plugin parse/registration error. The first `session.step.started` reached our subscription and wrote `docs/work/session-receipts.jsonl`:
`{"source":"plugin","session":"ses_…","agent":"guide","model":"amazon-bedrock/global.openai.gpt-6.1-terra","tier":null}`.
WARNs: `ignored unsupported agent fields ... fields=["name","metadata"]` for the reference docs only (harmless).

Agent discovery (`opencode --standalone debug agents`): **94 agents**, `guide` present (`mode: primary`), **0** reference docs (`agents/shared/**`, `shared/full/*.full.md`, `*PROTOCOL`, `E2E_INFRASTRUCTURE` all absent). Before the build fix it was 99, with `shared/GATE_SCORING_PROTOCOL`, `shared/PHASE_ROUTING_PROTOCOL`, `shared/PRODUCT_SHAPE_PROTOCOL` and `sdlc/PARALLEL_WAVE_PROTOCOL` registered as primary agents (no `disable:` in their frontmatter). Note `opencode debug agents` without `--standalone` talks to a stale background service; use `--standalone` (or `opencode service stop`).

End-to-end with the fake provider (`--model fake/m`, 28 tools offered to the model, results seen by the model in the next request):

```
bash  echo hi-from-attest-bash      -> "hi-from-attest-bash"                      (our tool, now callable)
write out/w.txt                     -> "Written 5 bytes to out/w.txt"             (file exists)
read  BIG.txt (76 KB)               -> "... [… 50,704 chars omitted by expert-hooks (EXPERTS_TOOL_OUTPUT_MAX=2000) — re-read this file with offset/limit for the part you need …]"
shell rm -rf /                      -> {"error":{"type":"unknown","message":"BLOCKED: rm -rf / — would delete the entire filesystem ..."}}
edit  path=.env                     -> {"error":{... "BLOCKED: writing to .env file — use environment variables or a secrets manager is not allowed. Path: .env"}}
bash  git push --force origin main  -> {"error":{... "BLOCKED: git push --force — would rewrite remote history ..."}}
telemetry row: {"source":"plugin","agent":"guide","model":"fake/m","duration_ms":188,"tokens_in":300,"tokens_out":20,"cache_read":700,"cache_write":0,"finish":"tool-calls"}
EXPERTS_COMPACT_AT=100: {"source":"compaction-trigger","turn":1,"tokens_in":1000,"threshold":100,"model":"fake/m"}
  -> "[expert-hooks] CONTEXT SIZE: ... The harness has requested a compaction ..." and a real summarizer request ("You MUST summarize the conversation above ...") reached the provider, with the resume-anchor compaction text and the STATE.md anchor in its system prompt.
anchor: a docs/work/STATE.md "In flight" line (SMOKE-ANCHOR-MARKER) appeared in the system prompt of every tool-bearing request.
stall guard: "[expert-hooks] STALL DETECTED: your last 4 replies were identical/empty ..." and "BLOCKED: repeat-output stall after 6 turns" printed live.
```
A throw from `execute.before` is surfaced to the model as a tool error carrying the message (so guards work; `Tool.Error` is not exported from the package root and is not needed).

## Gates

`npm test` 1276 baseline -> see the final line of the report (new tests: `scripts/test-plugins-v2-types.ts`, 35 checks, plus updated hook-guard wiring and argv checks); `npm run agents:check` green for v1 and v2; `npm run build:claude:check -- --out ../attest-claude` green after regenerating the sibling (see below).

## Still needs a real model / a Mac

- One `/guide` run on a real model for each major (version strings recorded); the LM Studio prefix-cache probe (`scripts/probe-prefix-cache.mjs`).
- Guard gaps that exist on v2 and were found, not fixed: the built-ins `patch` (multi-file edit) and `execute` (Code Mode JavaScript) are not covered by the path/command guards; `execute` can run commands and write files. v2 gives `permissions[]` deny rules and `policies` (`tool.use`) as the native way to deny them.
- MCP servers default to Code Mode in v2 (`mcp.servers.<n>.codemode`, default true): context7 / playwright-search tools are reached through `execute` unless a server sets `codemode:false`. Agents that name those tools directly need a real-model check; `install.sh` does not change the default.
- The shared `task` tool spawns `opencode run --agent X --format json <prompt>` (valid v2 argv, cwd = project) without `--auto`; a sub-agent that needs a permission may stall in v2.
- `delivery` of `ctx.session.compact` is left to the host default; whether `steer` vs `queue` matters for a mid-loop request is a behaviour to watch (the observed request ran within the same run).
- Intermittent startup hang in this container: roughly half of the fresh `opencode --standalone run` starts sat for 25-100 s before `location services booted` (it started before any plugin loaded; I did not test with the plugins removed) and were retried; every completed run behaved identically. Treated as sandbox/proxy flakiness (the proxy refuses `models.opencode.ai`); not investigated.
