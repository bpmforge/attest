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

/**
 * P-A4 (OPT-08): classification is PATH + SEMANTIC-RISK first; the broad
 * regexes below are demoted to SCANNER-TIER hints. The old behavior recruited
 * a security expert off the bare word `validate` in a comment and a perf
 * expert off any `.map(` — measured at 4.8 expert sessions per coding attempt.
 *
 * Tiering:
 *  - pathRe: the file paths whose CHANGES define the risk surface. An expert
 *    is recruited only when the diff TOUCHES such a path (added/modified file
 *    headers), or when a HIGH-signal semantic pattern hits an ADDED line.
 *  - re (scanner tier): retained for cheap advisory scanning and board
 *    `reviews:` declarations — no longer sufficient alone to recruit.
 *  - highRe: narrow, high-precision semantic patterns that DO recruit even
 *    off-path (e.g. child_process exec, dangerouslySetInnerHTML) — but only
 *    when they appear on an ADDED line (+), never in context or comments-only
 *    diff hunks we cannot see; matching added lines keeps comments from
 *    UNCHANGED code out entirely.
 */
export const REVIEW_TRIGGERS = [
  {
    name: 'security',
    why: 'auth / input handling / secrets / shell-exec',
    pathRe: /(auth|login|session|token|credential|secret|crypto|acl|permission|middleware\/|security)/i,
    highRe:
      /^\+.*\b(child_process|execSync|eval\(|dangerouslySetInnerHTML|createCipher|pbkdf2|bcrypt|jwt\.(sign|verify)|req\.(body|query|params))/m,
    re: /\b(auth|login|logout|signin|token|jwt|session|cookie|password|passwd|secret|credential|api[_-]?key|cors|csrf|sanitiz|escape[A-Z]?|validate|req\.(body|query|params)|exec|execSync|spawn|eval|child_process|crypto|hash|bcrypt|permission|authoriz|role|acl|SELECT .*WHERE|innerHTML|dangerouslySetInnerHTML)\b/i, // scanner tier
  },
  {
    name: 'perf',
    why: 'DB queries or hot paths',
    pathRe: /(migrations?\/|\bdb\b|database|repositor|\bquer|store\/|dao\b|\borm\b|\bcache)/i,
    highRe: /^\+.*(SELECT .+ (FROM|WHERE)|createQueryBuilder|findMany\(|aggregate\(|\$queryRaw)/m,
    re: /\b(SELECT |INSERT |UPDATE |DELETE FROM|JOIN |findMany|findAll|aggregate|createQueryBuilder|knex|prisma|sequelize|mongoose|for \(|while \(|\.forEach\(|\.map\(|\.filter\(|\.reduce\(|Promise\.all|setInterval)\b/i, // scanner tier
  },
  {
    name: 'ux',
    why: 'UI components',
    pathRe: /(\.(tsx|jsx|vue|svelte|css|scss)$|\/components?\/|\/pages?\/|\/views?\/)/i,
    highRe: /^\+.*(aria-|role=)/m,
    re: /(\.(tsx|jsx|vue|svelte|css|scss)\b|\/components?\/|\/pages?\/|\/views?\/|aria-|role=)/i, // scanner tier
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

  // P-A4: recruit on TOUCHED RISK PATHS or a high-signal pattern on an ADDED
  // line — never on the scanner-tier regex alone. The diff's file headers
  // (+++ b/<path>) define what was touched; `+` lines define what was added.
  const touched = [...String(diff || '').matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
  for (const t of REVIEW_TRIGGERS) {
    const byPath = t.pathRe ? touched.some((f) => t.pathRe.test(f)) : false;
    const byHigh = t.highRe ? t.highRe.test(diff || '') : false;
    const byBoard = declared.includes(t.name);
    if (!byPath && !byHigh && !byBoard) continue;
    reviewers.push(t.name);
    reasons.push(
      `${t.name}(${byPath ? `touched risk path` : byHigh ? t.why : 'declared on the ticket'})`,
    );
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
