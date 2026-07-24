import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";

// resume-anchor.ts — opencode plugin
//
// Keeps a long session oriented across autocompaction.
//
// The problem (field report, gpt-5-mini, 2026-07): on a long review or coding
// run, opencode autocompacts and the agent loses the thread — it re-does
// finished work, forgets which files it still owes, or drops the completion
// phrase. Compaction replaces conversation history with a summary, and a
// summary of a summary degrades fast on a small model.
//
// Why the existing protocol is not enough: CHECKPOINT_STATE.md and
// TUI_SESSION_HYGIENE's 70% rule both ask the MODEL to notice its context
// filling and checkpoint itself. That is exactly the self-monitoring a small
// model does not do reliably — the same class of failure as the HANDOFF intake
// bug. So this is deterministic instead: the runtime re-injects position from
// disk, whether or not the model thought to.
//
// The insight: **disk state survives compaction perfectly; conversation history
// does not.** So rather than trying to make the summary better, recompute a
// small "where am I" anchor from the files on disk and re-inject it on EVERY
// request. Post-compaction turns get the same anchor as pre-compaction turns,
// because it never depended on history in the first place.
//
// Two hooks, unequal weight:
//   experimental.chat.system.transform   (load-bearing) — inject the anchor every
//                                        request. Independent of summary quality.
//   experimental.session.compacting      (best-effort) — tell the summarizer which
//                                        pointers must survive. Appends to the
//                                        default prompt; never replaces it.
//
// Costs nothing on projects with no SDLC state: if none of the source files
// exist, the anchor is omitted entirely. Disable with EXPERTS_RESUME_ANCHOR=0.
//
// ── What is actually proven (2026-07) ─────────────────────────────────────────
//   PROVEN  chat.system.transform fires and the anchor reaches the model
//           (gpt-5-mini, tools forbidden, named the MISSING PRODUCE file + exact
//           completion phrase; fresh and after an 8-turn session).
//   PROVEN  session.compacting FIRES during a real TUI autocompaction. A captured
//           TUI trace (a coding-agent session that auto-compacted mid-task)
//           contained this plugin's own text verbatim inside the compaction
//           summary — "read YOURS, do not assume", "Phase files on disk", "cannot
//           be identified". So the mechanism works end-to-end in the place it
//           matters. (The CLI could not trigger it; the TUI does.)
//   PROVEN  hook bodies incl. recency selection + anti-drift directive (Pass 33d).
//   LESSON  that same trace ALSO showed the FIRST version failing: with 5 handoff
//           files present the old blanket punt gave the mid-task session no
//           anchor, and it drifted to a menu ("Which should I do now?"). That is
//           what the recency selection + MID-TASK directive here fix.
// Both hooks are `experimental.`-prefixed on a fast-moving API; a rename would
// make this a silent no-op that Pass 33d would NOT catch (it calls the bodies
// directly). Re-check against a TUI trace after an opencode upgrade.

const MAX_ANCHOR_CHARS = 2600; // hard cap — this rides on every request. Raised from
// 1400 when the post-compaction continuation directive was added, then from 1900 when
// the no-invented-commands / fresh-evidence / whole-task-report rules were added
// (2026-07 T-72 trace): truncation cuts the TAIL, and the tail is the directive.
const MAX_LIST = 8;

const enabled = () => process.env.EXPERTS_RESUME_ANCHOR !== "0";

function readCapped(path: string, maxChars: number): string {
  try {
    const t = readFileSync(path, "utf8");
    return t.length > maxChars ? t.slice(0, maxChars) + "…" : t;
  } catch {
    return "";
  }
}

/** Lines under `## <heading>` in a markdown doc, up to the next `## `. */
function section(md: string, heading: string): string[] {
  const lines = md.split("\n");
  const start = lines.findIndex((l) =>
    l.toLowerCase().startsWith(`## ${heading.toLowerCase()}`),
  );
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) break;
    if (lines[i].trim()) out.push(lines[i].trim());
  }
  return out;
}

