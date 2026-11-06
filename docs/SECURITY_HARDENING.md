# Hardening OpenCode against plugin-based prompt injection

## The problem

OpenCode loads JavaScript/TypeScript from `<project>/.opencode/plugins/` automatically, and OpenCode v2 reacts to
changes in that directory while a session is running. Anything that can write a file there gets code execution
inside the agent runtime with your privileges. An agent that is doing ordinary research can be talked into doing
that write by a web page it reads (indirect prompt injection), for example by downloading an archive whose
"results" file is really a link into the plugins directory. The plugin then runs on its own; the model noticing
afterwards does not stop it.

This is a known class of problem in OpenCode (automatic execution of project plugins and config), not something
attest introduces. attest cannot sandbox OpenCode. What it can do is detect your settings and offer the control
OpenCode documents for this exact step.

## The control: `plugin.use` policy (OpenCode 2.2.3+)

A denied plugin "is not loaded, however it was configured". Policies are binary, never prompt, can only tighten,
and a repository cannot re-enable something denied by global or managed config. Last matching statement wins; no
match means allowed. See <https://opencode.ai/v2/docs/policies/>.

```jsonc
{ "policies": [
  { "action": "plugin.use", "resource": "*", "effect": "deny" },
  { "action": "plugin.use", "resource": "<GLOBAL>/plugins/expert-hooks",   "effect": "allow" },
  { "action": "plugin.use", "resource": "<GLOBAL>/plugins/expert-hooks/*", "effect": "allow" }
  // ...same for resume-anchor, and for any plugin you already use
] }
```

**The trap:** a bare `deny *` also blocks attest's own plugins, so the turn cap, stall guard, gates and resume
anchor silently never load. attest handles this in both directions.

## What attest does

| Where | Behaviour |
|---|---|
| `./install.sh` | Detects the current state and prints it. Asks `[y/N]` before changing anything (`[Y/n]` only when your policy is breaking attest). `--harden` applies without asking, `--no-harden` skips. `--yes` never enables it. |
| What `apply` writes | A `deny *`, allows for attest's plugins, and allows for plugins already in your global config and `plugin` list, so only plugins that appear later (project drops, downloads) are blocked. Appended to your `policies`, backup kept at `opencode.json.attest-bak`. Idempotent. |
| What it never does | Edit project config, managed or system layers; remove or loosen your rules; rewrite a `.jsonc` that has comments (it prints the snippet instead); change `external_directory` (attest needs that allow for protocol reads). |
| `doctor.sh` | `PASS` hardened and attest loads; `WARN` open, v1, or too-old v2; `FAIL` your policy blocks attest's plugins. |
| Managed or system policy blocks attest | attest reports the exact rule and layer and tells you to ask whoever manages OpenCode to allow the listed paths. It does not try to override. |
| Shell set to `ask`/`deny` | Reported as a note: fine interactively, but unattended runs (conductor, `opencode run`) will stall on shell steps. |

CLI: `node scripts/lib/opencode-hardening.mjs detect [--json|--doctor|--verdict] | plan | apply`.

## After applying: restart OpenCode

OpenCode v2 runs one shared background service (`opencode serve --service`) for all projects and reads its config
when it starts. A policy added while that service is running is not guaranteed to apply to it. After `--harden`, stop
it (`pkill -f 'opencode serve'`); open windows start a fresh one on demand. `scripts/verify-plugin-policy.sh` refuses to
run while a service is already up for the same reason.

## Limits, stated plainly

- It is a policy, not a sandbox. Code that already loaded, approved shell commands, and anything else the agent
  can do are unaffected. OpenCode recommends a container or VM for real isolation.
- OpenCode v1 has no plugin load policy; detection reports `unsupported-v1`. Upgrade, or isolate.
- The docs identify plugins "by unversioned package name or absolute path" and do not say whether a directory
  plugin is matched by the directory or its entry file, so attest allows and checks both forms. **Verify on your
  install** with `scripts/verify-plugin-policy.sh`: it drops a harmless marker plugin into a scratch project and
  reports whether OpenCode loaded it (expect "loaded" before `--harden`, "not loaded" after). Then start a normal
  session and confirm attest's own hooks still run (`scripts/doctor.sh`).
- Ask-style permissions prompt a human; they stop nothing if the prompt is approved.

## Beyond config

Run untrusted web research and downloads in a disposable environment with no host GitHub login, SSH agent or
broad tokens, and give research agents web tools but no shell or edit permission.
