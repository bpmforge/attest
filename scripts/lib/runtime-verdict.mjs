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

/**
 * Does this runtime report actually EVIDENCE a failure, or merely assert one?
 *
 * Grounded: a non-zero exit code, a TAP `not ok`, or a runner's failure summary
 * (`# fail 2`, `✖`, `FAILED`). Ungrounded: "I am not confident", "this may have
 * edge cases", or a report whose only negative note is that a command was
 * skipped — none of which is a failing command.
 */
export function isGroundedFailure(body) {
  const b = String(body || '');
  return /exit(ed)?\s*(code)?\s*[:=]?\s*[1-9]/i.test(b)
    || /\b(not ok|FAILED|failing|✖|✗)\b/.test(b);
}
