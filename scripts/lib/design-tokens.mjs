// design-tokens.mjs — drift gate between a Figma design source and the internal
// tokens.json (the gate behind scripts/validators/validate-design-tokens.sh).
//
// Only meaningful when a project pulled a Figma snapshot; a project authoring
// tokens.json from prose (no Figma) has nothing to check and is skipped clean —
// the same "no-op unless the external source is present" shape as
// validate-tracker-integrity.sh / validate-jira-hygiene.sh.
//
// Checks (offline, no live Figma):
//   - snapshot-without-tokens: figma-snapshot.json exists but tokens.json was
//     never derived (docs/design/tokens.json missing) — the design source was
//     pulled but never applied.
//   - dropped-token (error): a color the Figma snapshot provides is absent from
//     tokens.json — a real design token silently dropped on the way to code.
//   - value-drift (warning): a color present in both but with a different value
//     — tokens.json intentionally diverged from Figma OR forked by accident;
//     surfaced, not failed (design-system-lead may adjust on purpose).

import { existsSync, readFileSync } from 'fs';
import { deriveTokens } from '../figma/figma.mjs';

export function designTokenGaps(snapshotPath, tokensPath) {
  if (!existsSync(snapshotPath)) return { skipped: true, gaps: [], warnings: [] };
  if (!existsSync(tokensPath))
    return { skipped: false, gaps: [['snapshot-without-tokens', `${snapshotPath} exists but ${tokensPath} was never derived — run 'figma.sh derive-tokens'`]], warnings: [] };

  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const actual = JSON.parse(readFileSync(tokensPath, 'utf8'));
  const { tokens: derived } = deriveTokens(snapshot);

  const gaps = [];
  const warnings = [];
  const actualColor = actual.color || {};
  const derivedColor = derived.color || {};

  const compare = (aObj, dObj, prefix) => {
    for (const [k, v] of Object.entries(dObj)) {
      if (k === 'semantic') continue;
      if (!(k in aObj)) gaps.push(['dropped-token', `Figma color '${prefix}${k}' (${v}) is not in tokens.json — a design token was dropped`]);
      else if (String(aObj[k]).toLowerCase() !== String(v).toLowerCase())
        warnings.push(`color '${prefix}${k}': Figma=${v} tokens.json=${aObj[k]} (diverged)`);
    }
  };
  compare(actualColor, derivedColor, '');
  compare(actualColor.semantic || {}, derivedColor.semantic || {}, 'semantic.');

  return { skipped: false, gaps, warnings };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const snapshot = process.argv[2] || 'docs/design/figma-snapshot.json';
  const tokens = process.argv[3] || 'docs/design/tokens.json';
  const { skipped, gaps, warnings } = designTokenGaps(snapshot, tokens);
  if (skipped) { console.log('skip — no Figma snapshot (docs/design/figma-snapshot.json) — tokens.json is authored, nothing to reconcile'); process.exit(0); }
  for (const [cat, detail] of gaps) console.log(`[x] ${cat}\t${detail}`);
  for (const w of warnings) console.log(`[!] value-drift\t${w}`);
  console.log(gaps.length ? `INVALID — ${gaps.length} design-token gap(s), ${warnings.length} drift warning(s)` : `ok — tokens.json consistent with Figma source (${warnings.length} drift warning(s))`);
  process.exit(gaps.length ? 1 : 0);
}
