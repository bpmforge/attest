#!/usr/bin/env node
// build-target-claude.mjs — single-source build step (evolution plan improvement A).
//
// THIS repo (attest) is the canonical source for agents,
// references, validators, and shared tooling. This script generates the
// attest-claude copies: mechanical path rewrites + a small set of prose
// rewrites + whole-file overrides for runtime-flavored docs.
//
//   node scripts/build-target-claude.mjs --check [--out ../attest-claude]
//   node scripts/build-target-claude.mjs --write [--out ../attest-claude]
//
// --check diffs the generated output against the target repo and exits 1 on
// drift — this REPLACES the manual "apply every change to both repos" sync
// rule with a verifiable gate. --write applies the generated files.
//
// Per-target ownership (NOT generated — maintained in attest-claude):
//   skills/, hooks/, docs/, install.sh, uninstall.sh, doctor.sh, README,
//   CHANGELOG, CLAUDE.md. Everything this script generates is stamped as
//   generated in the build manifest it writes.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const argv = process.argv.slice(2);
const MODE = argv.includes('--write') ? 'write' : 'check';
const OUT = (() => {
  const i = argv.indexOf('--out');
  return i === -1 ? join(ROOT, '..', 'attest-claude') : argv[i + 1];
})();

// ── what gets generated ─────────────────────────────────────────────────
export const COPY_GLOBS = [
  ['agents', '.md'],
  ['references', '.md'],
  ['exemplars', '.md'],
  ['scripts/validators', '.sh'],
  ['dist/compact-agents', '.md'],
  // The shared library behind the generated scripts. `gen-status-report.mjs`
  // (invoked by the steward skill, which DOES ship to attest-claude) imports
  // ./lib/tickets.mjs, ./lib/user-stories.mjs and ./lib/status-report.mjs;
  // without these the skill's instruction resolves to a module-not-found. The
  // directory is self-contained — every import inside it is a lib/ sibling.
  ['scripts/lib', '.mjs'],
];
export const COPY_FILES = ['scripts/build-agents.mjs', 'scripts/run-plan.mjs', 'scripts/fix-verify.mjs', 'scripts/mermaid-fix.mjs', 'scripts/telemetry-report.mjs', 'scripts/loop-learn.mjs', 'scripts/api-surface.mjs', 'scripts/gen-status-report.mjs', 'scripts/verify-receipt.mjs', 'scripts/delegation-gate.mjs', 'scripts/delegation-metrics.mjs', 'scripts/review-packet.mjs'];

// Whole-file overrides: runtime-flavored docs maintained per-target in
// build/overrides/claude/<relpath>. No transforms applied to these.
const OVERRIDES_DIR = join(ROOT, 'build', 'overrides', 'claude');

