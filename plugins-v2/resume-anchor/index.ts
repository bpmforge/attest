// plugins-v2/resume-anchor/index.ts — OpenCode v2 shell for resume-anchor (WP-V1).
// Logic lives in plugins/lib/resume-anchor-text.ts (shared with the v1 shell plugins/resume-anchor.ts).
// NOT type-checked here (no @opencode/plugin v2 package in the dev env) — ASSUMPTIONs flagged in the manifest.
import { Plugin } from "@opencode/plugin";
import { anchorForRequest, buildAnchor, compactionContext, createAnchorSessions, enabled } from "../../plugins/lib/resume-anchor-text.ts";

export default Plugin.define({
  id: "attest.resume-anchor",
  async setup(ctx: any) {
    // WP-X6: per-session cadence state. ASSUMPTION: the hook event carries sessionID (else one shared "_" session).
    const sessions = createAnchorSessions();
    // v1 experimental.chat.system.transform -> ctx.session.hook('context'). ASSUMPTION: out.system is a string[].
    ctx.session.hook("context", async (ev: any, out: any) => {
      if (!enabled()) return;
      try {
        const anchor = anchorForRequest(process.cwd(), sessions.next(ev?.sessionID), sessions.every);
        if (anchor) out.system.push(anchor);
      } catch {
        // Never break a session over an optional orientation aid.
      }
    });

    // v1 experimental.session.compacting -> ctx.session.hook('compaction'). ASSUMPTION: out.context is a string[].
    ctx.session.hook("compaction", async (ev: any, out: any) => {
      if (!enabled()) return;
      sessions.markCompacted(ev?.sessionID);
      try {
        out.context.push(compactionContext(buildAnchor(process.cwd())));
      } catch {
        // Compaction must proceed even if we cannot contribute to it.
      }
    });
  },
});
