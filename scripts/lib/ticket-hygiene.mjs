// ticket-hygiene.mjs — plan.json PROCESS-hygiene audit (T26.2).
//
// Distinct from tickets-graph.mjs's validatePlan()/writeScopeCollisions()
// (structural graph validity: schema shape, DAG cycles, orphan node refs,
// write-scope collisions among ACTIVE modules — "is this plan.json shaped
// correctly", enforced by validate-tickets.sh and claim()'s hygieneCheck()).
// This checks whether the lifecycle was actually FOLLOWED — the axis the
// 2026-07-07 incident broke: a HANDOFF self-asserted "done" with no real
// claim/start/close/accept trail and no evidence a gate ever ran.
//
// Five checks, one gap category each (a module can trip more than one):
//   incomplete-evidence       — a 'done' module missing manifest/evidence/history
//   wip-violation             — one owner holding >1 claimed/in_progress module
//   stale-claim               — claimed_at older than STALE_DAYS, still open
//   tracker-drift             — TICKETS.md / STATE.md's rendered status
//                                disagrees with plan.json's live status
//   scope-violation /
//   evidence-commit-not-found — an evidence commit touched a file outside the
//                                module's write_scope, or the cited commit
//                                doesn't exist in this repo's git history —
//                                the audit↔code cross-check
//
// CLI: node ticket-hygiene.mjs check <plan.json> <root> [ticketsMd] [stateMd]
// Prints one "[x] <category>\t<detail>" line per gap on stdout (the same
// "[x]"-substring convention validate-tickets.sh's node helper uses, so the
// calling validator can filter stray stderr noise the same way). Exit 0
// clean / 1 gaps found.

import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';

export const STALE_DAYS = 7;

// Same trailing-wildcard-only glob convention as tickets-graph.mjs's
// normScope()/scopesOverlap() — deliberately not a full minimatch
// implementation, so a write_scope glob and the files an evidence commit
// touched are judged by the identical rule the ticket schema already uses.
function normScope(g) {
  return String(g).replace(/\/\*\*?$/, '').replace(/\/\*$/, '').replace(/\*+$/, '').replace(/\/$/, '');
}

function fileInScope(file, scopes) {
  return (scopes || []).some((g) => {
    const n = normScope(g);
    return file === n || file.startsWith(`${n}/`);
  });
}

// -- check 1: a 'done' module missing manifest/evidence/history -------------
// Re-derives from the persisted plan.json fields themselves rather than
// trusting accept() was actually used — catches a hand-edited/corrupted
// 'done' status the same way the 2026-07-07 incident bypassed the CLI.
export function checkCompleteEvidence(modules, planDir) {
  const gaps = [];
  for (const m of modules) {
    if (m.status !== 'done') continue;
    if (!m.manifest || !existsSync(resolve(planDir, m.manifest)))
      gaps.push(['incomplete-evidence', `${m.id}: done but manifest missing/not on disk ('${m.manifest ?? '(none)'}')`]);
    if (!m.evidence || !m.evidence.branch || !Array.isArray(m.evidence.commits) || m.evidence.commits.length === 0)
      gaps.push(['incomplete-evidence', `${m.id}: done but evidence.branch/commits not recorded`]);
    if (!Array.isArray(m.history) || m.history.length === 0)
      gaps.push(['incomplete-evidence', `${m.id}: done but history[] is empty — no lifecycle audit trail`]);
  }
  return gaps;
}

// -- check 2: WIP=1 -- one owner shouldn't hold >1 open ticket at once ------
// claim() already refuses this going forward (T26.1); this re-derives it
// from the plan's CURRENT content so a hand-edited plan.json (or a plan from
// before claim()'s WIP=1 check existed) is still caught by the audit.
export function checkOwnerWip(modules) {
  const open = new Map();
  for (const m of modules) {
    if (m.status !== 'claimed' && m.status !== 'in_progress') continue;
    if (m.owner == null) continue;
    const key = String(m.owner).trim().toLowerCase();
    if (!open.has(key)) open.set(key, []);
    open.get(key).push(m);
  }
  const gaps = [];
  for (const mods of open.values()) {
    if (mods.length > 1)
      gaps.push([
        'wip-violation',
        `owner '${mods[0].owner}' holds ${mods.length} open tickets at once (WIP=1 violation): ${mods.map((m) => m.id).join(', ')}`,
      ]);
  }
  return gaps;
}

// -- check 3: claimed_at older than staleDays while still open --------------
export function checkStaleClaims(modules, nowMs, staleDays = STALE_DAYS) {
  const gaps = [];
  for (const m of modules) {
    if (m.status !== 'claimed' && m.status !== 'in_progress') continue;
    if (!m.claimed_at) continue;
    const claimedMs = Date.parse(m.claimed_at);
    if (Number.isNaN(claimedMs)) continue;
    const ageDays = (nowMs - claimedMs) / 86400000;
    if (ageDays > staleDays)
      gaps.push([
        'stale-claim',
        `${m.id}: claimed by '${m.owner}' ${ageDays.toFixed(1)}d ago (> ${staleDays}d), status still '${m.status}' — release or check in`,
      ]);
  }
  return gaps;
}

