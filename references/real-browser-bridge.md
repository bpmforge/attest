# Real-Browser Bridge — auditing logged-in, real-world UIs

The visual design loop (`references/visual-design-loop.md`) defaults to a dev server in an
isolated browser. That never covers: SSO-gated dashboards, personalization-dependent states,
paywalled or competitor flows, or "walk the app exactly as our logged-in customer sees it"
end-user E2E. This doc is the decision guide for those cases — how our agents get the same
capability Claude-in-Chrome provides, in any client (OpenCode included), ranked by setup cost.

**The headline: we do not need to build a Chrome extension to get this.** Anthropic's extension
drives Chrome through the CDP `debugger` API — the same protocol Playwright speaks natively —
and `@playwright/mcp` (verified v0.0.79) already ships persistent-profile, CDP-attach, and its
own official extension mode. Building our own is Tier 5, kept as a blueprint for the day a
concrete use case blocks on all lower tiers.

## Decision table

| Situation | Tier | How |
|---|---|---|
| App runs locally, no auth (or seeded test creds) | **T0 — default** | `playwright-mcp` as installed; nothing extra |
| Audit needs a login that persists across sessions | **T1 — persistent profile** | playwright-mcp's default profile IS persistent (`~/Library/Caches/ms-playwright/mcp-*` on macOS; `--user-data-dir` to relocate, `--isolated` is the opt-out). Log in once in headed mode (`PLAYWRIGHT_MCP_HEADED=true`); the session sticks. Alternative: capture once and reuse via `--storage-state <file>` |
| Must drive the user's actual day-to-day Chrome — their profile, their extensions, their MFA'd sessions | **T2 — extension mode** | `npx @playwright/mcp@latest --extension` + the official "Playwright Extension" installed in Chrome/Edge. The MCP server relays into an already-running browser tab. This is the direct claude-in-chrome equivalent that works in OpenCode and any MCP client |
| Attach to a Chrome the user launched themselves | **T3 — CDP attach** | User starts Chrome with `--remote-debugging-port=9222`; run playwright-mcp with `--cdp-endpoint http://localhost:9222` |
| Session is Claude Code with the Anthropic extension installed | **T4 — claude-in-chrome** | Use the `mcp__claude-in-chrome__*` tools (`navigate`, `computer`, `read_page`, `read_console_messages`, `resize_window`, `gif_creator`, …). Real login state, pause-on-CAPTCHA/login handoff, per-site permissions managed in the extension. Claude Code only — never assume it in OpenCode |
| A concrete need all four tiers can't meet | **T5 — build our own** | Blueprint below |

Tier names are for reports ("audited via T2 extension mode") so the provenance of a screenshot —
isolated profile vs. real user session — is never ambiguous.

## Practical notes per tier

- **T1/T2/T3 login handoff:** when a login page or CAPTCHA appears, stop and ask the human to
  complete it in the headed window, then continue. Never attempt to solve a CAPTCHA or guess
  credentials — that mirrors claude-in-chrome's own pause-and-handoff behavior.
- **T2 setup:** install the Playwright Extension in Chrome/Edge, register the MCP server with
  `--extension` (env: `PLAYWRIGHT_MCP_EXTENSION`). Tool surface is the same `browser_*` set, so
  the visual-design-loop protocol runs unchanged on top of it.
- **T4 tool mapping:** claude-in-chrome names differ (`computer` for click/type/screenshot,
  `read_page` for the tree). The loop's *protocol* is identical; only the tool table swaps.
- **Viewports in real browsers:** T2/T4 drive a real window — use `resize_window` /
  `browser_resize`, and accept that DPR/device emulation is weaker than T0's; note it in the log.

## Findings-only in real environments

In T2/T3/T4 you are usually looking at a deployed app you cannot hot-edit. The loop degrades to
**capture → critique → report** (no fix/re-verify leg): write findings to
`docs/design/DESIGN_AUDIT_LIVE.md` in the standard grounded format, then close them later against
a local dev server with the full loop.

## Safety rules (any real-browser tier — non-negotiable)

1. A real session acts **as the user**. Read-only auditing by default: no purchases, sends,
   deletes, posts, or settings changes without the human explicitly approving that specific action.
2. Screenshots of logged-in UIs can contain PII, tokens, and account data. Capture only what the
   audit needs, store under `docs/screenshots/`, and scrub emails/tokens/names before a report
   leaves the repo.
3. Never paste credentials into pages or store them in specs; `--secrets` / storage-state files
   stay untracked (gitignore them).
4. Respect the target: audit apps we own or have authorization to test. Competitor teardowns are
   look-don't-touch — navigation and screenshots only.

## T5 blueprint — our own extension (build only on a proven gap)

What claude-in-chrome actually is, per its permission manifest and docs: an MV3 extension
(`debugger`, `tabs`, `scripting`, `nativeMessaging` permissions) that drives pages via CDP
debugger-attach, connected to the CLI through a native messaging host, surfaced to the model as
MCP tools. Replicating that shape for our stack:

```
OpenCode/agent ── MCP (stdio) ── local bridge server ── native messaging host ── MV3 extension ── CDP ── page
```

- **Extension:** MV3; `chrome.debugger.attach` per tab for click/type/screenshot;
  `chrome.scripting` for text extraction; per-site allowlist kept in extension storage with an
  options page; badge that shows when an agent is attached.
- **Native host:** JSON over stdin/stdout (Chrome's native messaging framing: 4-byte length
  prefix), registered via a manifest in the browser's `NativeMessagingHosts` dir; forwards to a
  Unix socket the bridge server owns.
- **Bridge server:** exposes the tool surface as a standard MCP stdio server — mirror the
  `browser_*` names so every existing protocol doc works unchanged.
- **Safety floor:** read-only vs state-changing tool split with confirmation on state-changing
  calls; hard block on password/CAPTCHA fields (handoff instead); site allowlist default-deny.

Justified only for: multi-browser fleet control, an org-specific safety/permission policy, or a
tool neither T2 nor T4 exposes. Estimated cost is 2–3 weeks to trustworthy, plus permanent
maintenance against Chrome API drift. **Recommendation: adopt T2 now; open a T5 project only when
a named use case fails on T1–T4.**
