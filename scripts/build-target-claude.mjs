#!/usr/bin/env node
// build-target-claude.mjs — single-source build step (evolution plan improvement A).
//
// THIS repo (bpm-opencode-experts) is the canonical source for agents,
// references, validators, and shared tooling. This script generates the
// claude-experts copies: mechanical path rewrites + a small set of prose
// rewrites + whole-file overrides for runtime-flavored docs.
//
//   node scripts/build-target-claude.mjs --check [--out ../claude-experts]
//   node scripts/build-target-claude.mjs --write [--out ../claude-experts]
//
// --check diffs the generated output against the target repo and exits 1 on
// drift — this REPLACES the manual "apply every change to both repos" sync
// rule with a verifiable gate. --write applies the generated files.
//
// Per-target ownership (NOT generated — maintained in claude-experts):
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
  return i === -1 ? join(ROOT, '..', 'claude-experts') : argv[i + 1];
})();

// ── what gets generated ─────────────────────────────────────────────────
const COPY_GLOBS = [
  ['agents', '.md'],
  ['references', '.md'],
  ['scripts/validators', '.sh'],
  ['dist/compact-agents', '.md'],
];
const COPY_FILES = ['scripts/build-agents.mjs', 'scripts/run-plan.mjs'];

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
  ["Re-run `install.sh` (or `install.sh --project`) from the `bpm-opencode-experts` repo. The rules are stored in the user's personal OpenCode store",
   "Re-run `install.sh` from the `claude-experts` repo. The rules are stored in the user's personal store at `~/.claude/.semgrep/`"],
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

function transform(text) {
  for (const [a, b] of PROSE) text = text.split(a).join(b);
  for (const [a, b] of PATHS) text = text.split(a).join(b);
  return text;
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
  '# Generated by bpm-opencode-experts/scripts/build-target-claude.mjs — DO NOT EDIT THESE FILES HERE.\n' +
  '# Edit the canonical source in bpm-opencode-experts, then run: npm run build:claude\n' +
  '# Per-target files (skills/, hooks/, docs/, install.sh, doctor.sh, README, CHANGELOG) are owned by this repo.\n\n' +
  manifest.join('\n') + '\n');

// ── check / write ───────────────────────────────────────────────────────
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

if (MODE === 'check') {
  if (drift.length) {
    console.log(`DRIFT (${drift.length} file(s) differ from generated output):`);
    for (const d of drift) console.log('  ' + d);
    process.exit(1);
  }
  console.log(`claude target in sync: ${outputs.size} generated files match (${leaks} leak warnings)`);
} else {
  console.log(`wrote ${outputs.size} generated files to ${OUT} (${drift.length} changed, ${leaks} leak warnings)`);
}
