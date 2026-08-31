// runtime-verdict.mjs — how round 3's PASS/FAIL is decided, model-agnostically.
//
// Round 3 asks a session to run the project's build/lint/test and end its
// report with "RUNTIME: PASS" or "RUNTIME: FAIL". That verdict gates the ticket
// BEFORE close() runs the ticket's own `verify` command deterministically from
// outside the session — so a purely subjective FAIL blocks work that the
// authoritative gate would have passed.
//
// That is not model-agnostic: the same code lands or does not depending on how
// conservative the model happens to be. Observed 2026-07-31 — one model family
// landed four tickets, another failed the same shape of module twice at this
// round while every review approved it.
//
// So a FAIL must be GROUNDED: the document has to show a non-zero exit or a
// recognisable test failure. An ungrounded FAIL defers to the same command
// close() will run. A grounded FAIL still fails and a genuinely failing verify
// still fails — the gate never gets weaker, only harder to trip on an opinion.
//
// Lives here rather than in conductor.mjs because that file calls main() at
// import time, so nothing in it can be unit-tested without running the CLI.

/** Matches the verdict line the round-3 prompt asks for, tolerantly. */
export const RUNTIME_PASS_RE = /runtime\s*(verdict)?\s*[:\-]?\s*\**\s*PASS/i;

/** "This project does not define that command" — absent tooling, not a failure. */
const MISSING_TOOLING_RE =
  /(missing script|command not found|: not found|\bENOENT\b|no such file or directory|is not recognized as an internal)/i;

/**
 * A real test/build failure, as opposed to a non-zero exit from a missing
 * command — or from a runner cheerfully reporting that nothing failed.
 *
 * A bare /\bFAILED\b/i was the first attempt and it is wrong in the most
 * embarrassing direction: it matches "0 failed", "no tests FAILED" and
 * "Tests: 0 failed, 5 passed". A CLEAN run whose verdict line says FAIL would
 * therefore be treated as evidenced and block the ticket — precisely the
 * unsubstantiated-FAIL case this predicate exists to catch. Every pattern below
 * requires a non-zero count or a per-failure marker.
 */
const REAL_FAILURE_RE = new RegExp([
  '\\bnot ok\\b',                                   // TAP failure line
  'AssertionError',
  '✖|✗',
  '#\\s*fail\\s+[1-9]',                             // node --test summary
  '\\b[1-9]\\d*\\s+(tests?\\s+)?fail(ed|ing)\\b',   // "2 failed", "3 tests failing"
  '^FAILED\\s',                                     // pytest per-test line
  '^\\s*FAIL\\s+\\S',                               // jest "FAIL src/x.test.js"
].join('|'), 'im');

/**
 * Does this runtime report actually EVIDENCE a failure, or merely assert one?
 *
 * Grounded: a TAP `not ok`, an AssertionError, a runner's failure summary, or a
 * non-zero exit that is not merely a missing command. Ungrounded: "I am not
 * confident", "this may have edge cases", or a non-zero exit whose only cause
 * is tooling this project never defined.
 */
export function isGroundedFailure(body) {
  const b = String(body || '');

  // A genuine test failure always grounds the verdict.
  if (REAL_FAILURE_RE.test(b)) return true;

  const nonZeroExit = /exit(ed)?\s*(code)?\s*[:=]?\s*[1-9]/i.test(b);
  if (!nonZeroExit) return false;

  // A non-zero exit whose ONLY cause is a command the project never defined is
  // absent tooling, not failing code. `npm run build` in a package with no
  // build script exits 1 with "Missing script: build" — which reads exactly
  // like a failure to a regex counting exit codes.
  //
  // This is not hypothetical: on 2026-07-31 a ticket was failed twice this way.
  // The agent's own report said "the project's declared test command passed all
  // five tests. The package does not define build, lint, or type-check
  // scripts" — correct code, passing tests, ticket refused, because three
  // missing npm scripts each exited 1. The prompt now tells agents a missing
  // command is SKIPPED; this makes the harness robust to the ones that still
  // report it, rather than trusting every model to have read that instruction.
  if (MISSING_TOOLING_RE.test(b)) return false;

  return true;
}

/**
 * Pull the agent's own explanation of a failure out of its report.
 *
 * A bare "RUNTIME: FAIL" in the log tells an operator that something went
 * wrong and nothing about what — and the document holding the detail lives in
 * a worktree that is deleted moments later. So the prompt asks for a
 * "## Why it failed" section and this lifts it into the receipts, the retry
 * prompt and the ticket's plan.json comment, where it survives.
 *
 * Falls back progressively rather than returning nothing: the explicit
 * section, else the first line that looks like a failing command or assertion,
 * else the lines around the verdict. An agent that ignores the section heading
 * still gets its reasoning captured.
 */
