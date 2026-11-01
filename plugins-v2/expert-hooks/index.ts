// plugins-v2/expert-hooks/index.ts — OpenCode v2 shell for expert-hooks.
//
// v2 plugins are DIRECTORIES: `import { Plugin } from '@opencode/plugin'; export default Plugin.define({ id, setup(ctx) })`.
// All logic is shared with the v1 shell (plugins/expert-hooks.ts) through plugins/lib/*.ts — keep this file thin.
// Installed to <config>/plugins/expert-hooks/index.ts by install.sh (v2), next to <config>/plugins/lib/ and
// <config>/scripts/lib/, which is why the relative imports below are the same in the repo and in the install.
//
// TYPE-CHECKED (strict) against the real @opencode/plugin 2.2.5 by scripts/test-plugins-v2-types.ts, and load-smoked on the
// real `opencode` 2.2.5 binary (docs/reviews/MANIFEST_V1b-opencode-v2-contracts.md). The contracts below are VERIFIED
// from the installed .d.ts files, not guessed:
//   - ctx has NO `client` and NO `$`: telemetry/compaction use ctx.session + ctx.event, shell commands use plugins/lib/shell-shim.ts.
//   - ctx.tool.hook(name, cb): ONE mutable event, no (input, output) pair.
//       execute.before { tool, sessionID, agent, messageID, id, input }            (input/tool mutable)
//       execute.after  { ...same } & ({status:'completed', result:Tool.Result} | {status:'error', error:Tool.Error})
//     Tool.Result = { output?, content?: string | Content[], metadata? } — the model sees `content`, so truncation edits it.
//   - ctx.event.subscribe({types, signal}) is an AsyncIterable of { id, created, type, data } — run as a detached loop, abort in cleanup.
//   - ctx.session.compact({ sessionID, id?, delivery? }) requests a compaction (there is no `summarize`).
//   - ctx.location.directory is the project root (the server may be a shared background service, so process.cwd() is NOT the project).
import { Plugin } from "@opencode/plugin";
import { logSessionReceipt } from "../../scripts/lib/session-receipt.mjs";
import { beforeToolCheck } from "../../plugins/lib/guards.ts";
import { createAfterToolHandler } from "../../plugins/lib/post-edit.ts";
import { shellShim } from "../../plugins/lib/shell-shim.ts";
import { createAssistantMessageHandler } from "../../plugins/lib/telemetry.ts";
import { allTools } from "../../plugins/lib/tools/index.ts";
import { createStallGuard, stallAbortDecision } from "../../plugins/lib/stall-guard.ts";
import { createCompactionHandler, createCompactionTrigger, createThresholdResolver } from "../../plugins/lib/compaction-trigger.ts";
import { WRITE_TOOLS, createTurnCounter, parseMaxTurns, turnCapMessage } from "../../plugins/lib/turn-cap.ts";
import { parseToolOutputMax, toolResultText, truncateToolResultContent } from "../../plugins/lib/tool-output.ts";
import { canonicalArgs, canonicalTool, v2ToolOptions } from "../../plugins/lib/v2-tools.ts";
import { createStepAdapter, type V2StepEnded, type V2StepFailed, type V2StepStarted } from "../../plugins/lib/v2-events.ts";

const MAX_TURNS = parseMaxTurns(process.env);
const TOOL_OUTPUT_MAX = parseToolOutputMax(process.env);

// v2 built-ins are `shell` (v1: bash) and take `path` (v1: filePath); plugins/lib/v2-tools.ts maps both so every shared guard,
// the turn-cap ledger exemption, truncation and the post-edit checks see the names and arguments they were written against.

