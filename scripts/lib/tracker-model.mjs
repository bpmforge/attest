// tracker-model.mjs — External Tracker Data Model: spec parsing + snapshot
// integrity checks (T29.6, M29 field lesson H5/A-6).
//
// Field lesson (issues/field-report-mode1-sdlc-run-2026-07.md, A-6): a
// Mode-1 engagement generated a large backlog directly in the CLIENT's own
// issue tracker (Jira-shaped: epics/stories/tasks, labels, a single-valued
// epic-link) with no deliberate data model. The hierarchy, the phase→story
// linkage, and the label discipline all drifted and had to be
// reverse-engineered mid-project. This module backs the fix: a short,
// project-authored spec (docs/TRACKER_DATA_MODEL.md, filled from
// references/tracker-data-model-template.md) recorded BEFORE any backlog is
// generated, plus an integrity check against a normalized snapshot of the
// live tracker's items.
//
// Two artifacts, both project-authored — this repo never talks to a live
// external tracker directly, every tracker is different (Jira/Linear/GitHub
// Projects/...); a project produces its own normalized export however it
// pulls one (API script, CSV-to-JSON, etc.):
//
//   docs/TRACKER_DATA_MODEL.md      — the filled spec, four required
//     sections: Layer Map, Phase → Work Linkage, Source of Truth,
//     Stray & Template Handling (references/tracker-data-model-template.md).
//
//   docs/work/tracker-snapshot.json — { items: [TrackerItem, ...] }
//     TrackerItem: { id, type, title, parentId, labels: string[], stray? }
//     - type: whatever vocabulary the Layer Map section declares (e.g.
//       "epic"/"phase"/"story"/"task"/"subtask" — project-defined, not fixed)
//     - parentId: the structural phase→work link this model exists to make
//       real (null/absent = unlinked)
//     - stray: true for sample/template/scaffolding items kept intentionally
//       out of scope math (A-6.5); items whose title merely LOOKS like a
//       stray but aren't tagged are exactly the bug this catches.

const REQUIRED_SECTIONS = [
  { key: 'layerMap', match: /layer map/i },
  { key: 'linkage', match: /linkage/i },
  { key: 'sourceOfTruth', match: /source of truth/i },
  { key: 'strayHandling', match: /stray/i },
];

const PLACEHOLDER_RE = /\b(PLACEHOLDER|\[TODO\]|\[TBD\]|XXX-FIXME|\[FILL-IN\])\b/i;
const MIN_SECTION_LEN = 20;

// Sample/template/scaffolding item names from the field lesson's own
// examples ("Example Epic", "Example Story", a "TEMP" item, a "VOID" item).
const STRAY_LOOKALIKE_RE = /\b(example|sample|template|scaffold(?:ing)?|TEMP|VOID)\b/i;

// splitSections: markdown -> [{ heading, body }] split on `## ` headings.
function splitSections(markdown) {
  const lines = String(markdown || '').split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      current = { heading: m[1].trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections.map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() }));
}

// parseTrackerSpec: extracts the four required sections + two derived facts
// used by validateTrackerSnapshot: whether labels are the declared source of
// truth for scope/completion, and which item types the Layer Map declares.
export function parseTrackerSpec(markdown) {
  const sections = splitSections(markdown);
  const found = {};
  const missing = [];

  for (const { key, match } of REQUIRED_SECTIONS) {
    const section = sections.find((s) => match.test(s.heading));
    const body = section ? section.body : '';
    if (!section || body.length < MIN_SECTION_LEN || PLACEHOLDER_RE.test(body)) {
      missing.push(key);
    } else {
      found[key] = body;
    }
  }

  const sourceIsLabels = /\blabels?\b/i.test(found.sourceOfTruth || '');
  const declaredTypes = [...new Set(
    [...(found.layerMap || '').matchAll(/`([a-zA-Z][a-zA-Z-]*)`/g)].map((m) => m[1].toLowerCase()),
  )];

  return { complete: missing.length === 0, missing, sections: found, sourceIsLabels, declaredTypes };
}