/**
 * Identify which docs/work/HANDOFF_*.md the session is CURRENTLY executing, among
 * however many exist. A real project accumulates many handoff files, so "there is
 * more than one" is the normal case — not a reason to give up (the original guard
 * punted here, which made the anchor useless exactly when a session was deep in
 * work and a compaction wiped its memory — observed live, 2026-07).
 *
 * The disambiguator, filesystem-only: a session actively working a handoff has
 * recently MODIFIED that handoff's PRODUCE files. Rank each handoff by the newest
 * mtime among its existing PRODUCE files; the freshest is the active one. This
 * separates the two cases correctly:
 *   - mid-task session: exactly one handoff has recently-touched outputs  → assert it
 *   - fresh /review fan-out: 3 handoffs, none has produced anything yet   → ambiguous
 * The ambiguous case still refuses to assert a phrase (the /security-gets-the-wrong-
 * -phrase risk), but a `primary` is offered as "resume this unless you know it's
 * not yours", which is strictly more useful than the old blanket punt.
 */
function selectHandoffs(root: string): {
  all: string[];
  primary: { path: string; text: string } | null;
  confident: boolean; // true = exactly one, or a clear recency winner
} {
  const dir = join(root, "docs", "work");
  const none = { all: [], primary: null, confident: false };
  if (!existsSync(dir)) return none;
  try {
    const paths = readdirSync(dir)
      .filter((f) => /^HANDOFF_.*\.md$/.test(f))
      .map((f) => join(dir, f));
    if (!paths.length) return none;
    if (paths.length === 1) {
      return {
        all: paths,
        primary: { path: paths[0], text: readCapped(paths[0], 8000) },
        confident: true,
      };
    }

    // Score each handoff by the newest mtime among its existing PRODUCE files.
    const scored = paths.map((p) => {
      const text = readCapped(p, 8000);
      let newest = -1;
      for (const rel of produceFiles(text)) {
        const abs = join(root, rel);
        if (existsSync(abs)) {
          try {
            newest = Math.max(newest, statSync(abs).mtimeMs);
          } catch {
            /* ignore */
          }
        }
      }
      return { path: p, text, newest };
    });
    const touched = scored
      .filter((s) => s.newest > 0)
      .sort((a, b) => b.newest - a.newest);

    if (touched.length === 0) {
      // Fresh fan-out: nothing produced yet, cannot tell whose session this is.
      return { all: paths, primary: null, confident: false };
    }
    // The handoff with the freshest output is the most likely active one, but
    // because siblings exist and could be a concurrent fan-out, this is never
    // "confident" — the anchor names it as "resume this unless you know it's not
    // yours", which the session overrides from its own prompt. Confident is
    // reserved for the single-handoff case (handled by the early return above).
    const top = touched[0];
    return {
      all: paths,
      primary: { path: top.path, text: top.text },
      confident: false,
    };
  } catch {
    return none;
  }
}

/** Phase files a specialist has already written: docs/work/<agent>/<slug>/phaseN.md */
function phaseProgress(root: string): string[] {
  const base = join(root, "docs", "work");
  if (!existsSync(base)) return [];
  const found: string[] = [];
  try {
    for (const agent of readdirSync(base, { withFileTypes: true })) {
      if (!agent.isDirectory()) continue;
      const agentDir = join(base, agent.name);
      for (const slug of readdirSync(agentDir, { withFileTypes: true })) {
        if (!slug.isDirectory()) continue;
        const slugDir = join(agentDir, slug.name);
        const phases = readdirSync(slugDir)
          .filter((f) => /^phase\d+\.md$/.test(f))
          .sort();
        if (phases.length) {
          found.push(
            `docs/work/${agent.name}/${slug.name}/ — written: ${phases.join(", ")}`,
          );
        }
      }
    }
  } catch {
    /* best effort */
  }
  return found.slice(0, MAX_LIST);
}

