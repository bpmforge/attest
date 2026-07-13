// reconciliation-matrix.mjs — parses the docs/work/REQUIREMENT_RECONCILIATION.md
// matrix (T29.2, Template 11 in agents/shared/HANDOFF_TEMPLATES.md).
//
// Format is a plain markdown table, one row per story:
//   | Story | Title | Verdict | Evidence |
//   |-------|-------|---------|----------|
//   | US-01 | Checkout | DONE | tests/checkout.test.ts |
// Verdict must be exactly one of DONE/PARTIAL/OUTSTANDING (case-insensitive)
// in some column — column position isn't fixed so a project can add columns
// (e.g. a "Modules" column) without breaking the parser.

export const VERDICTS = ['DONE', 'PARTIAL', 'OUTSTANDING'];
const VERDICT_SET = new Set(VERDICTS);

function splitRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const cells = trimmed.split('|').map((c) => c.trim());
  // A well-formed "| a | b |" row splits into ['', 'a', 'b', ''] — drop the
  // leading/trailing empties from the outer pipes.
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

// Parses every table row into { id, verdict, cells }. `id` is the first
// cell; rows whose first cell has no digit are skipped (header row like
// "Story" / "ID", or stray prose that starts with a pipe).
export function parseReconciliationMatrix(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    const cells = splitRow(line);
    if (!cells || cells.length < 2 || isSeparatorRow(cells)) continue;
    const id = cells[0];
    if (!/\d/.test(id)) continue;
    const verdictCell = cells.find((c) => VERDICT_SET.has(c.toUpperCase()));
    rows.push({ id, verdict: verdictCell ? verdictCell.toUpperCase() : null, cells });
  }
  return rows;
}

// reconciliationGaps: cross-checks the matrix against the full known set of
// story ids (from docs/USER_STORIES.md via user-stories.mjs) — every story
// must appear with a DONE/PARTIAL verdict; OUTSTANDING or "in USER_STORIES.md
// but no row at all" are both gaps (Phase-5 cannot treat "never reconciled"
// as equivalent to "reconciled, in progress").
export function reconciliationGaps(markdown, storyIds) {
  const rows = parseReconciliationMatrix(markdown);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const gaps = [];
  for (const id of new Set(storyIds)) {
    const row = byId.get(id);
    if (!row) gaps.push({ id, reason: 'no row in the reconciliation matrix' });
    else if (!row.verdict) gaps.push({ id, reason: 'row has no DONE/PARTIAL/OUTSTANDING verdict' });
    else if (row.verdict === 'OUTSTANDING') gaps.push({ id, reason: 'verdict is OUTSTANDING' });
  }
  return gaps;
}
