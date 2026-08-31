---
description: 'Never hand-edit block-synced sections in agents/*.md — edit agents/shared/blocks/ and rebuild'
globs:
  - "agents/**/*.md"
alwaysApply: false
---

# Agent shared-block discipline

Agent `.md` files contain sections managed by `scripts/build-agents.mjs`
(headings listed in its `BLOCKS` table: HANDOFF intake, Loop prevention,
Context Budget, Research tools, Code search).

- NEVER hand-edit inside one of those sections — the canonical text lives in
  `agents/shared/blocks/`; edit there and run `npm run agents:fix` to
  propagate deliberately.
- After any agent edit run `npm run agents:check`; it must end
  "all block sections in sync". If YOUR edit caused drift, revert your edit
  inside the block rather than running `agents:fix` to launder it.
- `agents/shared/` holds reference protocols and block sources, never
  runnable agents — reference docs there carry `disable: true` frontmatter.
