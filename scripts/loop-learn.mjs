#!/usr/bin/env node
/**
 * loop-learn.mjs — turn a loop failure into a durable correction.
 *
 * Loop-engineering principle (Boris Cherny): "Every single time Claude makes a
 * mistake, I don't tell it to do it differently. I tell it to write it to the
 * CLAUDE.md, or make a skill." This closes the learning loop: whenever a
 * coverage / fix-verify / Ralph-Wiggum loop hits an escalation (cap exhausted,
 * no-progress halt, unverifiable), record WHY so the same mistake is not retried
 * next week.
 *
 * Appends a structured lesson to:
 *   1. <project>/docs/work/LESSONS.md        (append-only ledger, always)
 *   2. <project>/CLAUDE.md "## Learned lessons (auto)"  (with --claude)
 * and prints a memory_store JSON payload on stdout for the orchestrator to pass
 * to the memory MCP (this script does not call MCP itself — it stays dependency-free).
 *
 * Usage:
 *   node scripts/loop-learn.mjs \
 *     --symptom "phase-3 erd-coverage stuck at 88% for 3 iterations" \
 *     --cause   "validate-erd-coverage.sh flags JSONB columns it can't parse" \
 *     --rule    "document JSONB columns in DATABASE.md under an explicit 'Untyped columns' heading" \
 *     --source  "ralph-wiggum:phase-3" \
 *     [--project /path/to/target] [--claude]
 *
 * Exit 0 on success, 2 on bad args.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function parseArgs(argv) {
  const out = { project: process.cwd(), claude: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--claude') { out.claude = true; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith('--')) { out[key] = true; }
      else { out[key] = val; i++; }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const { symptom, cause, rule, source = 'loop', project } = args;

if (!symptom || !cause || !rule) {
  console.error('loop-learn: --symptom, --cause, and --rule are all required.');
  console.error('  node scripts/loop-learn.mjs --symptom "..." --cause "..." --rule "..." [--source x] [--project DIR] [--claude]');
  process.exit(2);
}

const ts = new Date().toISOString();
const workDir = join(project, 'docs', 'work');
mkdirSync(workDir, { recursive: true });

// 1. Append-only ledger.
const ledger = join(workDir, 'LESSONS.md');
if (!existsSync(ledger)) {
  writeFileSync(ledger, '# Lessons — auto-captured from loop escalations\n\n' +
    'One row per loop failure. `loop-learn.mjs` appends here; `/steward` distills these into the\n' +
    'canonical CLAUDE.md / skills / exemplars instead of cold-starting.\n\n' +
    '| When | Source | Symptom | Root cause | Rule (do this next time) |\n' +
    '|------|--------|---------|------------|--------------------------|\n');
}
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
appendFileSync(ledger, `| ${ts} | ${esc(source)} | ${esc(symptom)} | ${esc(cause)} | ${esc(rule)} |\n`);

// 2. Optionally surface into the project CLAUDE.md so the next session loads it.
if (args.claude) {
  const claudePath = join(project, 'CLAUDE.md');
  const heading = '## Learned lessons (auto)';
  const line = `- **${esc(rule)}** — _${esc(symptom)}; cause: ${esc(cause)}_ (${esc(source)}, ${ts.slice(0, 10)})`;
  if (existsSync(claudePath)) {
    const body = readFileSync(claudePath, 'utf8');
    // Anchor to the heading at start-of-line so a mention in prose can't match.
    const headingRe = /^## Learned lessons \(auto\)$/m;
    if (headingRe.test(body)) {
      writeFileSync(claudePath, body.replace(headingRe, `${heading}\n${line}`));
    } else {
      appendFileSync(claudePath, `\n\n${heading}\n\n${line}\n`);
    }
  } else {
    writeFileSync(claudePath, `${heading}\n\n${line}\n`);
  }
}

// 3. Emit a memory_store payload for the orchestrator (structured error memory).
const payload = {
  tool: 'memory_store',
  content: `LOOP LESSON [${source}]: ${symptom}. Root cause: ${cause}. Rule: ${rule}.`,
  type: 'error',
  confidence: 0.9,
  citation: `docs/work/LESSONS.md (${ts})`,
};
console.log(JSON.stringify(payload, null, 2));
console.error(`[loop-learn] recorded → ${ledger.replace(project + '/', '')}${args.claude ? ' + CLAUDE.md' : ''}`);
