#!/usr/bin/env node
// tracker-link-sweep.mjs -- idempotent phase->story linking for an external
// tracker snapshot (T29.6, M29 field lesson H5/A-6.2).
//
// The field lesson: the phase->story structural link was RETROFITTED --
// 150+ links created by a one-off script mid-project, after the fact. The
// fix is to make linking continuous instead of a one-time rescue: run this
// sweep any session (or wire it into whatever creates new story items) and
// it links every unlinked story to its phase by matching a declared label
// convention (default: a `phase:<phaseId>` label on the story), then does
// nothing on a re-run against already-linked items -- true idempotence, not
// "safe to re-run because it happens to no-op today."
//
// This is a reference implementation over the normalized snapshot this
// module's sibling (tracker-model.mjs) reads -- a real external tracker
// (Jira/Linear/GitHub Projects/...) needs its own adapter to pull/push
// items; this script is the linking ALGORITHM a project's adapter should
// call, not a live API client.
//
// CLI: node tracker-link-sweep.mjs <snapshot.json> [--label-prefix phase:] [--write]
//   Without --write: reports what WOULD change (dry-run, safe default).
//   With --write: rewrites the snapshot file in place.
// Exit 0 always (a sweep finding nothing to link is success, not a gap --
// validate-tracker-integrity.sh is the gate that fails on an unlinked story).

// sweepLinks: pure function. items with type 'story', no parentId, and a
// label `${labelPrefix}<phaseId>` get parentId = <phaseId> when a phase item
// with that id exists in the same snapshot. Already-linked stories and
// stories with no matching label are left untouched (untouched-and-still-
// unlinked is exactly what the validator's unlinked-story check surfaces).
export function sweepLinks(items, labelPrefix = 'phase:') {
  const byId = new Map(items.filter((it) => it && it.id != null).map((it) => [it.id, it]));
  let linked = 0;
  const next = items.map((item) => {
    if (!item || item.type !== 'story' || item.parentId || item.stray === true) return item;
    const labels = Array.isArray(item.labels) ? item.labels : [];
    const phaseLabel = labels.find((l) => typeof l === 'string' && l.startsWith(labelPrefix));
    if (!phaseLabel) return item;
    const phaseId = phaseLabel.slice(labelPrefix.length);
    if (!byId.has(phaseId)) return item;
    linked++;
    return { ...item, parentId: phaseId };
  });
  return { items: next, linked };
}

const USAGE = 'usage: tracker-link-sweep.mjs <snapshot.json> [--label-prefix phase:] [--write]';

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const fs = await import('node:fs');
  const args = process.argv.slice(2);
  const snapshotPath = args.find((a) => !a.startsWith('--'));
  const write = args.includes('--write');
  const prefixFlagIdx = args.indexOf('--label-prefix');
  const labelPrefix = prefixFlagIdx >= 0 ? args[prefixFlagIdx + 1] : 'phase:';

  if (!snapshotPath) { console.error(USAGE); process.exit(2); }
  if (!fs.existsSync(snapshotPath)) { console.error(`snapshot not found: ${snapshotPath}`); process.exit(2); }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const { items: next, linked } = sweepLinks(items, labelPrefix);

  if (linked === 0) {
    console.log('sweep: 0 stragglers linked -- already idempotent (or nothing matched)');
  } else if (write) {
    fs.writeFileSync(snapshotPath, JSON.stringify({ ...snapshot, items: next }, null, 2) + '\n');
    console.log(`sweep: linked ${linked} straggler story/stories, wrote ${snapshotPath}`);
  } else {
    console.log(`sweep (dry-run): would link ${linked} straggler story/stories -- re-run with --write to apply`);
  }
  process.exit(0);
}
