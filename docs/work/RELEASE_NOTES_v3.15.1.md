chore(release): v3.15.1 — OpenCode v2 contracts verified on the real binary

v3.15.0 shipped v2 plugin shells built from the migration guide alone. This
release replaces every assumption with the contract from @opencode/plugin
2.2.5 and a smoke run against opencode 2.2.5 with a fake provider:

- Fixed: all 17 plugin tools were invisible to the model under v2 (Code Mode
  hides tools registered without options.codemode:false); the safety guards
  never matched (v2's shell tool is `shell`, its file argument `path`).
- Fixed: `opencode run` v2 has no --dir; the conductor and integration review
  spawn with cwd and add --auto for unattended sessions.
- Fixed: four protocol docs registered as bogus agents under v2; now disabled.
- Hooks, events (session.step.* / session.text.ended, with tokens.cache.read),
  compaction (ctx.session.compact), anchor (SystemPart on context/generate/
  compaction) all rebuilt; a strict type-check of plugins-v2 against the real
  types is part of npm test.
- install.sh writes v2-shaped opencode.json (mcp.servers, permissions[]).

Still to do on a Mac: one real-model /guide run per major; LM Studio
prefix-cache probe. Upgrade: ./install.sh --update && doctor.sh
