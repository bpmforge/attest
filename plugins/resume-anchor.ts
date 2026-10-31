import type { Plugin } from "@opencode-ai/plugin";
import { anchorForRequest, buildAnchor, compactionContext, createAnchorSessions, enabled } from "./lib/resume-anchor-text.ts";

// resume-anchor.ts — opencode v1 plugin SHELL. All logic (and the long field-trace history) lives in
// plugins/lib/resume-anchor-text.ts; the v2 shell is plugins-v2/resume-anchor/index.ts.
//
// Two hooks, unequal weight:
//   experimental.chat.system.transform   (load-bearing) — inject the anchor every request.
//   experimental.session.compacting      (best-effort) — name the pointers that must survive summarization.
// Disable with EXPERTS_RESUME_ANCHOR=0.
// WP-X3: the proactive compaction trigger lives in expert-hooks.ts (it needs the assistant-message stream); it REQUESTS
// compaction via client.session.summarize, which runs OpenCode's normal compaction — i.e. the compacting hook below
// fires for it too, so the pointers survive. This shell needs no change; it still marks the session compacted for WP-X6.
//
// A file in plugins/ must export ONLY its Plugin (see the note at the bottom of expert-hooks.ts).

export const ResumeAnchor: Plugin = async () => {
  // WP-X6: per-session turn / last-full / compaction state (EXPERTS_ANCHOR_EVERY, default 10; 0 or 1 = always full).
  const sessions = createAnchorSessions();
  return {
    "experimental.chat.system.transform": async (input: any, output) => {
      if (!enabled()) return;
      try {
        const anchor = anchorForRequest(process.cwd(), sessions.next(input?.sessionID), sessions.every);
        if (anchor) output.system.push(anchor);
      } catch {
        // Never break a session over an optional orientation aid.
      }
    },

    // Append to `context`; never set `prompt` — replacing opencode's default summarizer is untested.
    "experimental.session.compacting": async (input: any, output) => {
      if (!enabled()) return;
      sessions.markCompacted(input?.sessionID);
      try {
        output.context.push(compactionContext(buildAnchor(process.cwd())));
      } catch {
        // Compaction must proceed even if we cannot contribute to it.
      }
    },
  };
};
