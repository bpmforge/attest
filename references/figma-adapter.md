# Figma Adapter — bring a real Figma design into the design pipeline

**Last updated:** 2026-07-14
**Code:** `scripts/figma/figma.mjs` (+ `figma.sh`), `scripts/lib/design-tokens.mjs`
**Design:** [`docs/DESIGN_FIGMA_ADAPTER.md`](../docs/DESIGN_FIGMA_ADAPTER.md)

Pulls a Figma file into a normalized snapshot the design agents consume, and
derives `docs/design/tokens.json` from it. **`tokens.json` stays the source of
truth for the build**; Figma is the design source it's derived from. Same pattern
as the Jira adapter (`references/jira-adapter.md`). When Figma isn't configured,
`design-system-lead` authors `tokens.json` from prose exactly as before.

## Setup

```bash
export FIGMA_TOKEN=<personal-access-token>   # figma.com → Settings → Personal access tokens
export FIGMA_FILE_KEY=<key>                  # from the file URL: figma.com/file/<KEY>/…
scripts/figma/figma.sh doctor                # verify config + connectivity
```

## Verbs

```
figma.sh pull            # file → docs/design/figma-snapshot.json (variables→tokens, components, frames→screens)
figma.sh derive-tokens   # figma-snapshot.json → docs/design/tokens.json (design-system-lead shape)
figma.sh doctor          # config + connectivity
```

## Flow

```
Figma file → figma.sh pull → figma-snapshot.json → figma.sh derive-tokens → tokens.json → frontend-design --system → code
```

`design-system-lead` runs `derive-tokens` when a snapshot exists (Figma is the
token source of truth), then authors only the required keys Figma didn't provide
(the adapter lists them, e.g. `color.surface`, `typography.fontFamily`). One
direction only — Figma → tokens.json → code; never push design back.

## Gate

`scripts/validators/validate-design-tokens.sh` (offline; skips clean unless
`figma-snapshot.json` exists): **dropped-token** — a Figma color missing from
`tokens.json` (a design token silently dropped); **snapshot-without-tokens** —
pulled but never derived; **value-drift** (advisory) — a color diverged between
Figma and `tokens.json`.

## Notes & limits

- Auth is `X-Figma-Token` (a Figma PAT), not Bearer.
- The **Variables API requires a paid Figma plan**. On a free plan `pull` returns
  0 tokens but still captures components + screens; author `tokens.json` by hand.
- Token→key mapping is by naming convention (`color/primary`, `spacing/2`,
  `color/semantic/error`, `motion/fast`). Off-convention names are reported as
  unmapped rather than dropped.

## Optional: Figma Dev Mode MCP

For live select-frame→code while designing, the official Figma Dev Mode MCP can
be wired as an optional MCP (like `playwright-mcp`). The REST adapter here is the
portable, CI-testable default; the MCP is an interactive enhancement, not a
dependency.
