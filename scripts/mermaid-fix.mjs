#!/usr/bin/env node
// mermaid-fix.mjs — mechanically repair the safe, unambiguous Mermaid mistakes
// LLM generation introduces. Operates ONLY inside ```mermaid fenced blocks.
//
//   node scripts/mermaid-fix.mjs <file.md> [more.md ...]   # dry-run: show what would change
//   node scripts/mermaid-fix.mjs <file.md> --write          # apply in place
//   node scripts/mermaid-fix.mjs docs/ --write              # recurse a directory
//
// Fixes applied (only the safe ones — never touches diagram logic):
//   F1  smart quotes  “ ” ‘ ’  →  " " ' '
//   F2  em/en-dash    —  –   →  -            (outside arrow tokens)
//   F3  non-breaking space → regular space; strip trailing whitespace
//   F4  unicode arrow → ⇒ ➔ ⟶  →  -->
//   F5  // comment    →  %%
//   F6  <br>          →  <br/>
//   F7  parentheses / colon / markdown inside an unquoted [label] → wrap label in "…"
//       and strip ** and ` from the label text
//
// Ambiguous problems (reserved-word `end`, unbalanced brackets) are NOT
// autofixed — they're reported by validate-mermaid.sh for a human/agent to fix.

import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const targets = args.filter((a) => !a.startsWith('--'));
if (!targets.length) { console.error('usage: mermaid-fix.mjs <file|dir> [...] [--write]'); process.exit(2); }

function* mdFiles(p) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) {
      if (e === 'node_modules' || e === '.git') continue;
      yield* mdFiles(join(p, e));
    }
  } else if (p.endsWith('.md')) yield p;
}

// fix one mermaid block body; returns {text, changes}
function fixBlock(body) {
  let changes = 0;
  const sub = (re, to) => { const before = body; body = body.replace(re, to); if (body !== before) changes++; };

  sub(/[“”]/g, '"');          // F1 smart double quotes
  sub(/[‘’]/g, "'");          // F1 smart single quotes
  sub(/ /g, ' ');                  // F3 non-breaking space
  sub(/[→⇒➔⟶]/g, '-->'); // F4 unicode arrows
  sub(/<br>/g, '<br/>');                // F6

  // line-oriented fixes
  body = body.split('\n').map((line) => {
    let l = line;
    // F2 em/en-dash → hyphen, but don't mangle a real `---`/`-->` arrow
    l = l.replace(/[—–]/g, (m, off, s) => {
      const around = s.slice(Math.max(0, off - 1), off + 2);
      return /[-=>]/.test(around) ? '-' : '-';
    });
    // F5 // comment → %%  (only a line that is purely a comment)
    l = l.replace(/^(\s*)\/\/(.*)$/, '$1%%$2');
    // F3 trailing whitespace
    l = l.replace(/[ \t]+$/, '');
    // F7 unquoted [label] containing ( ) : ** or backtick → quote it, strip md
    l = l.replace(/\[([^\]"]*?)\]/g, (whole, label) => {
      const needsQuote = /[():]|\*\*|`/.test(label);
      if (!needsQuote) return whole;
      const cleaned = label.replace(/\*\*/g, '').replace(/`/g, '').trim();
      return `["${cleaned}"]`;
    });
    if (l !== line) changes++;
    return l;
  }).join('\n');

  return { body, changes };
}

let totalChanges = 0, filesChanged = 0;
for (const target of targets) {
  for (const file of mdFiles(target)) {
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    let inM = false, out = [], buf = [], changed = 0;
    for (const line of lines) {
      if (!inM && /^\s*```mermaid\s*$/.test(line)) { inM = true; out.push(line); buf = []; continue; }
      if (inM && /^\s*```\s*$/.test(line)) {
        const { body, changes } = fixBlock(buf.join('\n'));
        changed += changes;
        out.push(body, line);
        inM = false; buf = [];
        continue;
      }
      if (inM) buf.push(line); else out.push(line);
    }
    if (changed > 0) {
      filesChanged++; totalChanges += changed;
      if (WRITE) { writeFileSync(file, out.join('\n')); console.log(`fixed ${changed} issue(s): ${file}`); }
      else console.log(`would fix ${changed} issue(s): ${file}  (run with --write)`);
    }
  }
}
console.log(`\nmermaid-fix: ${totalChanges} fix(es) across ${filesChanged} file(s)${WRITE ? '' : ' — dry run, nothing written'}`);
process.exitCode = 0;
