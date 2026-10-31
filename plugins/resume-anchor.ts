import type { Plugin } from "@opencode-ai/plugin";
import { buildAnchor, compactionContext, enabled } from "./lib/resume-anchor-text.ts";

// resume-anchor.ts — opencode v1 plugin SHELL. All logic (and the long field-trace history) lives in
// plugins/lib/resume-anchor-text.ts; the v2 shell is plugins-v2/resume-anchor/index.ts.
//
// Two hooks, unequal weight:
//   experimental.chat.system.transform   (load-bearing) — inject the anchor every request.
//   experimental.session.compacting      (best-effort) — name the pointers that must survive summarization.
// Disable with EXPERTS_RESUME_ANCHOR=0.
//
// A file in plugins/ must export ONLY its Plugin (see the note at the bottom of expert-hooks.ts).

export const ResumeAnchor: Plugin = async () => {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      if (!enabled()) return;
      try {
        const anchor = buildAnchor(process.cwd());
        if (anchor) output.system.push(anchor);
      } catch {
        // Never break a session over an optional orientation aid.
      }
    },

    // Append to `context`; never set `prompt` — replacing opencode's default summarizer is untested.
    "experimental.session.compacting": async (_input, output) => {
      if (!enabled()) return;
      try {
        output.context.push(compactionContext(buildAnchor(process.cwd())));
      } catch {
        // Compaction must proceed even if we cannot contribute to it.
      }
    },
  };
};
