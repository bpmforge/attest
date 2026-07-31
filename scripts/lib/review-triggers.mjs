// review-triggers.mjs — which reviewers a ticket's ACTUAL DIFF triggers.
//
// PARALLEL_WAVE_PROTOCOL Round 2 specifies TRIGGERS, not a static list:
//
//     code-reviewer: always
//     security: if auth or input handling touched
//     perf:     if DB queries or loops touched
//     ux:       if UI components touched
//
// The conductor took only `m.reviews` — a declaration made when the board was
// written, before any code existed — so the trigger conditions were never
// evaluated. A ticket that turned out to introduce auth handling got exactly
// one reviewer, and the run reported it as reviewed. That is the difference
// between "a human remembered to ask for a security review" and "code that
// touches auth cannot land without one", and only the second is a vetting
// system. Observed 2026-07-31: five tickets landed on code-reviewer alone.
//
// `m.reviews` is still honoured — union, not replacement — so an explicit
// request always runs even when nothing in the diff trips a pattern.
//
// Biased toward firing: a false positive costs one review session; a false
// negative ships unreviewed auth or unbounded-query code. Every trigger reports
// WHY it fired so an operator can audit the reasoning instead of trusting it.
//
// Lives here rather than in conductor.mjs because that file calls main() at
// import time, so it cannot be unit-tested without running the CLI.

export const REVIEW_TRIGGERS = [
  {
    name: 'security',
    why: 'auth / input handling / secrets / shell-exec',
    re: /\b(auth|login|logout|signin|token|jwt|session|cookie|password|passwd|secret|credential|api[_-]?key|cors|csrf|sanitiz|escape[A-Z]?|validate|req\.(body|query|params)|exec|execSync|spawn|eval|child_process|crypto|hash|bcrypt|permission|authoriz|role|acl|SELECT .*WHERE|innerHTML|dangerouslySetInnerHTML)\b/i,
  },
  {
    name: 'perf',
    why: 'DB queries or loops',
    re: /\b(SELECT |INSERT |UPDATE |DELETE FROM|JOIN |findMany|findAll|aggregate|createQueryBuilder|knex|prisma|sequelize|mongoose|for \(|while \(|\.forEach\(|\.map\(|\.filter\(|\.reduce\(|Promise\.all|setInterval)\b/i,
  },
  {
    name: 'ux',
    why: 'UI components',
    re: /(\.(tsx|jsx|vue|svelte|css|scss)\b|\/components?\/|\/pages?\/|\/views?\/|aria-|role=)/i,
  },
];

/**
 * @param {object} m       module ticket (uses m.reviews when present)
 * @param {string} diff    the ticket's diff against main
 * @param {object} known   map of reviewer-name -> agent, to drop unknown names
 * @returns {{reviewers: string[], reasons: string[]}}
 */
export function triggeredReviewers(m, diff, known = {}) {
  const reviewers = ['code-reviewer'];
  const declared = Array.isArray(m?.reviews) ? m.reviews : [];
  const reasons = [];

  for (const t of REVIEW_TRIGGERS) {
    const byDiff = t.re.test(diff || '');
    const byBoard = declared.includes(t.name);
    if (!byDiff && !byBoard) continue;
    reviewers.push(t.name);
    reasons.push(`${t.name}(${byDiff ? t.why : 'declared on the ticket'})`);
  }
  // Declared reviewers with no trigger rule of their own (e.g. 'test') still run.
  for (const d of declared) {
    if (reviewers.includes(d)) continue;
    if (Object.keys(known).length && !known[d]) continue; // unknown name — ignore
    reviewers.push(d);
    reasons.push(`${d}(declared on the ticket)`);
  }
  return { reviewers, reasons };
}