export default Plugin.define({
  id: "attest.expert-hooks",
  async setup(ctx) {
    // Per plugin instance (v2 may load the plugin once per location), unlike v1's module-level state.
    const turns = createTurnCounter(MAX_TURNS);
    const stall = createStallGuard();
    const root = () => String(ctx.location.directory);
    const steps = createStepAdapter(root);
    const onAssistantMessage = createAssistantMessageHandler({ turns, maxTurns: MAX_TURNS, turnCapMessage, logSessionReceipt, stall, cwd: root });
    const gated = new Map<string, number>();
    // ctx has no `$`: post-edit checks run through the child_process shim. The shell truncates `result.content` itself.
    const afterTool = createAfterToolHandler({ $: shellShim, toolOutputMax: TOOL_OUTPUT_MAX, truncate: false });

    // WP-X3 trigger: PREFERRED v2 knob is native — `compaction.keep.tokens` in opencode.json. This is the harness-side fallback.
    // Request = ctx.session.compact (verified); `delivery` is left to the host default. A rejection degrades to the "/compact" directive.
    const compaction = createCompactionHandler({
      trigger: createCompactionTrigger({ thresholdFor: createThresholdResolver() }),
      cwd: root,
      request: async (sessionID) => {
        await ctx.session.compact({ sessionID });
      },
    });

    // v1 tool.execute.before -> execute.before. Guards throw (the root export has no Tool.Error to construct).
    const beforeReg = await ctx.tool.hook("execute.before", (ev) => {
      const tool = canonicalTool(ev.tool);
      const args = canonicalArgs(ev.input);
      const filePath = args.filePath ?? args.file_path ?? "";
      const stallMsg = stallAbortDecision({ aborted: stall.isAborted(ev.sessionID), turns: stall.turns(ev.sessionID), tool, filePath });
      if (stallMsg) throw new Error(stallMsg);
      beforeToolCheck({ tool, sessionID: ev.sessionID, args, gated, turns: turns.get(ev.sessionID), maxTurns: MAX_TURNS });
    });

    // v1 tool.execute.after -> execute.after. Truncate the model-visible `result.content` (completed calls only).
    const afterReg = await ctx.tool.hook("execute.after", async (ev) => {
      const tool = canonicalTool(ev.tool);
      if (WRITE_TOOLS.has(tool) && ev.status === "completed") stall.noteWrite(ev.sessionID);
      const args = canonicalArgs(ev.input);
      if (ev.status === "completed") {
        const cut = truncateToolResultContent(tool, ev.result.content, TOOL_OUTPUT_MAX);
        if (cut) {
          ev.result = {
            ...ev.result,
            content: cut.content as NonNullable<typeof ev.result.content>,
            metadata: { ...(ev.result.metadata ?? {}), truncatedBy: "expert-hooks", originalLength: cut.originalLength },
          };
        }
      }
      // Trace + post-edit checks (format/lint/tsc/secret-scan) only for completed calls; a failed write changed nothing.
      if (ev.status !== "completed") return;
      await afterTool({ tool, sessionID: ev.sessionID, callID: ev.id, args }, { output: toolResultText(ev.result) });
    });

    // v1 `event` hook -> a detached subscription loop. The stall guard's text and the telemetry/turn/compaction numbers come
    // from the durable step events (see plugins/lib/v2-events.ts for why not usage.updated / message.content.updated).
    const abort = new AbortController();
    void (async () => {
      try {
        for await (const ev of ctx.event.subscribe({
          signal: abort.signal,
          types: ["session.step.started", "session.step.ended", "session.step.failed", "session.text.ended", "session.compaction.ended"],
        })) {
          try {
            switch (ev.type) {
              case "session.step.started":
                // Earliest observable point for the once-per-session model receipt (in-flight: no `completed`).
                onAssistantMessage(steps.stepStarted(ev.data as unknown as V2StepStarted));
                break;
              case "session.text.ended":
                stall.noteText(ev.data.assistantMessageID, ev.data.text);
                break;
              case "session.step.ended": {
                const info = steps.stepEnded(ev.data as unknown as V2StepEnded, ev.created);
                onAssistantMessage(info);
                void compaction.onAssistantMessage(info);
                break;
              }
              case "session.step.failed": {
                const info = steps.stepFailed(ev.data as unknown as V2StepFailed, ev.created);
                onAssistantMessage(info);
                void compaction.onAssistantMessage(info);
                break;
              }
              case "session.compaction.ended":
                compaction.onCompacted(ev.data.sessionID);
                break;
              default:
                break;
            }
          } catch {
            // A handler bug must never end the subscription (or the session).
          }
        }
      } catch {
        // Aborted by cleanup, or the host closed the stream: stop quietly.
      }
    })();

    // v1 tool() helper is gone: register every shared tool in ONE transform. The callback is replayed, so it is synchronous and
    // side-effect free. The shared tools read `context.directory` and call `context.metadata(...)` (v1 ToolContext); v2's
    // Tool.Context has neither, so they are supplied from ctx.location and toolCtx.progress. Results are wrapped as
    // Tool.Result `{ content }`. `options` (verified on the real binary): without `codemode: false` a plugin tool is hidden behind
    // Code Mode and the model cannot call it by name; `permission` makes the host assert that action before the tool runs.
    const toolReg = await ctx.tool.transform((editor) => {
      for (const t of allTools) {
        editor.add({
          name: t.name,
          description: t.description,
          input: t.inputSchema,
          options: v2ToolOptions(t.name),
          execute: async (input, toolCtx) => {
            const out = await t.execute(input, {
              ...toolCtx,
              directory: root(),
              worktree: String(ctx.location.project.directory),
              metadata: (m: Record<string, unknown>) => void toolCtx.progress(m).catch(() => undefined),
            });
            return { content: typeof out === "string" ? out : JSON.stringify(out ?? "") };
          },
        });
      }
    });

    return async () => {
      abort.abort();
      await Promise.allSettled([beforeReg.dispose(), afterReg.dispose(), toolReg.dispose()]);
    };
  },
});
