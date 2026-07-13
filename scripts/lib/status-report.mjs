// status-report.mjs — generated-project status derivation (T29.3, H7/C-1).
//
// Root cause this closes: generated project status artifacts (a child
// project's STATUS.md) were hand-written, so a phase could be painted
// "done"/green purely off task closure (every module ticket `done`) while
// the real requirement layer (stories[], T29.2) was still open — the same
// task-closure-standing-in-for-requirement-closure defect T29.2 closed for
// the phase-4->5 GATE, now closed for the human-facing STATUS artifact too.
// This module is pure/testable; scripts/gen-status-report.mjs is the CLI
// that reads plan.json/USER_STORIES.md and writes docs/work/STATUS.md.
//
// Two layers, both label-math-shown:
//   - tasks   -- module ticket closure (plan.modules[].status === 'done')
//               == "platform / foundation built"
//   - stories -- requirement closure (tickets-graph.mjs's requirementClosure(),
//               T29.2) == "features complete"
// A phase is painted COMPLETE only when BOTH are 100% -- 100% tasks with any
// open story renders BUILT-NOT-DONE, never green (the ticket's own
// acceptance fixture: tasks=100%/stories=50% must render half-done).
//
// Freshness (staleness): an artifact is stale when its embedded numbers
// (a) mismatch a live recompute against the same plan.json, or (b) predate
// the plan's own last work event (the latest history[]/claimed_at
// timestamp across all modules) -- "flagged stale by steward" per the
// ticket text; see checkStatusFreshness().

import { requirementClosure } from './tickets-graph.mjs';

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Task (module) closure -- the "platform / foundation built" layer.
export function taskClosure(plan) {
  const modules = plan.modules || [];
  const total = modules.length;
  const done = modules.filter((m) => m.status === 'done').length;
  const percent = total === 0 ? 100 : round1((done / total) * 100);
  return { done, total, percent };
}

// Latest work event recorded anywhere in the plan's module layer -- the
// append-only `history[]` log (T26.1) plus `claimed_at`, both machine-
// managed fields per docs/TICKET_SCHEMA.md, so this reads real transition
// timestamps rather than requiring a new field. null when nothing has ever
// happened (a freshly-scaffolded plan).
export function lastWorkEvent(plan) {
  let latest = null;
  for (const m of plan.modules || []) {
    for (const h of m.history || []) {
      if (h && h.ts && (!latest || h.ts > latest)) latest = h.ts;
    }
    if (m.claimed_at && (!latest || m.claimed_at > latest)) latest = m.claimed_at;
  }
  return latest;
}

export const PHASES = ['complete', 'built-not-done', 'in-progress'];

// computeStatusReport: the single source of truth both the generator and the
// freshness checker call -- "recompute live" and "what was embedded" must be
// the exact same function, or a drift between them would be a false stale/
// fresh signal rather than a real one.
//
// storyIds absent/empty means the requirement layer hasn't been adopted
// (same posture as T29.2's validators): stories grade as a trivial 100%/0
// total rather than failing, so a project that never wrote
// docs/USER_STORIES.md still gets a task-closure-only status, not a broken
// one.
export function computeStatusReport(plan, storyIds = []) {
  const tasks = taskClosure(plan);
  const hasStories = Array.isArray(storyIds) && storyIds.length > 0;

  let stories = { done: 0, total: 0, percent: 100, open: [] };
  if (hasStories) {
    const { stories: rows, closedCount } = requirementClosure(plan, storyIds);
    stories = {
      done: closedCount,
      total: rows.length,
      percent: rows.length === 0 ? 100 : round1((closedCount / rows.length) * 100),
      open: rows.filter((r) => r.status === 'open').map((r) => r.id).sort(),
    };
  }

  // Never green with open stories: COMPLETE requires both layers at 100%.
  let phase;
  if (tasks.percent === 100 && stories.percent === 100) phase = 'complete';
  else if (tasks.percent === 100) phase = 'built-not-done';
  else phase = 'in-progress';

  return { tasks, stories, hasStories, phase, lastWorkEvent: lastWorkEvent(plan) };
}

const PHASE_LABEL = {
  complete: '✅ COMPLETE',
  'built-not-done': '🟡 BUILT — FEATURES INCOMPLETE',
  'in-progress': '🔴 IN PROGRESS',
};

