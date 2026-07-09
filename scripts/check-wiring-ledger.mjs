#!/usr/bin/env node
// check-wiring-ledger.mjs — every validator and shared protocol must be
// reachable, not just documented (T22.7).
//
// Two independent reachability questions:
//
//   1. Validators (scripts/validators/validate-*.sh): reachable via a
//      DETERMINISTIC chain (a string-literal mention in
//      validate-phase-gate.sh's GATE_VALIDATORS lists, run-handoff-gates.sh,
//      or any scripts/test*.ts Pass module -- npm test IS a deterministic
//      chain, it runs unconditionally) OR via a documented PROSE-TRIGGER (a
//      POSITIVE mention -- not "skip it"/"not needed" -- of its filename
//      somewhere in the live agent instruction corpus, agents/**/*.md
//      recursive, every subdirectory: agents/security, agents/code-review,
//      agents/game, agents/performance, agents/sdlc, agents/test,
//      agents/templates, agents/shared and its blocks/includes subdirs all
//      count -- an LLM agent reading ANY of these files could be told to run
//      it. Neither = orphaned: shipped, but nothing (script or agent) ever
//      invokes it.
//
//   2. Shared protocols (everything under agents/shared/, recursive --
//      agents/shared/*.md plus agents/shared/blocks/*.md and
//      agents/shared/includes/*.md): reachable via a REFERENCE CHAIN from an
//      entry-point agent (every agents/**/*.md file NOT under agents/shared/
//      -- top-level agents/*.md AND nested specialists like
//      agents/security/secrets-scanner.md are all directly loadable, so all
//      are roots). A shared file counts reachable if any reachable file
//      (root or already-reachable shared file) POSITIVELY mentions its
//      basename -- fixpoint iteration, so a two-hop chain (top-level agent
//      -> MODEL_ADAPTER.md -> HANDOFF_QUICK_REF.md, conditional on model
//      tier) counts correctly instead of needing every include listed at
//      every entry point directly.
//
// "Positive mention": found by independent review (2026-07-08) that a bare
// substring/word-boundary match has no directionality -- MODEL_ADAPTER.md's
// "LOCAL_LLM_PRIMER | Not needed. Skip it." line matched the same regex as a
// real "read this" instruction, papering over the ticket's actual ask
// ("steward decision on dead includes") with an accidental pass. Every
// matching line is now checked against a small disqualifier phrase list
// (skip/not needed/deprecated/no longer/do not read/do not load); a target
// only counts reachable if at least one matching line is NOT disqualified.
// This is a heuristic, not a parser -- it narrows the false-positive window,
// it doesn't eliminate every conceivable phrasing.
//
// Known, documented exception: agents/shared/LOCAL_LLM_PRIMER.md is
// deliberately NOT agent-loaded -- its own frontmatter says "Reference
// document — read on demand, not an agent," and docs/LOCAL_LLM_GUIDE.md
// (deliberately outside the agent corpus, since it's a human setup guide)
// instructs a HUMAN to paste its content as the first message of a session,
// before any agent file could reference it. Structurally it can never have a
// real positive agents/**/*.md mention -- that's the file working as
// designed, not evidence it's dead. Carved out explicitly rather than left
// to accidentally pass on a disqualified match.
//
// docs/**/*.md (reference documentation a human reads) does NOT count as a
// live wiring path for either check -- only agents/**/*.md (the corpus an
// LLM session actually loads) does. A validator or protocol documented in
// docs/FEATURES.md's catalog but never mentioned inside agents/ is still an
// orphan: documented is not the same as wired.
//
// Usage: node scripts/check-wiring-ledger.mjs [--json] [project-root]

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

const DISQUALIFIER = /\b(skip it|skip this|not needed|not required|deprecated|no longer used|do not read|do not load|don't read|don't load|never read|never load)\b/i;

// Recursively collect every *.md file under `dir`.
function collectMdFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectMdFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// Does `text` contain a POSITIVE mention of `name` (word-boundary), i.e. at
// least one matching line that isn't disqualified as a negative/skip
// instruction?
function hasPositiveMention(text, namePattern) {
  for (const line of text.split('\n')) {
    if (namePattern.test(line) && !DISQUALIFIER.test(line)) return true;
  }
  return false;
}

