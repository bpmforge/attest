// plugins-v2/resume-anchor/index.ts — OpenCode v2 shell for resume-anchor.
// Logic lives in plugins/lib/resume-anchor-text.ts (shared with the v1 shell plugins/resume-anchor.ts).
//
// TYPE-CHECKED (strict) against the real @opencode/plugin 2.2.5 and load-smoked on the real binary. VERIFIED contracts:
//   - ctx.session.hook('context', cb): ONE mutable SessionContext { sessionID, model, system: SystemPart[], messages, options, agent, tools }.
//     The system-prompt transform is pushing a `{ type: 'text', text }` SystemPart onto `system` (v1 pushed a string).
//   - ctx.session.hook('compaction', cb): SessionContext + optional `result` (supplying one would skip the model — we never set it).
//     The pointers-that-must-survive text rides in `system` of the summarizer request; v1's `output.context.push` has no equivalent.
//   - 'generate' (SessionContext) is a model request of the agent family and gets the same anchor. 'title' (SessionRequest) is a
//     throw-away one-line title generation: it does NOT get the anchor (no orientation value, pure token cost), by design.
//   - ctx.location.directory is the project root (the server may be a shared background service; process.cwd() is not the project).
import { Plugin } from "@opencode/plugin";
import { anchorForRequest, buildAnchor, compactionContext, createAnchorSessions, enabled } from "../../plugins/lib/resume-anchor-text.ts";

export default Plugin.define({
  id: "attest.resume-anchor",
  async setup(ctx) {
    // WP-X6: per-session cadence state (EXPERTS_ANCHOR_EVERY, default 10; 0 or 1 = always full).
    const sessions = createAnchorSessions();
    const root = () => String(ctx.location.directory);

    // v1 experimental.chat.system.transform -> 'context' (load-bearing: every agent-loop request).
    const onRequest = (ev: { sessionID: string; system: Array<{ type: "text"; text: string }> }) => {
      if (!enabled()) return;
      try {
        const anchor = anchorForRequest(root(), sessions.next(ev.sessionID), sessions.every);
        if (anchor) ev.system.push({ type: "text", text: anchor });
      } catch {
        // Never break a session over an optional orientation aid.
      }
    };
    const contextReg = await ctx.session.hook("context", onRequest);
    const generateReg = await ctx.session.hook("generate", onRequest);

    // v1 experimental.session.compacting (best-effort): name the pointers that must survive summarization.
    const compactionReg = await ctx.session.hook("compaction", (ev) => {
      if (!enabled()) return;
      sessions.markCompacted(ev.sessionID);
      try {
        ev.system.push({ type: "text", text: compactionContext(buildAnchor(root())) });
      } catch {
        // Compaction must proceed even if we cannot contribute to it.
      }
    });

    return async () => {
      await Promise.allSettled([contextReg.dispose(), generateReg.dispose(), compactionReg.dispose()]);
    };
  },
});