// ── transforms (applied in order; prose BEFORE paths so dual-runtime
//    sentences collapse cleanly instead of becoming "~/.claude/ or ~/.claude/")
const PROSE = [
  // LOOP_PREVENTION dual-runtime path hints
  ['prefix with `~/.config/opencode/` (opencode) or `~/.claude/` (Claude Code) and use the absolute path',
   'prefix with `~/.claude/` and use the absolute path'],
  ["**Use the absolute path:** `~/.config/opencode/agents/shared/X.md` (opencode) or `~/.claude/agents/shared/X.md` (Claude Code). If you're not sure which, list both directories first via `ls`.",
   '**Use the absolute path:** `~/.claude/agents/shared/X.md`. If unsure, list the directory first via `ls`.'],
  // researcher tool-config references
  ['provided by the `playwright-search` MCP server (see `examples/opencode.json`)',
   'provided by the `playwright-search` MCP server (see your MCP config)'],
  ['The opencode built-in `webfetch` and `websearch` tools are **disabled at the config layer** in this project (see `examples/opencode.json` → `"tools": { "webfetch": false, "websearch": false }`). You cannot call them; attempts return an error.',
   'Prefer the `playwright-search` MCP tools below over any built-in webfetch/websearch tools — they extract cleaner content and dedupe across engines. If the MCP server is unavailable, built-in WebFetch/WebSearch are the fallback, not an error.'],
  // OWASP methodology install pointers
  ["Re-run `install.sh` (or `install.sh --project`) from the `attest` repo. The rules are stored in the user's personal OpenCode store",
   "Re-run `install.sh` from the `attest-claude` repo. The rules are stored in the user's personal store at `~/.claude/.semgrep/`"],
  ['(inside the OpenCode project, not the audited repo)',
   '(inside the project running the audit, not the audited repo)'],
  ["(or the checklist file wherever OpenCode installs references for your setup)",
   '(or the checklist file wherever references are installed for your setup)'],
  ['(or wherever OpenCode installs references for your setup)',
   '(or wherever references are installed for your setup)'],
  ["personal store at `~/.config/opencode/.semgrep/custom-rules/` (global) or `.opencode/.semgrep/custom-rules/` (project install)",
   "personal store at `~/.claude/.semgrep/custom-rules/`"],
  // generic runtime mentions that read wrong on Claude
  ['Open a new OpenCode conversation and paste this EXACT prompt',
   'Delegate this EXACT prompt (Task tool preferred; fallback: paste in a new conversation)'],
  ['OpenCode sessions', 'sessions'],
  ['new OpenCode session', 'new session'],
  ['OpenCode session', 'session'],
];
const PATHS = [
  ['~/.config/opencode/', '~/.claude/'],
  ['$HOME/.config/opencode', '$HOME/.claude'],
  ['.opencode/', '.claude/'],
];

export function transform(text) {
  for (const [a, b] of PROSE) text = text.split(a).join(b);
  for (const [a, b] of PATHS) text = text.split(a).join(b);
  return text;
}

// ── skills parity check (T22.12) ────────────────────────────────────────
// `skills/` is per-target hand-maintained content (see file header), never
// generated, so the "author skills in BOTH repos" invariant had no
// validator — drift was silent. This diffs skill IDENTITY (not directory
// name — opencode dirs and attest-claude dirs use different naming
// conventions for the same skill, e.g. opencode `skills/git/` has
// `name: git-expert`, attest-claude `skills/git-expert/` has
// `trigger: /git-expert` — both resolve to id `git-expert`).
//
// Every exception below is cited so an unjustified gap can never hide here
// (M22 rubric: "no coverage claim whose denominator came from the
// claimant"). Anything NOT listed here is real, uncited drift and MUST fail.
export const SKILL_PARITY_EXCEPTIONS = new Set([
  // Opencode-only "wrapper" skills: the underlying agent ships in
  // attest-claude/agents/ (confirmed: challenger.md, migration-planner.md,
  // documentation-gap-finder.md, frontend-design.md,
  // llm-integration-engineer.md, end-user-simulator.md, release-manager.md
  // all exist there) and is reached via the Task tool instead of a skill
  // trigger. Cited: attest-claude CHANGELOG.md v1.26.0-v1.26.3
  // (2026-07-01), e.g. "the wrapper skills are opencode-only; in Claude
  // Code these agents are reached via the Task tool."
  'challenge', 'migration-planner', 'documentation-gap-finder', 'frontend',
  'llm-integration', 'end-user-simulator', 'release',
  // Opencode-only, program-internal: operates on THIS program's own
  // plan.json/ticket-board machinery, not a portable expert-system
  // capability. Cited: opencode skills/reflow/SKILL.md's own description
  // ("Reflow the module-ticket graph...").
  'reflow',
  // Opencode-only, explicitly scoped placeholder. Cited: opencode
  // skills/user-guide/SKILL.md description: "Placeholder skill front door —
  // T21.2 scope only."
  'user-guide',
  // Claude-only: a usage cheat sheet for the claude-memory MCP tool surface
  // (memory_store/memory_recall/session_restore/...), which has no
  // opencode-side equivalent skill trigger. Cited: attest-claude
  // skills/memory/SKILL.md content (entirely MCP tool-call examples, no
  // frontmatter/slash trigger at all).
  'memory',
]);

