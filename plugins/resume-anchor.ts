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
// Be precise here, because the headline claim is only partly measured:
//   PROVEN  chat.system.transform fires and the anchor reaches the model. On
//           github-copilot/gpt-5-mini, asked with tools forbidden, it named the
//           MISSING PRODUCE file and the exact completion phrase — which appear
//           nowhere but the anchor — in a fresh session and again at the end of
//           an 8-turn accumulated one.
//   PROVEN  hook bodies, incl. the parallel fan-out guard (scripts/
//           test-resume-anchor.ts, Pass 33d).
//   UNPROVEN  behaviour across a real autocompaction, and whether
//           session.compacting fires at all. opencode exposes no manual compact
//           command, and autocompaction would not trigger in 8 turns with
//           prune:false + reserved=40000. "Survives compaction" therefore rests
//           on the ARCHITECTURE — the anchor is rebuilt from disk every request
//           and never depended on history — not on a measurement.
// If you can trigger a compaction, the check is: post-compaction, ask with tools
// forbidden for the completion phrase. Correct answer ⇒ measured, not inferred.
// Both hooks are `experimental.`-prefixed on a fast-moving API; a rename would
// make this a silent no-op that Pass 33d would NOT catch (it calls the bodies
// directly). Re-run the live check after an opencode upgrade.

const MAX_ANCHOR_CHARS = 1400; // hard cap — this rides on every request
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

/** Newest docs/work/HANDOFF_*.md — the task the session is currently executing. */
function activeHandoff(root: string): {
  paths: string[];
  sole: { path: string; text: string } | null;
} {
  const dir = join(root, "docs", "work");
  const none = { paths: [], sole: null };
  if (!existsSync(dir)) return none;
  try {
    const candidates = readdirSync(dir)
      .filter((f) => /^HANDOFF_.*\.md$/.test(f))
      .map((f) => join(dir, f))
      .map((p) => ({ p, m: statSync(p).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    if (!candidates.length) return none;
    const paths = candidates.map((c) => c.p);
    // Only assert a single authoritative HANDOFF when exactly one exists.
    //
    // A parallel fan-out (the `/review` skill writes HANDOFF_code-reviewer.md,
    // HANDOFF_security-auditor.md and HANDOFF_performance-engineer.md into the
    // same docs/work/) would otherwise make newest-by-mtime hand a /security
    // session the performance-engineer's PRODUCE list and completion phrase —
    // stated with full confidence. A confidently wrong phrase is worse than no
    // anchor, and the hook input carries no agent name to disambiguate with.
    // So with >1 we list the paths and let the agent pick its own.
    if (paths.length > 1) return { paths, sole: null };
    return {
      paths,
      sole: { path: paths[0], text: readCapped(paths[0], 8000) },
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

/**
 * The PRODUCE list of the active HANDOFF, each marked done/missing by checking
 * the filesystem. This is the highest-value line in the anchor: it is the
 * difference between "I think I finished" and "these two files do not exist yet".
 */
function produceStatus(root: string, handoffText: string): string[] {
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
    if (!m) continue;
    const rel = m[1];
    out.push(`${existsSync(join(root, rel)) ? "[done]" : "[MISSING]"} ${rel}`);
  }
  return out;
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

  const handoff = activeHandoff(root);
  if (handoff.sole) {
    const rel = handoff.sole.path.slice(root.length + 1);
    parts.push(
      `Active HANDOFF: ${rel} (re-read it if anything below is unclear)`,
    );
    const produce = produceStatus(root, handoff.sole.text);
    if (produce.length) parts.push(`PRODUCE status: ${produce.join(" ; ")}`);
    const phrase = handoff.sole.text.match(/Print exactly:\s*"([^"]+)"/);
    if (phrase) parts.push(`Completion phrase: "${phrase[1]}"`);
  } else if (handoff.paths.length > 1) {
    const rels = handoff.paths
      .slice(0, MAX_LIST)
      .map((p) => p.slice(root.length + 1));
    parts.push(
      `Multiple HANDOFFs present (parallel wave) — read YOURS, do not assume: ${rels.join(", ")}. ` +
        `No PRODUCE list or completion phrase is asserted here because this session's agent cannot be identified from them.`,
    );
  }

  const phases = phaseProgress(root);
  if (phases.length) parts.push(`Phase files on disk: ${phases.join(" ; ")}`);

  if (!parts.length) return null; // not an SDLC/handoff project — stay out of the way

  let body = parts.join("\n- ");
  const anchor =
    "## RESUME ANCHOR (regenerated from disk every turn — authoritative)\n" +
    "Your conversation history may have been summarized by autocompaction. The\n" +
    "facts below were just read from the filesystem, so they are correct even when\n" +
    "your recollection is not. Trust them over memory.\n" +
    "- " +
    body +
    "\nDo not redo work whose output already exists. If a PRODUCE file is MISSING,\n" +
    "that work is still owed. When in doubt, re-read the files named above before\n" +
    "acting — do not ask the user where you were.";

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
            "Prefer dropping narrative over dropping any of those four." +
            (anchor ? "\n\nCurrent on-disk state:\n" + anchor : ""),
        );
      } catch {
        // Compaction must proceed even if we cannot contribute to it.
      }
    },
  };
};
