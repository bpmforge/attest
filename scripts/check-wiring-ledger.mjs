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
//      chain, it runs unconditionally) OR via a documented PROSE-TRIGGER
//      (its filename appears literally somewhere in the live agent
//      instruction corpus, agents/**/*.md -- an LLM agent reading that file
//      is told to run it, even though no script enforces the call). Neither
//      = orphaned: shipped, but nothing (script or agent) ever invokes it.
//
//   2. Shared protocols (agents/shared/*.md): reachable via a REFERENCE
//      CHAIN from a top-level agent (agents/*.md, treated as entry points --
//      each is directly loadable). A shared file counted reachable if ANY
//      reachable file (root or already-reachable shared file) mentions its
//      basename -- fixpoint iteration, so a two-hop chain (top-level agent
//      -> MODEL_ADAPTER.md -> HANDOFF_QUICK_REF.md, conditional on model
//      tier) counts correctly instead of needing every include listed at
//      every entry point directly.
//
// docs/**/*.md (reference documentation a human reads) does NOT count as a
// live wiring path for either check -- only agents/**/*.md (the corpus an
// LLM session actually loads) does. A validator or protocol documented in
// docs/FEATURES.md's catalog but never mentioned inside agents/ is still an
// orphan: documented is not the same as wired.
//
// Usage: node scripts/check-wiring-ledger.mjs [--json] [project-root]

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

export function runWiringLedger(root) {
  const VALIDATORS_DIR = join(root, 'scripts/validators');
  const AGENTS_DIR = join(root, 'agents');
  const SHARED_DIR = join(root, 'agents/shared');

  // -- collect the live agent-instruction corpus (roots + shared) ----------
  const rootFiles = existsSync(AGENTS_DIR)
    ? readdirSync(AGENTS_DIR, { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.endsWith('.md'))
        .map((d) => join(AGENTS_DIR, d.name))
    : [];
  const sharedFiles = existsSync(SHARED_DIR)
    ? readdirSync(SHARED_DIR, { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.endsWith('.md'))
        .map((d) => join(SHARED_DIR, d.name))
    : [];
  const allAgentFiles = [...rootFiles, ...sharedFiles];
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

  const validatorResults = validatorNames.map((name) => {
    const pattern = new RegExp(name.replace(/[.]/g, '\\.'));
    const chained = pattern.test(chainedText);
    const inNpmTest = pattern.test(npmTestText);
    const prose = pattern.test(corpusText);
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
  const sharedBasenames = sharedFiles.map((f) =>
    basename(f).replace(/\.md$/, ''),
  );
  const reachable = new Set(rootFiles); // top-level agents are entry points
  let changed = true;
  while (changed) {
    changed = false;
    for (const sharedFile of sharedFiles) {
      if (reachable.has(sharedFile)) continue;
      const targetName = basename(sharedFile).replace(/\.md$/, '');
      const targetPattern = new RegExp(`\\b${targetName}\\b`);
      for (const candidate of reachable) {
        if (candidate === sharedFile) continue;
        const text = contentByFile.get(candidate) ?? '';
        if (targetPattern.test(text)) {
          reachable.add(sharedFile);
          changed = true;
          break;
        }
      }
    }
  }
  const orphanShared = sharedFiles
    .filter((f) => !reachable.has(f))
    .map((f) => basename(f));

  return {
    validatorsChecked: validatorNames.length,
    orphanValidators: orphanValidators.map((r) => r.name),
    sharedChecked: sharedBasenames.length,
    orphanShared,
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
        `  [FAIL] orphaned validators (no chain, no npm-test reference, no prose-trigger): ${result.orphanValidators.join(', ')}`,
      );
    console.log(
      `shared protocols checked: ${result.sharedChecked} (${result.sharedChecked - result.orphanShared.length} reachable)`,
    );
    if (result.orphanShared.length)
      console.error(
        `  [FAIL] orphaned shared protocols (unreachable from any top-level agent): ${result.orphanShared.join(', ')}`,
      );
    console.log(result.clean ? 'clean' : 'gaps found');
  }

  process.exit(result.clean ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