// validateTrackerSnapshot: checks every non-stray item against the recorded
// spec. Returns { errors, warnings } — errors are gate-blocking ([x] in the
// bash wrapper), warnings are advisory ([!]).
export function validateTrackerSnapshot(spec, snapshot) {
  const errors = [];
  const warnings = [];
  const items = snapshot && Array.isArray(snapshot.items) ? snapshot.items : [];
  const byId = new Map(items.filter((it) => it && it.id != null).map((it) => [it.id, it]));

  for (const item of items) {
    if (!item || item.id == null) {
      errors.push({ category: 'malformed-item', detail: 'a tracker-snapshot item has no id' });
      continue;
    }
    const label = `${item.id}${item.title ? ` (${item.title})` : ''}`;

    // A-6.5: an item that LOOKS like a template/sample/stray but isn't
    // tagged stray:true is silently counted in scope math.
    const looksStray = STRAY_LOOKALIKE_RE.test(item.title || '');
    if (looksStray && item.stray !== true) {
      errors.push({
        category: 'stray-in-scope-math',
        detail: `${label} looks like a template/sample/scaffolding item but is not tagged stray:true — it will be silently counted in scope math`,
      });
    }
    if (item.stray === true) continue;

    // A-6.4: labels are load-bearing but unenforced -> unlabeled item is a
    // silent data-integrity bug, only checked when the spec names labels as
    // the source of truth.
    if (spec.sourceIsLabels && (!Array.isArray(item.labels) || item.labels.length === 0)) {
      errors.push({
        category: 'unlabeled-item',
        detail: `${label} has no labels, but the recorded Tracker Data Model names labels as the single source of truth for scope/completion`,
      });
    }

    // A-6.1/A-6.2: every requirement-story must be structurally linked to
    // its phase — the retrofit-150-links failure this model exists to
    // prevent from happening a second time.
    if (item.type === 'story') {
      if (!item.parentId) {
        errors.push({
          category: 'unlinked-story',
          detail: `${label} is a story with no parentId — not structurally linked to its phase`,
        });
      } else if (!byId.has(item.parentId)) {
        errors.push({
          category: 'unlinked-story',
          detail: `${label} references parentId '${item.parentId}', which does not exist in the snapshot — dangling phase link`,
        });
      }
    }

    // Layering matches the recorded model (advisory — the Layer Map's
    // backtick-quoted type tokens are a best-effort extraction, not a
    // closed enum this repo can enforce as a hard gate across every
    // tracker's own vocabulary).
    if (spec.declaredTypes.length && item.type && !spec.declaredTypes.includes(String(item.type).toLowerCase())) {
      warnings.push({
        category: 'undeclared-type',
        detail: `${label} has type '${item.type}', not one of the Layer Map's declared types [${spec.declaredTypes.join(', ')}]`,
      });
    }
  }

  return { errors, warnings };
}

const USAGE = 'usage: tracker-model.mjs validate <spec.md> [snapshot.json]\n       tracker-model.mjs check-spec <spec.md>';

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const fs = await import('node:fs');
  const [cmd, specPath, snapshotPath] = process.argv.slice(2);
  if (!cmd || !specPath) { console.error(USAGE); process.exit(2); }
  if (!fs.existsSync(specPath)) { console.error(`[x] spec not found: ${specPath}`); process.exit(2); }

  const spec = parseTrackerSpec(fs.readFileSync(specPath, 'utf8'));

  if (cmd === 'check-spec') {
    if (spec.complete) { console.log('ok — spec complete'); process.exit(0); }
    for (const m of spec.missing) console.log(`  [x] spec section missing or placeholder: ${m}`);
    process.exit(1);
  }

  if (cmd === 'validate') {
    let gapCount = 0;
    for (const m of spec.missing) { console.log(`  [x] spec section missing or placeholder: ${m}`); gapCount++; }

    if (snapshotPath && fs.existsSync(snapshotPath)) {
      let snapshot;
      try {
        snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      } catch (err) {
        console.log(`  [x] tracker-snapshot.json is not valid JSON: ${err.message}`);
        process.exit(1);
      }
      const { errors, warnings } = validateTrackerSnapshot(spec, snapshot);
      for (const e of errors) { console.log(`  [x] ${e.category}: ${e.detail}`); gapCount++; }
      for (const w of warnings) console.log(`  [!] ${w.category}: ${w.detail}`);
    }

    console.log(gapCount === 0 ? 'ok — tracker data model clean' : `INVALID — ${gapCount} gap(s)`);
    process.exit(gapCount === 0 ? 0 : 1);
  }

  console.error(USAGE);
  process.exit(2);
}