// Machine-readable meta embedded as an HTML comment so checkStatusFreshness()
// can re-derive "what was recorded" without re-parsing the rendered prose --
// the label-math text is for humans, this blob is for the freshness check.
function metaBlock(report, { planPath, generatedAt }) {
  const meta = {
    generatedAt,
    planPath,
    phase: report.phase,
    hasStories: report.hasStories,
    tasksDone: report.tasks.done,
    tasksTotal: report.tasks.total,
    tasksPercent: report.tasks.percent,
    storiesDone: report.stories.done,
    storiesTotal: report.stories.total,
    storiesPercent: report.stories.percent,
    openStories: [...report.stories.open].sort(),
    planLastWorkEvent: report.lastWorkEvent,
  };
  return `<!-- STATUS_REPORT_META ${JSON.stringify(meta)} -->`;
}

export function parseStatusMeta(markdown) {
  const m = /<!-- STATUS_REPORT_META (.*?) -->/s.exec(markdown || '');
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

export function renderStatusMarkdown(report, { planPath, generatedAt }) {
  const { tasks, stories, hasStories, phase } = report;
  const tasksLine = `${tasks.done}/${tasks.total} task${tasks.total === 1 ? '' : 's'} done (${tasks.percent}%)`;
  const storiesLine = hasStories
    ? `${stories.done}/${stories.total} stor${stories.total === 1 ? 'y' : 'ies'} closed (${stories.percent}%)`
    : 'requirement layer not adopted (no module declares stories[]) — grading on task closure only';
  const openLines = stories.open.length
    ? stories.open.map((id) => `- ${id} — open`).join('\n')
    : '_(none)_';

  return `# Status

> Derived from \`${planPath}\` by \`scripts/gen-status-report.mjs\`. Do not hand-edit -- edit the plan and regenerate.

${metaBlock(report, { planPath, generatedAt })}

Generated: ${generatedAt}

## Overall: ${PHASE_LABEL[phase]}

A phase is painted complete only when BOTH the task layer and the requirement
(story) layer are fully closed. 100% tasks with any open story renders
**${PHASE_LABEL['built-not-done']}** -- never green.

## Platform / Foundation Built (task layer)

${tasksLine}

## Features Complete (requirement / story layer)

${storiesLine}

Open stories:
${openLines}
`;
}

// checkStatusFreshness: stale iff (a) the artifact carries no parseable meta
// at all, (b) a live recompute against `plan`/`storyIds` disagrees with the
// embedded numbers, or (c) the plan has a work event after `generatedAt`.
// Deliberately takes the *rendered markdown* (not a pre-parsed report) so a
// caller (the CLI, the validator, a steward pass) only ever needs the actual
// on-disk artifact plus the live plan -- the same contract `--check` uses.
export function checkStatusFreshness(statusMarkdown, plan, storyIds = []) {
  const meta = parseStatusMeta(statusMarkdown);
  if (!meta) {
    return { stale: true, reasons: ['no embedded STATUS_REPORT_META found in the artifact -- cannot verify freshness, treat as stale'] };
  }

  const live = computeStatusReport(plan, storyIds);
  const reasons = [];

  if (live.tasks.done !== meta.tasksDone || live.tasks.total !== meta.tasksTotal || live.tasks.percent !== meta.tasksPercent) {
    reasons.push(`task numbers mismatch a live query: recorded ${meta.tasksDone}/${meta.tasksTotal} (${meta.tasksPercent}%), live ${live.tasks.done}/${live.tasks.total} (${live.tasks.percent}%)`);
  }
  if (live.stories.done !== meta.storiesDone || live.stories.total !== meta.storiesTotal || live.stories.percent !== meta.storiesPercent) {
    reasons.push(`story numbers mismatch a live query: recorded ${meta.storiesDone}/${meta.storiesTotal} (${meta.storiesPercent}%), live ${live.stories.done}/${live.stories.total} (${live.stories.percent}%)`);
  }
  const liveOpen = [...live.stories.open].sort();
  const recordedOpen = [...(meta.openStories || [])].sort();
  if (JSON.stringify(liveOpen) !== JSON.stringify(recordedOpen)) {
    reasons.push(`open-story set mismatches a live query: recorded [${recordedOpen.join(', ')}], live [${liveOpen.join(', ')}]`);
  }
  if (live.lastWorkEvent && meta.generatedAt && live.lastWorkEvent > meta.generatedAt) {
    reasons.push(`plan has a work event (${live.lastWorkEvent}) after this artifact was generated (${meta.generatedAt}) -- numbers are older than the last work event`);
  }

  return { stale: reasons.length > 0, reasons };
}