// Same tolower()-based section extraction as validate-state-drift.sh's
// done_body awk — done here in real JS regex, not awk, so there's no
// portability trap to inherit (T22.19's \b-in-awk lesson doesn't apply: this
// never touches system awk).
function extractSection(md, headingLower) {
  const lines = md.split('\n');
  let inSection = false;
  const out = [];
  for (const line of lines) {
    const l = line.toLowerCase();
    if (/^#+\s/.test(l)) {
      if (inSection) break;
      inSection = new RegExp(`^#+\\s+${headingLower}\\b`).test(l);
      continue;
    }
    if (inSection) out.push(line);
  }
  return out.join('\n').trim();
}

// -- check 4: TICKETS.md / STATE.md rendered status vs plan.json's live status
export function checkTrackerDrift(modules, ticketsMdText, stateMdText) {
  const gaps = [];
  const byId = Object.fromEntries(modules.map((m) => [m.id, m]));

  if (ticketsMdText) {
    // gen-tickets-board.mjs's "Full table": | id | title | status | owner | blocked-by | write-scope |
    for (const line of ticketsMdText.split('\n')) {
      const cells = line.split('|').map((c) => c.trim());
      // Strip the leading/trailing empty cells a "| a | b |"-style row produces.
      if (cells.length > 1 && cells[0] === '') cells.shift();
      if (cells.length > 1 && cells[cells.length - 1] === '') cells.pop();
      if (cells.length < 3) continue;
      const [id, , status] = cells;
      const m = byId[id];
      if (!m || !status) continue;
      if (status !== m.status)
        gaps.push(['tracker-drift', `TICKETS.md renders ${id} as '${status}' but plan.json has '${m.status}' — regenerate the board (gen-tickets-board.mjs)`]);
    }
  }

  if (stateMdText) {
    const doneBody = extractSection(stateMdText, 'done');
    if (doneBody) {
      // Longest-id-first so "T1" can't shadow-match inside "T11.4".
      const idsByLenDesc = modules.map((m) => m.id).sort((a, b) => b.length - a.length);
      for (const id of idsByLenDesc) {
        const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${esc}\\b`);
        if (re.test(doneBody) && byId[id].status !== 'done')
          gaps.push(['tracker-drift', `STATE.md's Done section claims '${id}' done but plan.json has status '${byId[id].status}'`]);
      }
    }
  }
  return gaps;
}

// -- check 5: evidence commits must exist and stay inside write_scope -------
export function checkEvidenceScope(modules, root) {
  const gaps = [];
  let isGitRepo = true;
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' });
  } catch {
    isGitRepo = false;
  }
  if (!isGitRepo) return gaps;

  for (const m of modules) {
    const commits = m.evidence?.commits;
    if (!Array.isArray(commits) || commits.length === 0) continue;
    for (const c of commits) {
      let out;
      try {
        out = execFileSync('git', ['-C', root, 'show', '--name-only', '--pretty=format:', c], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        gaps.push([
          'evidence-commit-not-found',
          `${m.id}: evidence cites commit '${c}' which doesn't exist in this repo's history — unverifiable/fabricated evidence`,
        ]);
        continue;
      }
      const files = out.split('\n').map((f) => f.trim()).filter(Boolean);
      for (const f of files) {
        if (!fileInScope(f, m.write_scope))
          gaps.push(['scope-violation', `${m.id}: commit ${c} touches '${f}', outside write_scope [${(m.write_scope || []).join(', ')}]`]);
      }
    }
  }
  return gaps;
}

export function runAllChecks(plan, { planDir, root, ticketsMdText = null, stateMdText = null, nowMs = Date.now() }) {
  const modules = Array.isArray(plan.modules) ? plan.modules : [];
  return [
    ...checkCompleteEvidence(modules, planDir),
    ...checkOwnerWip(modules),
    ...checkStaleClaims(modules, nowMs),
    ...checkTrackerDrift(modules, ticketsMdText, stateMdText),
    ...checkEvidenceScope(modules, root),
  ];
}

// -- CLI ----------------------------------------------------------------
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [cmd, planPath, root, ticketsMdPath, stateMdPath] = process.argv.slice(2);
  if (cmd !== 'check' || !planPath || !root) {
    console.error('usage: ticket-hygiene.mjs check <plan.json> <root> [ticketsMd] [stateMd]');
    process.exit(2);
  }
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const planDir = dirname(resolve(planPath));
  const rootAbs = resolve(root);
  const tPath = ticketsMdPath || resolve(rootAbs, 'docs/work/TICKETS.md');
  const sPath = stateMdPath || resolve(rootAbs, 'docs/work/STATE.md');
  const ticketsMdText = existsSync(tPath) ? readFileSync(tPath, 'utf8') : null;
  const stateMdText = existsSync(sPath) ? readFileSync(sPath, 'utf8') : null;
  const gaps = runAllChecks(plan, { planDir, root: rootAbs, ticketsMdText, stateMdText });
  for (const [cat, detail] of gaps) console.log(`[x] ${cat}\t${detail}`);
  process.exit(gaps.length ? 1 : 0);
}