export function extractFailureReason(body, { maxLen = 600 } = {}) {
  const b = String(body || '');
  if (!b.trim()) return null;

  // 1. The section the prompt asks for. Extracted line-wise rather than with a
  // single regex: the obvious pattern wants a "to the next heading OR end of
  // input" terminator, and JS has no \Z — writing one silently matches a
  // literal 'Z' and the section is never found.
  const lines = b.split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s*why\s+it\s+failed\s*$/i.test(l.trim()));
  if (start >= 0) {
    const body = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (/^#{1,6}\s/.test(lines[i])) break;   // next heading ends the section
      body.push(lines[i]);
    }
    if (body.join(' ').trim()) return squash(body.join(' '), maxLen);
  }

  // 2. Otherwise the strongest evidence line we can find.
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  const evidence = trimmed.filter((l) =>
    /exit(ed)?\s*(code)?\s*[:=]?\s*[1-9]/i.test(l) || /\b(not ok|FAILED|✖|✗|AssertionError|Error:)\b/.test(l));
  if (evidence.length) return squash(evidence.slice(0, 6).join(' | '), maxLen);

  // 3. Last resort: whatever the agent wrote immediately before its verdict.
  const vIdx = trimmed.findIndex((l) => /(runtime|verdict)\s*[:\-]?\s*\**\s*(FAIL|CHANGES REQUESTED)/i.test(l));
  if (vIdx > 0) return squash(trimmed.slice(Math.max(0, vIdx - 4), vIdx).join(' | '), maxLen);
  return null;
}

function squash(s, maxLen) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

// ── P-A9: five-state runtime verdict contract ────────────────────────────────
//
// The binary PASS/FAIL contract collapsed three different situations into one
// FAIL bucket: genuine candidate failures, pre-existing baseline breakage, and
// infrastructure outages. Failure accounting (program law L6) has to budget
// those separately, so the contract is now five structured states:
//
//   PASS                        — every command exited zero.
//   FAIL_CANDIDATE              — the candidate's own change is (or must be
//                                 presumed) broken. Legacy FAIL maps here.
//   BLOCKED_BASELINE_CONFIRMED  — the same failure reproduced on the exact base
//                                 commit: requires a quoted base SHA AND the
//                                 same failing output shown for both runs.
//   BLOCKED_BASELINE_SUSPECTED  — a shown failure the agent believes pre-dates
//                                 the work, without base-commit reproduction.
//                                 A CONFIRMED claim missing its evidence
//                                 degrades here, never stands as confirmed.
//   BLOCKED_INFRASTRUCTURE      — the non-zero exits are attributable to the
//                                 environment (missing tooling, network,
//                                 resources), not to code under test.
//
// HARD RULE — prose never overrides exit codes: a document that claims PASS
// while its own quoted output evidences a real non-zero verify exit is
// FAIL_CANDIDATE. Likewise a BLOCKED_* label cannot relabel a quoted genuine
// test/build failure as somebody else's problem without the evidence that
// state requires (base reproduction for BASELINE_CONFIRMED, an
// infrastructure-shaped cause for INFRASTRUCTURE).
//
// Backward compatible: existing documents ending "RUNTIME: PASS" / "RUNTIME:
// FAIL" classify exactly as before (PASS / FAIL_CANDIDATE), and the existing
// grounded-FAIL rule is preserved — an ungrounded non-PASS classification
// returns grounded:false so the caller keeps deferring to the ticket's own
// verify command (conductor.mjs round 3), same as an ungrounded FAIL today.

export const VERDICT_STATES = [
  'PASS',
  'FAIL_CANDIDATE',
  'BLOCKED_BASELINE_CONFIRMED',
  'BLOCKED_BASELINE_SUSPECTED',
  'BLOCKED_INFRASTRUCTURE',
];

// The verdict line, tolerant like RUNTIME_PASS_RE. FAIL_CANDIDATE before FAIL
// so alternation can't truncate the longer token; legacy FAIL maps to
// FAIL_CANDIDATE in classifyRuntimeVerdict().
const VERDICT_LINE_RE =
  /runtime\s*(?:verdict)?\s*[:\-]?\s*\**\s*(PASS|FAIL_CANDIDATE|FAIL|BLOCKED_BASELINE_CONFIRMED|BLOCKED_BASELINE_SUSPECTED|BLOCKED_INFRASTRUCTURE)\b/i;