/** Repo-relative paths named under the handoff's PRODUCE section. */
function produceFiles(handoffText: string): string[] {
  const out: string[] = [];
  const lines = handoffText.split("\n");
  const start = lines.findIndex((l) => /^PRODUCE\b/i.test(l.trim()));
  if (start === -1) return out;
  for (let i = start + 1; i < lines.length && out.length < MAX_LIST; i++) {
    const l = lines[i].trim();
    if (!l.startsWith("-")) {
      if (/^[A-Z][A-Z -]+:/.test(l)) break; // next HANDOFF section
      continue;
    }
    const m = l.match(/`?([\w./-]+\.[a-z]{2,4})`?/);
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * The PRODUCE list of a HANDOFF, each marked done/missing by checking the
 * filesystem. The highest-value line in the anchor: the difference between "I
 * think I finished" and "these two files do not exist yet".
 */
function produceStatus(root: string, handoffText: string): string[] {
  return produceFiles(handoffText).map(
    (rel) => `${existsSync(join(root, rel)) ? "[done]" : "[MISSING]"} ${rel}`,
  );
}

function buildAnchor(root: string): string | null {
  const parts: string[] = [];

  const statePath = join(root, "docs", "work", "STATE.md");
  if (existsSync(statePath)) {
    const md = readCapped(statePath, 4000);
    const inFlight = section(md, "In flight").slice(0, 3);
    const next = section(md, "Next").slice(0, 3);
    if (inFlight.length) parts.push(`In flight: ${inFlight.join(" | ")}`);
    if (next.length) parts.push(`Next step: ${next.join(" | ")}`);
  }

  const handoff = selectHandoffs(root);
  let workInFlight = false;
  if (handoff.primary) {
    const rel = handoff.primary.path.slice(root.length + 1);
    const produce = produceStatus(root, handoff.primary.text);
    const owed = produce.filter((p) => p.startsWith("[MISSING]"));
    const others = handoff.all.filter((p) => p !== handoff.primary!.path);
    if (owed.length || phaseProgress(root).length) workInFlight = true;

    if (handoff.confident) {
      parts.push(
        `Active HANDOFF: ${rel} (re-read it if anything below is unclear)`,
      );
    } else {
      // Recency named a most-likely handoff but siblings exist and could be a
      // concurrent fan-out; hedge so a wrong guess is recoverable.
      parts.push(
        `Most-recently-active HANDOFF: ${rel} — resume THIS unless you know you were executing another` +
          (others.length
            ? ` (others present: ${others.map((p) => p.slice(root.length + 1)).join(", ")})`
            : ""),
      );
    }
    if (produce.length) parts.push(`PRODUCE status: ${produce.join(" ; ")}`);
    const phrase = handoff.primary.text.match(/Print exactly:\s*"([^"]+)"/);
    if (phrase) parts.push(`Completion phrase: "${phrase[1]}"`);
  } else if (handoff.all.length > 1) {
    // Genuinely ambiguous: multiple handoffs, none has produced anything yet.
    const rels = handoff.all
      .slice(0, MAX_LIST)
      .map((p) => p.slice(root.length + 1));
    parts.push(
      `Multiple HANDOFFs present, none started yet — read YOURS, do not assume: ${rels.join(", ")}.`,
    );
  }

  const phases = phaseProgress(root);
  if (phases.length) {
    parts.push(`Phase files on disk: ${phases.join(" ; ")}`);
    workInFlight = true;
  }

  if (!parts.length) return null; // not an SDLC/handoff project — stay out of the way

  const body = parts.join("\n- ");
  // When there is owed work, the observed failure is the model drifting to a
  // menu / asking the user what to do after a compaction (2026-07 field trace).
  // Forbid that explicitly — resuming is the only correct move.
  const directive = workInFlight
    ? "\nYou are MID-TASK: work is in flight and PRODUCE files are still owed. Do NOT " +
      "present a menu of options, do NOT ask the user what to do next, do NOT restart. " +
      "Re-read the HANDOFF named above and CONTINUE it to its completion phrase."
    : "\nDo not redo work whose output already exists. If a PRODUCE file is MISSING, that " +
      "work is still owed. Re-read the files named above before acting — do not ask the user where you were.";

  // Second observed post-compaction failure (2026-07, round-2 field trace): the
  // model kept a PERFECT summary — every step, the exact next command — and then
  // ended its turn with "Say 'Proceed' to let me start". Permission-seeking after
  // a compaction is the ask-variant of announce-then-stop, and it stalls an
  // unattended pipeline exactly like the menu did. The handoff's authorization
  // survives compaction; asking again is never correct.
  const continuation =
    "\nIf a compaction summary precedes this turn: the HANDOFF's authorization still " +
    "stands — execute the summary's next step NOW. Do not ask 'should I proceed', do not " +
    "present your plan for approval, do not wait for confirmation. Asking permission to " +
    "continue an already-authorized task is a contract violation (BOUNDED_TASK_CONTRACT). " +
    "The same rule holds MID-TASK, compaction or not: never end a turn asking whether to run " +
    "a step the HANDOFF already lists — especially its verify/test commands ('Shall I run the " +
    "tests now?' is the observed failure). Run them. If an environment dependency is down " +
    "(e.g. Podman), run the command anyway, capture the literal failure, and report BLOCKED " +
    "with it — a failed run is evidence; an unasked question is a stall. " +
    "Fix a failing verify command INSIDE the repo (code edits, regenerating generated " +
    "clients, fixing fixtures), then re-run THAT exact command — never run migrate/deploy/" +
    "credential commands the HANDOFF never listed (observed failure: an invented 'prisma " +
    "migrate deploy' hit a permissions error and became a fictional 'need DB credentials' " +
    "blocker while the real testcontainers suite passed on re-run — such suites provision " +
    "their own DB). BLOCKED is only valid citing the verify command's own post-fix output. " +
    "When reporting, reconstruct from disk: `git log origin/main..HEAD --oneline` + " +
    "`git status --short` — account for every commit (unpushed commits = the push step is " +
    "NOT done), and walk the HANDOFF's step list, not just your last turn's delta.";

  const anchor =
    "## RESUME ANCHOR (regenerated from disk every turn — authoritative)\n" +
    "Your conversation history may have been summarized by autocompaction. The\n" +
    "facts below were just read from the filesystem, so they are correct even when\n" +
    "your recollection is not. Trust them over memory.\n" +
    "- " +
    body +
    directive +
    continuation;

  return anchor.length > MAX_ANCHOR_CHARS
    ? anchor.slice(0, MAX_ANCHOR_CHARS) + "…"
    : anchor;
}

export const ResumeAnchor: Plugin = async () => {
  return {
    // Load-bearing half: re-orient on EVERY request, so a compacted turn is no
    // worse off than an uncompacted one. Does not depend on the summary.
    "experimental.chat.system.transform": async (_input, output) => {
      if (!enabled()) return;
      try {
        const anchor = buildAnchor(process.cwd());
        if (anchor) output.system.push(anchor);
      } catch {
        // Never break a session over an optional orientation aid.
      }
    },

    // Best-effort half: name the pointers that must survive summarization.
    // Append to `context`; never set `prompt` — replacing opencode's default
    // summarizer wholesale trades a known-good default for an untested one.
    "experimental.session.compacting": async (_input, output) => {
      if (!enabled()) return;
      try {
        const root = process.cwd();
        const anchor = buildAnchor(root);
        output.context.push(
          "This session is executing a bounded engineering task. In your summary, preserve VERBATIM: " +
            "(a) the active docs/work/HANDOFF_*.md path, (b) the exact PRODUCE file list and which are still missing, " +
            "(c) the exact completion phrase to print, (d) which numbered phases/steps are already finished. " +
            "Prefer dropping narrative over dropping any of those four. " +
            "If any PRODUCE file is still missing, the summary MUST state that work is IN FLIGHT and name the next action — " +
            "do NOT conclude 'nothing outstanding' or offer the user a menu of options; the correct post-summary move is to resume the handoff. " +
            "Any next-step command in the summary must be one the HANDOFF itself lists (or a project-standard fix like a client-regenerate step) — " +
            "never carry forward an invented infrastructure command (migrate/deploy/credential changes): a wrong diagnosis written into a summary " +
            "becomes gospel after compaction. If a verify command was failing, the next step is fix-then-re-run THAT command. " +
            "End the summary with this literal final line, filled in: " +
            "'RESUME NOW: <the single most specific next command or edit>. Authorization from the HANDOFF still stands — " +
            "execute this immediately; do not ask for confirmation or present a plan for approval.'" +
            (anchor ? "\n\nCurrent on-disk state:\n" + anchor : ""),
        );
      } catch {
        // Compaction must proceed even if we cannot contribute to it.
      }
    },
  };
};
