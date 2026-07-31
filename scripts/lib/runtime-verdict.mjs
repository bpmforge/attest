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
