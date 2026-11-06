chore(release): v3.17.0 — opt-in OpenCode plugin-load hardening

OpenCode autoloads plugins from a project's .opencode/plugins/ (v2 even while a
session runs), so a prompt-injected download or a cloned repo can get code
execution. On OpenCode v2.2.3+ a plugin.use policy stops it; this release adds:

- install.sh: detects your policy in every config layer; asks [y/N] before
  adding deny-by-default plus allows for attest's plugins and the plugins you
  already have (--harden / --no-harden; --yes never enables it).
- doctor.sh: hardening section; FAILs when a policy blocks attest's own plugins.
- scripts/verify-plugin-policy.sh (--isolated, --probe): proves it on your install.
  Verified on a real OpenCode 2.2.5: dropped project plugin blocked, attest-shaped
  plugin still loads after a fresh start.

v1 has no such policy (docs say so). It is a policy, not a sandbox. After --harden,
restart OpenCode: pkill -f 'opencode serve'. Upgrade: ./install.sh --update
