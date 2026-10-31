// plugins-v2/expert-hooks/index.ts — OpenCode v2 shell for expert-hooks (WP-V1).
//
// v2 plugins are DIRECTORIES: `import { Plugin } from '@opencode/plugin'; export default Plugin.define({ id, setup(ctx) })`.
// All logic is shared with the v1 shell (plugins/expert-hooks.ts) through plugins/lib/*.ts — keep this file thin.
// Installed to <config>/plugins/expert-hooks/index.ts by install.sh (v2), next to <config>/plugins/lib/ and
// <config>/scripts/lib/, which is why the relative import below is the same in the repo and in the install.
//
// NOT type-checked or run here: the `@opencode/plugin` v2 package is not available in the repo's dev
// environment. Every payload shape below marked ASSUMPTION comes from the v1->v2 migration guide's hook NAMES
// only — verify on a real v2 install (manifest: VERIFY ON MAC).
import { Plugin } from "@opencode/plugin";
import { logSessionReceipt } from "../../scripts/lib/session-receipt.mjs";
import { beforeToolCheck } from "../../plugins/lib/guards.ts";
import { createAfterToolHandler } from "../../plugins/lib/post-edit.ts";
import { shellShim } from "../../plugins/lib/shell-shim.ts";
import { createAssistantMessageHandler } from "../../plugins/lib/telemetry.ts";
import { allTools } from "../../plugins/lib/tools/index.ts";
import { createTurnCounter, parseMaxTurns, turnCapMessage } from "../../plugins/lib/turn-cap.ts";
import { parseToolOutputMax } from "../../plugins/lib/tool-output.ts";

const MAX_TURNS = parseMaxTurns(process.env);
const TOOL_OUTPUT_MAX = parseToolOutputMax(process.env);
const turns = createTurnCounter(MAX_TURNS);
const onAssistantMessage = createAssistantMessageHandler({ turns, maxTurns: MAX_TURNS, turnCapMessage, logSessionReceipt });

export default Plugin.define({
  id: "attest.expert-hooks",
  async setup(ctx: any) {
    const gated = new Map<string, number>();
    // ASSUMPTION: ctx may expose a Bun-style `$`; fall back to the child_process shim otherwise.
    const afterTool = createAfterToolHandler({ $: ctx.$ ?? shellShim, toolOutputMax: TOOL_OUTPUT_MAX });

    // v1 tool.execute.before -> ctx.tool.hook('execute.before'). ASSUMPTION: event carries { tool, sessionID, args }.
    ctx.tool.hook("execute.before", async (ev: any) => {
      beforeToolCheck({
        tool: ev.tool,
        sessionID: ev.sessionID,
        args: ev.args ?? ev.input ?? {},
        gated,
        turns: turns.get(ev.sessionID),
        maxTurns: MAX_TURNS,
      });
    });

    // v1 tool.execute.after -> ctx.tool.hook('execute.after'). ASSUMPTION: (ev, out) with out.output a string.
    ctx.tool.hook("execute.after", async (ev: any, out: any) => {
      await afterTool({ tool: ev.tool, sessionID: ev.sessionID, callID: ev.callID, args: ev.args ?? ev.input ?? {} }, out);
    });

    // v1 chat.message -> ctx.session.hook('prompt'). Seam for WP-X1 (stall guard) — nothing to do yet.
    ctx.session.hook("prompt", async () => {});

    // Compaction/context injection is owned by plugins-v2/resume-anchor; WP-X3 adds its trigger here.

    // v1 `event` -> ctx.event.subscribe(). ASSUMPTION: still delivers { type: 'message.updated', properties: { info } }.
    ctx.event.subscribe((event: any) => {
      if (event?.type !== "message.updated") return;
      onAssistantMessage(event.properties?.info);
    });

    // v1 tool() helper is gone: register every shared tool through ctx.tool.transform. ASSUMPTION: the editor's
    // add() takes { name, description, input (JSON Schema), execute(args, ctx) }.
    ctx.tool.transform((editor: any) => {
      for (const t of allTools) {
        editor.add({ name: t.name, description: t.description, input: t.inputSchema, execute: t.execute });
      }
    });
  },
});