// Real, uncited drift as of T22.12 — NOT exceptions (an exception means "this
// skill is legitimately one-sided by design"; these are not, they're just
// not ported yet). Kept separate from SKILL_PARITY_EXCEPTIONS so
// skillsParity() still reports them truthfully in missingInClaude (see
// test-skills-parity.ts's live-pair assertion, which expects exactly this
// set) — only the CLI --check exit code below treats them as a known,
// tracked warning instead of a hard failure, pending a follow-up ticket to
// actually port them into attest-claude/skills/. Removing an id here
// without porting the skill first will correctly go red again.
// v2.0.0: emptied — the four documented gaps (design-options, explore,
// simplify, steward) plus game-asset-pipeline were ported to attest-claude
// for the v2 release; parity is now exact. Add entries here ONLY with a
// tracked follow-up ticket.
export const KNOWN_MISSING_IN_CLAUDE = new Set([]);

function parseSkillFrontmatter(skillMdPath) {
  const text = readFileSync(skillMdPath, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      if (/^\s/.test(line)) continue; // skip indented nested fields (e.g. `arguments:` list items)
      const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return fm;
}

function listSkillDirs(repoRoot) {
  const dir = join(repoRoot, 'skills');
  const map = new Map(); // dirName -> frontmatter
  if (!existsSync(dir)) return map;
  for (const e of readdirSync(dir)) {
    const skillMd = join(dir, e, 'SKILL.md');
    if (existsSync(skillMd) && statSync(skillMd).isFile()) map.set(e, parseSkillFrontmatter(skillMd));
  }
  return map;
}

// opencode: the SKILL.md `name:` field IS the slash-command slug.
function opencodeSkillId(dirName, fm) {
  return fm.name || dirName;
}

// claude: generated-style skills carry `trigger:` (their `name:` is a
// display label, e.g. "Git Expert", not a slug) — strip the leading `/`.
// Hand-authored skills (architect, code, guide, ...) have no `trigger:` and
// use `name:` as the slug directly, same convention as opencode. `memory`
// has no frontmatter at all — fall back to the directory name.
function claudeSkillId(dirName, fm) {
  if (fm.trigger) return fm.trigger.replace(/^\//, '');
  if (fm.name && /^[a-z][a-z0-9-]*$/.test(fm.name)) return fm.name;
  return dirName;
}

// Pure + side-effect-free so it's testable against fixture directories
// without triggering this file's own build side effects.
export function skillsParity(opencodeRoot, claudeRoot, exceptions = SKILL_PARITY_EXCEPTIONS) {
  const oc = listSkillDirs(opencodeRoot);
  const cl = listSkillDirs(claudeRoot);

  const ocById = new Map();
  for (const [dir, fm] of oc) ocById.set(opencodeSkillId(dir, fm), fm);
  const clById = new Map();
  for (const [dir, fm] of cl) clById.set(claudeSkillId(dir, fm), fm);

  const missingInClaude = [...ocById.keys()].filter((id) => !clById.has(id) && !exceptions.has(id)).sort();
  const missingInOpencode = [...clById.keys()].filter((id) => !ocById.has(id) && !exceptions.has(id)).sort();

  const contentDrift = [];
  for (const [id, ocFm] of ocById) {
    if (!clById.has(id)) continue;
    const clFm = clById.get(id);
    const ocDesc = transform(ocFm.description || '');
    const clDesc = clFm.description || '';
    if (ocDesc && clDesc && ocDesc !== clDesc) contentDrift.push(id);
  }
  contentDrift.sort();

  return { missingInClaude, missingInOpencode, contentDrift };
}

// ── collect source files ────────────────────────────────────────────────
function* walk(dir, ext) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p, ext);
    else if (p.endsWith(ext)) yield p;
  }
}

