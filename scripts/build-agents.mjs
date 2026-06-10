#!/usr/bin/env node
// build-agents.mjs — single-source boilerplate for expert agent prompts.
//
// Canonical block text lives in agents/shared/blocks/<name>.md. Agent files
// contain the same sections inline (small models must not need an extra read
// for mandatory rules). This script keeps them in sync:
//
//   --check    exit 1 listing every agent whose block section drifted (CI gate)
//   --fix      rewrite drifted sections to the canonical text
//   --compact  emit dist/compact-agents/<agent>.md with boilerplate sections
//              replaced by the .compact.md variants (for tier=small installs)
//
// Section matching is by exact heading; agents without a given heading are
// untouched. Edit blocks/, run --fix, commit — never edit the sections inline.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const AGENTS_DIR = join(ROOT, 'agents');
const BLOCKS_DIR = join(AGENTS_DIR, 'shared', 'blocks');
const COMPACT_DIR = join(ROOT, 'dist', 'compact-agents');

const BLOCKS = [
  { name: 'loop-prevention', heading: '## Loop prevention (MANDATORY)' },
  { name: 'context-budget', heading: '## Context Budget (MANDATORY for local models)' },
  { name: 'research-tools', heading: '## Research tools (available, optional)' },
];

// (file, block) pairs allowed to keep custom text — orchestrator mode files own
// a deliberately compressed Context Budget phrased for phase-doc loading.
const VARIANT_OK = new Set([
  'sdlc-init-mode.md::context-budget',
  'sdlc-onboard-mode.md::context-budget',
  'sdlc-feature-mode.md::context-budget',
  'sdlc-improve-mode.md::context-budget',
]);

const mode = process.argv[2] ?? '--check';
if (!['--check', '--fix', '--compact'].includes(mode)) {
  console.error('usage: build-agents.mjs --check | --fix | --compact');
  process.exit(2);
}

// Block files carry disable frontmatter so runtimes don't register them as
// agents — strip it before injection.
const loadBlock = (name, compact = false) => {
  let text = readFileSync(join(BLOCKS_DIR, `${name}${compact ? '.compact' : ''}.md`), 'utf8');
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---\n', 4);
    if (end !== -1) text = text.slice(end + 5).replace(/^\n+/, '');
  }
  return text.trimEnd() + '\n';
};

// Replace the section under `heading` (up to the next ## or EOF) with `body`.
// Returns null when the heading is absent.
function replaceSection(text, heading, body) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === heading);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { end = i; break; }
  }
  // preserve exactly one blank line before the next section
  const replacement = body.trimEnd().split('\n');
  return [...lines.slice(0, start), ...replacement, '', ...lines.slice(end)].join('\n');
}

function currentSection(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === heading);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trimEnd() + '\n';
}

// Primary agents only — top-level agents/*.md (clusters keep their own one-liners)
const agentFiles = readdirSync(AGENTS_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => join(AGENTS_DIR, f));

let drifted = [];
let compacted = 0;

for (const file of agentFiles) {
  let text = readFileSync(file, 'utf8');

  if (mode === '--compact') {
    let out = text;
    let touched = false;
    for (const { name, heading } of BLOCKS) {
      const next = replaceSection(out, heading, loadBlock(name, true));
      if (next) { out = next; touched = true; }
    }
    if (touched) {
      mkdirSync(COMPACT_DIR, { recursive: true });
      writeFileSync(join(COMPACT_DIR, basename(file)), out);
      compacted++;
    }
    continue;
  }

  for (const { name, heading } of BLOCKS) {
    if (VARIANT_OK.has(`${basename(file)}::${name}`)) continue;
    const canonical = loadBlock(name);
    const current = currentSection(text, heading);
    if (current === null) continue;
    if (current !== canonical) {
      if (mode === '--fix') {
        text = replaceSection(text, heading, canonical);
        writeFileSync(file, text);
      }
      drifted.push(`${basename(file)} :: ${name}`);
    }
  }
}

if (mode === '--compact') {
  console.log(`compact variants written: ${compacted} → dist/compact-agents/`);
} else if (drifted.length) {
  console.log(`${mode === '--fix' ? 'fixed' : 'DRIFTED'} (${drifted.length}):`);
  for (const d of drifted) console.log('  ' + d);
  process.exit(mode === '--fix' ? 0 : 1);
} else {
  console.log(`all block sections in sync across ${agentFiles.length} agents`);
}