export function runWiringLedger(root) {
  const VALIDATORS_DIR = join(root, 'scripts/validators');
  const AGENTS_DIR = join(root, 'agents');
  const SHARED_DIR = join(root, 'agents/shared');

  // -- collect the live agent-instruction corpus (recursive) ---------------
  const allAgentFiles = collectMdFiles(AGENTS_DIR);
  const sharedFiles = existsSync(SHARED_DIR)
    ? allAgentFiles.filter((f) => relative(SHARED_DIR, f).length > 0 && !relative(SHARED_DIR, f).startsWith('..'))
    : [];
  const rootFiles = allAgentFiles.filter((f) => !sharedFiles.includes(f));
  const contentByFile = new Map(
    allAgentFiles.map((f) => [f, readFileSync(f, 'utf8')]),
  );
  const corpusText = [...contentByFile.values()].join('\n');

  // -- 1. validator reachability --------------------------------------------
  const validatorNames = existsSync(VALIDATORS_DIR)
    ? readdirSync(VALIDATORS_DIR, { withFileTypes: true })
        .filter((d) => d.isFile() && /^validate-[a-z0-9-]+\.sh$/.test(d.name))
        .map((d) => d.name)
        .sort()
    : [];

  const gateScript = join(VALIDATORS_DIR, 'validate-phase-gate.sh');
  const handoffScript = join(VALIDATORS_DIR, 'run-handoff-gates.sh');
  const chainedText =
    (existsSync(gateScript) ? readFileSync(gateScript, 'utf8') : '') +
    '\n' +
    (existsSync(handoffScript) ? readFileSync(handoffScript, 'utf8') : '');

  const testFiles = existsSync(join(root, 'scripts'))
    ? readdirSync(join(root, 'scripts'), { withFileTypes: true })
        .filter(
          (d) =>
            d.isFile() &&
            /^test(-[a-z0-9-]+)?\.ts$/.test(d.name),
        )
        .map((d) => join(root, 'scripts', d.name))
    : [];
  const npmTestText = testFiles
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

  // Known, documented exceptions: files that are deliberately unreachable
  // from the agent corpus by design (see header comment). Not a general
  // escape hatch -- each entry needs a real, written justification.
  const KNOWN_EXCEPTIONS = new Set(['LOCAL_LLM_PRIMER']);

  const validatorResults = validatorNames.map((name) => {
    const pattern = new RegExp(name.replace(/[.]/g, '\\.'));
    const chained = pattern.test(chainedText);
    const inNpmTest = pattern.test(npmTestText);
    const prose = hasPositiveMention(corpusText, pattern);
    return {
      name,
      chained,
      inNpmTest,
      prose,
      reachable: chained || inNpmTest || prose,
    };
  });
  const orphanValidators = validatorResults.filter((r) => !r.reachable);

  // -- 2. shared-protocol reachability (fixpoint BFS) -----------------------
  // agents/shared/blocks/<name>[.compact].md files aren't reached via a prose
  // mention -- build-agents.mjs copies their content into every agent file's
  // matching heading section at build time (`--fix`/`--compact`), a
  // deterministic chain analogous to validate-phase-gate.sh for validators.
  const BLOCKS_DIR = join(SHARED_DIR, 'blocks');
  const buildAgentsScript = join(root, 'scripts/build-agents.mjs');
  const buildAgentsText = existsSync(buildAgentsScript)
    ? readFileSync(buildAgentsScript, 'utf8')
    : '';
  const blockNames = new Set(
    [...buildAgentsText.matchAll(/name:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]),
  );
  const reachable = new Set(rootFiles); // every non-shared agent file is an entry point
  for (const sharedFile of sharedFiles) {
    if (relative(BLOCKS_DIR, sharedFile).startsWith('..')) continue;
    const blockName = basename(sharedFile).replace(/(\.compact)?\.md$/, '');
    if (blockNames.has(blockName)) reachable.add(sharedFile);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const sharedFile of sharedFiles) {
      if (reachable.has(sharedFile)) continue;
      const targetName = basename(sharedFile).replace(/\.md$/, '');
      if (KNOWN_EXCEPTIONS.has(targetName)) continue; // documented, not orphaned
      const targetPattern = new RegExp(`\\b${targetName}\\b`);
      for (const candidate of reachable) {
        if (candidate === sharedFile) continue;
        const text = contentByFile.get(candidate) ?? '';
        if (hasPositiveMention(text, targetPattern)) {
          reachable.add(sharedFile);
          changed = true;
          break;
        }
      }
    }
  }
  const orphanShared = sharedFiles
    .filter((f) => !reachable.has(f))
    .filter((f) => !KNOWN_EXCEPTIONS.has(basename(f).replace(/\.md$/, '')))
    .map((f) => basename(f));

  return {
    validatorsChecked: validatorNames.length,
    orphanValidators: orphanValidators.map((r) => r.name),
    sharedChecked: sharedFiles.length,
    orphanShared,
    knownExceptions: [...KNOWN_EXCEPTIONS],
    clean: orphanValidators.length === 0 && orphanShared.length === 0,
  };
}

function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json');
  const root = args.find((a) => !a.startsWith('--')) ?? process.cwd();

  const result = runWiringLedger(root);

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `validators checked: ${result.validatorsChecked} (${result.validatorsChecked - result.orphanValidators.length} reachable)`,
    );
    if (result.orphanValidators.length)
      console.error(
        `  [FAIL] orphaned validators (no chain, no npm-test reference, no positive prose-trigger): ${result.orphanValidators.join(', ')}`,
      );
    console.log(
      `shared protocols checked: ${result.sharedChecked} (${result.sharedChecked - result.orphanShared.length} reachable, ${result.knownExceptions.length} documented exception(s): ${result.knownExceptions.join(', ')})`,
    );
    if (result.orphanShared.length)
      console.error(
        `  [FAIL] orphaned shared protocols (unreachable from any entry-point agent): ${result.orphanShared.join(', ')}`,
      );
    console.log(result.clean ? 'clean' : 'gaps found');
  }

  process.exit(result.clean ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