// CLI entry point only — guarded so `skillsParity()` (and the other helpers
// above) can be imported for testing without triggering a real build/check.
if (import.meta.url === `file://${process.argv[1]}`) {
  const outputs = new Map(); // relpath -> content
  for (const [dir, ext] of COPY_GLOBS) {
    for (const abs of walk(join(ROOT, dir), ext)) {
      const rel = relative(ROOT, abs);
      outputs.set(rel, transform(readFileSync(abs, 'utf8')));
    }
  }
  for (const rel of COPY_FILES) {
    outputs.set(rel, transform(readFileSync(join(ROOT, rel), 'utf8')));
  }
  // apply overrides last (already target-flavored)
  for (const abs of walk(OVERRIDES_DIR, '.md')) {
    const rel = relative(OVERRIDES_DIR, abs);
    outputs.set(rel, readFileSync(abs, 'utf8'));
  }

  // manifest of generated files
  const manifest = [...outputs.keys()].sort();
  outputs.set('GENERATED_FILES.txt',
    '# Generated by attest/scripts/build-target-claude.mjs — DO NOT EDIT THESE FILES HERE.\n' +
    '# Edit the canonical source in attest, then run: npm run build:claude\n' +
    '# Per-target files (skills/, hooks/, docs/, install.sh, doctor.sh, README, CHANGELOG) are owned by this repo.\n\n' +
    manifest.join('\n') + '\n');

  // ── check / write ─────────────────────────────────────────────────────
  let drift = [];
  for (const [rel, content] of outputs) {
    const dest = join(OUT, rel);
    const current = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
    if (current !== content) drift.push(rel + (current === null ? ' (missing)' : ''));
    if (MODE === 'write') {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
    }
  }

  // leftover check: stale opencode paths in generated output
  let leaks = 0;
  for (const [rel, content] of outputs) {
    if (rel.endsWith('.md') && /config\/opencode|(?<!bpm-)\bopencode\.json/.test(content) && !/BROWSER_TESTING|MEMORY_PRIMER|context7-mcp/.test(rel)) {
      console.log(`  [leak?] ${rel} still mentions an opencode path/config`);
      leaks++;
    }
  }

  // skills parity (T22.12) — runs in both modes, only fails --check.
  const parity = skillsParity(ROOT, OUT);
  const knownMissingInClaude = parity.missingInClaude.filter((id) => KNOWN_MISSING_IN_CLAUDE.has(id));
  const newMissingInClaude = parity.missingInClaude.filter((id) => !KNOWN_MISSING_IN_CLAUDE.has(id));
  if (knownMissingInClaude.length) {
    console.log(`  [known gap, tracked] ${knownMissingInClaude.length} skill(s) missing from attest-claude, follow-up pending: ${knownMissingInClaude.join(', ')}`);
  }
  if (newMissingInClaude.length) {
    console.log(`SKILLS DRIFT (${newMissingInClaude.length} skill(s) missing from attest-claude):`);
    for (const id of newMissingInClaude) console.log('  ' + id);
  }
  if (parity.missingInOpencode.length) {
    console.log(`SKILLS DRIFT (${parity.missingInOpencode.length} skill(s) missing from opencode):`);
    for (const id of parity.missingInOpencode) console.log('  ' + id);
  }
  if (parity.contentDrift.length) {
    console.log(`  [content-drift?] description text differs for same-name skill(s): ${parity.contentDrift.join(', ')}`);
  }

  if (MODE === 'check') {
    if (drift.length) {
      console.log(`DRIFT (${drift.length} file(s) differ from generated output):`);
      for (const d of drift) console.log('  ' + d);
      process.exit(1);
    }
    if (newMissingInClaude.length || parity.missingInOpencode.length) process.exit(1);
    console.log(`claude target in sync: ${outputs.size} generated files match (${leaks} leak warnings, ${knownMissingInClaude.length} known skill gap(s) tracked, ${parity.contentDrift.length} skill content-drift warnings)`);
  } else {
    console.log(`wrote ${outputs.size} generated files to ${OUT} (${drift.length} changed, ${leaks} leak warnings)`);
    if (drift.length > 0) {
      // Dual-repo release hygiene: a canonical release that changes generated
      // files needs a MATCHING tag + release in the generated repo — a step
      // that has been silently skipped before (e.g. attest-claude v1.23.0).
      console.log(
        `\n⚠ ${drift.length} generated file(s) changed in the Claude target. After you tag this repo,` +
        `\n  commit the regenerated files there AND create a matching tag + GitHub/Gitea release` +
        `\n  (git tag vX.Y.Z, push to BOTH remotes). If 0 had changed, no generated-repo release is needed.`
      );
    }
  }
}