// Infrastructure-shaped causes for a non-zero exit, beyond the missing-tooling
// set isGroundedFailure() already discounts: network, DNS, disk, OOM, kills.
const INFRA_CAUSE_RE =
  /(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EADDRINUSE|ENOSPC|out of memory|OOM[- ]?kill|killed \(signal|npm ERR! network|registry (?:timeout|unreachable)|could not resolve host|connection timed out)/i;

// A per-line failure matcher (REAL_FAILURE_RE's shapes, applied to one trimmed
// line) used to find the failing signature quoted for the candidate run and
// again for the base-commit run.
const FAILURE_LINE_RE = new RegExp([
  '\\bnot ok\\b',
  'AssertionError',
  '✖|✗',
  '#\\s*fail\\s+[1-9]',
  '\\b[1-9]\\d*\\s+(tests?\\s+)?fail(ed|ing)\\b',
  '^FAILED\\s',
  '^FAIL\\s+\\S',
].join('|'), 'i');

// Something readable as the base/baseline commit: a labeled SHA. "base commit
// abc1234", "baseline: 5ca73de...", "reproduced on main @ deadbeef".
const BASE_SHA_RE = /\b(?:base(?:line)?(?:\s+commit)?|merge-base|main|master)\b[^\n]{0,40}?\b[0-9a-f]{7,40}\b/i;

/**
 * BLOCKED_BASELINE_CONFIRMED's evidence bar: the document names the exact base
 * commit (a SHA, labeled as base/baseline/main) AND quotes the SAME failing
 * output twice — once for the candidate run, once for the base-commit
 * reproduction. One quoted failure plus the ASSERTION "this also fails on
 * main" is suspicion, not confirmation.
 */
export function hasBaselineReproduction(body) {
  const b = String(body || '');
  if (!BASE_SHA_RE.test(b)) return false;
  const counts = new Map();
  for (const raw of b.split('\n')) {
    const l = raw.trim();
    if (!l || !FAILURE_LINE_RE.test(l)) continue;
    const key = l.replace(/\s+/g, ' ');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].some((c) => c >= 2);
}

/**
 * Classify a round-3 runtime report into one of the five VERDICT_STATES.
 *
 * Returns { state, claimed, grounded, reason }:
 *   state    — one of VERDICT_STATES (never the raw claim).
 *   claimed  — the normalized token the document itself claimed, or null when
 *              no verdict line was found (FAIL normalizes to FAIL_CANDIDATE).
 *   grounded — whether evidence in the document backs a non-PASS state. Per
 *              the existing grounded-FAIL rule, callers should defer an
 *              ungrounded (grounded:false) non-PASS state to the ticket's own
 *              verify command rather than trusting the prose.
 *   reason   — extractFailureReason() for non-PASS states, else null.
 */
export function classifyRuntimeVerdict(body) {
  const b = String(body || '');
  const m = b.match(VERDICT_LINE_RE);
  let claimed = m ? m[1].toUpperCase() : null;
  if (claimed === 'FAIL') claimed = 'FAIL_CANDIDATE'; // backward compat
  const groundedFailure = isGroundedFailure(b);
  const codeFailure = REAL_FAILURE_RE.test(b);
  const nonZeroExit = /exit(ed)?\s*(code)?\s*[:=]?\s*[1-9]/i.test(b);
  const infraCause = nonZeroExit && (MISSING_TOOLING_RE.test(b) || INFRA_CAUSE_RE.test(b));

  const out = (state, grounded) => ({
    state,
    claimed,
    grounded,
    reason: state === 'PASS' ? null : extractFailureReason(b),
  });

  if (claimed === 'PASS') {
    // HARD RULE: a PASS claim over evidenced non-zero exits is FAIL_CANDIDATE.
    if (groundedFailure) return out('FAIL_CANDIDATE', true);
    return out('PASS', true);
  }

  if (claimed === 'BLOCKED_INFRASTRUCTURE') {
    // A quoted genuine test/build failure cannot be relabeled infrastructure.
    if (codeFailure) return out('FAIL_CANDIDATE', true);
    if (infraCause) return out('BLOCKED_INFRASTRUCTURE', true);
    // No evidence either way — resolves per the grounded-FAIL rules: an
    // ungrounded non-PASS defers to the verify command close() runs.
    return out('FAIL_CANDIDATE', false);
  }

  if (claimed === 'BLOCKED_BASELINE_CONFIRMED' || claimed === 'BLOCKED_BASELINE_SUSPECTED') {
    if (!groundedFailure) return out('FAIL_CANDIDATE', false); // no shown failure at all
    if (claimed === 'BLOCKED_BASELINE_CONFIRMED' && hasBaselineReproduction(b))
      return out('BLOCKED_BASELINE_CONFIRMED', true);
    // CONFIRMED without base-commit reproduction degrades; SUSPECTED stays.
    return out('BLOCKED_BASELINE_SUSPECTED', true);
  }

  // FAIL/FAIL_CANDIDATE claims, unknown tokens, and documents with no verdict
  // line all land here: FAIL_CANDIDATE, grounded per the existing rules.
  return out('FAIL_CANDIDATE', groundedFailure);
}
