/**
 * compliance-stats.mjs — summarise rule-compliance runs (Group K4). Pure.
 * Rows: { rule, level, run, rate, steps, infra, traced }. A run counts only if not infra and traced.
 */
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
export const LEVELS = ["supportive", "neutral", "competing"];
const valid = (r) => !r.infra && r.traced;

export function summarize(rows, rules = {}) {
  const byRule = {};
  for (const id of [...new Set(rows.map((r) => r.rule))]) {
    const mine = rows.filter((r) => r.rule === id);
    const levels = {};
    for (const lv of LEVELS) {
      const v = mine.filter((r) => r.level === lv && valid(r));
      levels[lv] = { n: v.length, rate: mean(v.map((r) => r.rate)), fullyCompliant: v.filter((r) => r.rate === 1).length };
    }
    const threshold = rules[id]?.threshold ?? 0.8;
    const neutral = levels.neutral;
    byRule[id] = {
      levels, threshold,
      invalid: mine.filter((r) => !valid(r)).length,
      // The rule the model ignores when nobody asks is the one worth ENFORCING. Needs a real sample.
      recommendHook: neutral.n >= 3 && neutral.rate < threshold,
      pressureDrop: Number.isFinite(levels.supportive.rate) && Number.isFinite(levels.competing.rate) ? levels.supportive.rate - levels.competing.rate : NaN,
      verdict: mine.length && mine.filter((r) => !valid(r)).length / mine.length > 0.2 ? "INVALID" : neutral.n < 3 ? "INSUFFICIENT" : "OK",
    };
  }
  return byRule;
}
