/**
 * test-tracker-integrity.ts — Pass 38 chapter module for scripts/test.ts
 * (T29.6, M29 field lesson H5/A-6, external trackers).
 *
 * Covers:
 *   1. parseTrackerSpec() — complete spec parses all four sections + derives
 *      sourceIsLabels/declaredTypes; a spec missing a section or carrying a
 *      placeholder marker is reported incomplete.
 *   2. validateTrackerSnapshot() — the ticket's own three named red cases,
 *      each isolated: unlabeled item (A-6.4), unlinked story (A-6.1/6.2,
 *      both "no parentId" and "dangling parentId"), stray-in-scope-math
 *      (A-6.5, an untagged template/sample item). A green item (labeled,
 *      linked) and a correctly-tagged stray both pass clean.
 *   3. sweepLinks() — idempotent phase→story linking: a straggler with a
 *      matching phase label gets linked; a second sweep over the same data
 *      links 0 (true idempotence, not "happens to no-op today").
 *   4. validate-tracker-integrity.sh via the real CLI: spec-exists-before-
 *      backlog gate (RED: snapshot with no spec; GREEN: neither artifact
 *      present is NOT a gap), plus the static green/red fixture pair this
 *      repo's check-validator-fixtures.mjs harness also exercises.
 *
 * Run on real /bin/bash (not $BASH) per the T27.7 lesson.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import {
  parseTrackerSpec,
  validateTrackerSnapshot,
} from "./lib/tracker-model.mjs";
import { sweepLinks } from "./tracker-link-sweep.mjs";

const COMPLETE_SPEC_MD = [
  "# Tracker Data Model — Test Project",
  "",
  "## Layer Map",
  "",
  "- `epic` = the whole engagement",
  "- `phase` = one per SDLC phase",
  "- `story` = one per requirement-story",
  "",
  "## Phase → Work Linkage",
  "",
  "Mechanism chosen: explicit parentId relationship field.",
  "",
  "## Source of Truth",
  "",
  "Source of truth: labels. Every item must carry a scope label.",
  "",
  "## Stray & Template Handling",
  "",
  "Handling: sample items are tagged stray: true from the start.",
  "",
].join("\n");

export async function testTrackerIntegrity(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  try {
    // -- 1. parseTrackerSpec: complete spec ----------------------------------
    {
      const spec = parseTrackerSpec(COMPLETE_SPEC_MD);
      if (
        spec.complete &&
        spec.missing.length === 0 &&
        spec.sourceIsLabels === true &&
        spec.declaredTypes.includes("epic") &&
        spec.declaredTypes.includes("phase") &&
        spec.declaredTypes.includes("story")
      )
        ok(
          "tracker-integrity — parseTrackerSpec: a complete spec is reported complete with sourceIsLabels + declaredTypes derived",
        );
      else
        fail(
          "tracker-integrity — parseTrackerSpec complete",
          JSON.stringify(spec),
        );
    }

    // -- 2. parseTrackerSpec: missing + placeholder sections -----------------
    {
      const missingSection = COMPLETE_SPEC_MD.replace(
        /## Stray & Template Handling[\s\S]*/,
        "",
      );
      const spec1 = parseTrackerSpec(missingSection);
      const placeholderSpec = COMPLETE_SPEC_MD.replace(
        "Mechanism chosen: explicit parentId relationship field.",
        "[TBD]",
      );
      const spec2 = parseTrackerSpec(placeholderSpec);
      if (
        !spec1.complete &&
        spec1.missing.includes("strayHandling") &&
        !spec2.complete &&
        spec2.missing.includes("linkage")
      )
        ok(
          "tracker-integrity — parseTrackerSpec: a missing section and a [TBD] placeholder section are both reported incomplete",
        );
      else
        fail(
          "tracker-integrity — parseTrackerSpec incomplete",
          `spec1=${JSON.stringify(spec1.missing)} spec2=${JSON.stringify(spec2.missing)}`,
        );
    }

    // -- 3. validateTrackerSnapshot: unlabeled item (A-6.4) ------------------
    {
      const spec = parseTrackerSpec(COMPLETE_SPEC_MD); // sourceIsLabels: true
      const snapshot = {
        items: [
          { id: "P-1", type: "phase", title: "Phase 1", labels: ["scope:mvp"] },
          { id: "S-1", type: "story", title: "Unlabeled", parentId: "P-1", labels: [] },
        ],
      };
      const { errors } = validateTrackerSnapshot(spec, snapshot);
      if (errors.length === 1 && errors[0].category === "unlabeled-item")
        ok(
          "tracker-integrity — validateTrackerSnapshot: RED unlabeled item flagged when the spec names labels as source of truth",
        );
      else
        fail(
          "tracker-integrity — unlabeled-item RED",
          JSON.stringify(errors),
        );
    }

    // -- 4. validateTrackerSnapshot: unlinked story, both shapes (A-6.1/6.2) -
    {
      const spec = parseTrackerSpec(COMPLETE_SPEC_MD);
      const snapshot = {
        items: [
          { id: "P-1", type: "phase", title: "Phase 1", labels: ["scope:mvp"] },
          { id: "S-1", type: "story", title: "No parent", parentId: null, labels: ["scope:mvp"] },
          { id: "S-2", type: "story", title: "Dangling parent", parentId: "P-999", labels: ["scope:mvp"] },
        ],
      };
      const { errors } = validateTrackerSnapshot(spec, snapshot);
      const unlinked = errors.filter((e) => e.category === "unlinked-story");
      if (
        unlinked.length === 2 &&
        unlinked.some((e) => e.detail.includes("no parentId")) &&
        unlinked.some((e) => e.detail.includes("dangling"))
      )
        ok(
          "tracker-integrity — validateTrackerSnapshot: RED unlinked story flagged for both no-parentId and dangling-parentId",
        );
      else
        fail("tracker-integrity — unlinked-story RED", JSON.stringify(errors));
    }

    // -- 5. validateTrackerSnapshot: stray-in-scope-math (A-6.5) -------------
    {
      const spec = parseTrackerSpec(COMPLETE_SPEC_MD);
      const snapshot = {
        items: [
          { id: "E-1", type: "epic", title: "Example Epic", labels: ["scope:mvp"] },
        ],
      };
      const { errors } = validateTrackerSnapshot(spec, snapshot);
      if (errors.length === 1 && errors[0].category === "stray-in-scope-math")
        ok(
          "tracker-integrity — validateTrackerSnapshot: RED an untagged template-lookalike item is flagged (would silently pollute scope math)",
        );
      else
        fail(
          "tracker-integrity — stray-in-scope-math RED",
          JSON.stringify(errors),
        );
    }

    // -- 6. validateTrackerSnapshot: GREEN — labeled+linked story, correctly
    // tagged stray both pass clean ------------------------------------------
    {
      const spec = parseTrackerSpec(COMPLETE_SPEC_MD);
      const snapshot = {
        items: [
          { id: "P-1", type: "phase", title: "Phase 1", labels: ["scope:mvp"] },
          { id: "S-1", type: "story", title: "Clean story", parentId: "P-1", labels: ["scope:mvp"] },
          { id: "E-1", type: "epic", title: "Example Epic", labels: [], stray: true },
        ],
      };
      const { errors } = validateTrackerSnapshot(spec, snapshot);
      if (errors.length === 0)
        ok(
          "tracker-integrity — validateTrackerSnapshot: GREEN labeled+linked story and a correctly-tagged stray both pass clean",
        );
      else
        fail("tracker-integrity — GREEN snapshot", JSON.stringify(errors));
    }

    // -- 7. sweepLinks: idempotent phase→story linking (A-6.2) ---------------
    {
      const items = [
        { id: "P-1", type: "phase", title: "Phase 1", parentId: null, labels: [] },
        { id: "S-1", type: "story", title: "Straggler", parentId: null, labels: ["phase:P-1"] },
        { id: "S-2", type: "story", title: "No match", parentId: null, labels: ["phase:P-9"] },
      ];
      const first = sweepLinks(items);
      const second = sweepLinks(first.items);
      const linkedStory = first.items.find((i) => i.id === "S-1");
      if (
        first.linked === 1 &&
        linkedStory?.parentId === "P-1" &&
        second.linked === 0
      )
        ok(
          "tracker-integrity — sweepLinks: links a straggler matching a phase label, second sweep links 0 (idempotent)",
        );
      else
        fail(
          "tracker-integrity — sweepLinks idempotence",
          `first=${JSON.stringify(first)} second.linked=${second.linked}`,
        );
    }

    // -- 8. CLI: real validate-tracker-integrity.sh, spec-missing-before-
    // backlog (RED) and neither-artifact (GREEN, not-applicable) ------------
    {
      const validator = path.join(
        root,
        "scripts/validators/validate-tracker-integrity.sh",
      );
      function run(dir: string): { exitCode: number; stdout: string } {
        try {
          const stdout = execFileSync("/bin/bash", [validator, dir], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          });
          return { exitCode: 0, stdout };
        } catch (err: unknown) {
          const e = err as { status?: number; stdout?: string };
          return { exitCode: e.status ?? 1, stdout: e.stdout ?? "" };
        }
      }

      const specMissingDir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-tracker-spec-missing-"),
      );
      fs.mkdirSync(path.join(specMissingDir, "docs/work"), { recursive: true });
      fs.writeFileSync(
        path.join(specMissingDir, "docs/work/tracker-snapshot.json"),
        JSON.stringify({ items: [] }),
      );
      const r1 = run(specMissingDir);
      fs.rmSync(specMissingDir, { recursive: true, force: true });

      const neitherDir = fs.mkdtempSync(
        path.join(fs.realpathSync(root), ".tmp-tracker-neither-"),
      );
      const r2 = run(neitherDir);
      fs.rmSync(neitherDir, { recursive: true, force: true });

      if (
        r1.exitCode === 1 &&
        r1.stdout.includes("spec-missing-before-backlog") &&
        r2.exitCode === 0 &&
        r2.stdout.includes('"gaps":0')
      )
        ok(
          "tracker-integrity — CLI: a snapshot with no spec is refused (spec-before-backlog); neither artifact present is not a gap",
        );
      else
        fail(
          "tracker-integrity — CLI spec-missing/neither",
          `r1=${r1.exitCode}/${r1.stdout.slice(0, 200)} r2=${r2.exitCode}/${r2.stdout.slice(0, 200)}`,
        );
    }

    // -- 9. CLI: the static green/red fixture pair (also exercised by
    // check-validator-fixtures.mjs since this validator is chained) --------
    {
      const validator = path.join(
        root,
        "scripts/validators/validate-tracker-integrity.sh",
      );
      const greenDir = path.join(
        root,
        "evals/fixtures/validators/validate-tracker-integrity/green",
      );
      const redDir = path.join(
        root,
        "evals/fixtures/validators/validate-tracker-integrity/red",
      );
      function run(dir: string): { exitCode: number; stdout: string } {
        try {
          const stdout = execFileSync("/bin/bash", [validator, dir], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          });
          return { exitCode: 0, stdout };
        } catch (err: unknown) {
          const e = err as { status?: number; stdout?: string };
          return { exitCode: e.status ?? 1, stdout: e.stdout ?? "" };
        }
      }
      const green = run(greenDir);
      const red = run(redDir);
      if (green.exitCode === 0 && green.stdout.includes('"gaps":0'))
        ok(
          "tracker-integrity — static fixture: green (complete spec + clean snapshot) passes clean",
        );
      else
        fail(
          "tracker-integrity — static green fixture",
          `exit=${green.exitCode} stdout=${green.stdout.slice(0, 300)}`,
        );

      if (
        red.exitCode === 1 &&
        red.stdout.includes("unlabeled-item") &&
        red.stdout.includes("unlinked-story") &&
        red.stdout.includes("stray-in-scope-math")
      )
        ok(
          "tracker-integrity — static fixture: red flags all three named categories (unlabeled item / unlinked story / stray-in-scope-math)",
        );
      else
        fail(
          "tracker-integrity — static red fixture",
          `exit=${red.exitCode} stdout=${red.stdout.slice(0, 400)}`,
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("tracker-integrity", `unexpected failure: ${message}`);
  }
}
