import type { Plugin } from "@opencode-ai/plugin";
import { logSessionReceipt } from "../scripts/lib/session-receipt.mjs";
import { beforeToolCheck } from "./lib/guards.ts";
import { createAfterToolHandler } from "./lib/post-edit.ts";
import { createAssistantMessageHandler } from "./lib/telemetry.ts";
import { createStallGuard, stallAbortDecision } from "./lib/stall-guard.ts";
import { WRITE_TOOLS, createTurnCounter, parseMaxTurns, turnCapMessage } from "./lib/turn-cap.ts";
import { parseToolOutputMax } from "./lib/tool-output.ts";

// expert-hooks.ts — opencode v1 plugin SHELL (WP-V1). The logic lives in plugins/lib/*.ts (pure, no
// opencode imports) and is shared with plugins-v2/expert-hooks/index.ts. Edit behaviour in the lib.
//
// Ports the high-value subset of attest-claude' hooks to opencode's
// plugin surface. Four phases:
//
//   tool.execute.before   block dangerous bash commands; block writes to
//                         .env / credential / key files; enforce the
//                         EXPERTS_MAX_TURNS turn budget (see below).
//
//   tool.execute.after    bound read/grep/glob/list/bash results to
//                         EXPERTS_TOOL_OUTPUT_MAX chars (head + tail + an
//                         omission marker with a re-query hint), so one big
//                         result cannot be re-sent on every later turn.
//
//   tool.execute.after    after a write/edit, run format → lint → type-check
//                         → secret-scan against the file. All formatters
//                         are best-effort: failures inform the LLM via
//                         console.warn but never block the workflow.
//
//   event (session)       G1 session-model receipt (T30.2, M30 model-tier
//                         guard): on the FIRST assistant message of a
//                         session, resolve the tier of the model that's
//                         actually running (against the project's own
//                         models.json `tiers` registry, T30.1) and log it
//                         to docs/work/session-receipts.jsonl + a
//                         console.log first line — the exact "opus ran
//                         silently and nobody knew" incident this module
//                         exists to prevent. Disable: EXPERTS_TELEMETRY=0.
//
//   event (telemetry)     telemetry (plan 4.12): on every completed
//                         assistant message, append one JSONL row of
//                         ACTUALS (agent, model, tokens in/out/reasoning,
//                         cache, cost, duration) to the project's
//                         docs/work/telemetry.jsonl. Counts only — never
//                         message content. Disable: EXPERTS_TELEMETRY=0.
//                         Analyze: scripts/telemetry-report.mjs.
//
//   event (stall guard)  WP-X1: warn at 4 / abort at 6 consecutive repeated-or-empty assistant turns
//                         (EXPERTS_STALL_WARN / EXPERTS_STALL_ABORT, 0 disables); abort refuses further
//                         tool calls like the turn cap and logs a source:"stall" telemetry row.
//
// Skipped hooks (different abstraction, not portable as plugins):
//   - commit-validator.sh  → use a git pre-commit hook in the user's repo
//   - test-on-stop.sh      → no clean session.idle "wind down" semantic;
//                            users invoke /test-expert when ready

// Turn cap (TOKEN_OPTIMIZATION_PLAN D1) — see plugins/lib/turn-cap.ts. Read once at load, as before.
const MAX_TURNS = parseMaxTurns(process.env);
const TOOL_OUTPUT_MAX = parseToolOutputMax(process.env);
const turns = createTurnCounter(MAX_TURNS);
// Stall guard (WP-X1, D1b) — see plugins/lib/stall-guard.ts. EXPERTS_STALL_WARN / EXPERTS_STALL_ABORT, 0 disables.
const stall = createStallGuard();

// Module-level so once-only state is shared across plugin instances, as it always was.
const onAssistantMessage = createAssistantMessageHandler({ turns, maxTurns: MAX_TURNS, turnCapMessage, logSessionReceipt, stall });

export const ExpertHooks: Plugin = async ({ $ }) => {
  const gated = new Map<string, number>();
  const afterTool = createAfterToolHandler({ $, toolOutputMax: TOOL_OUTPUT_MAX });
  return {
    "tool.execute.before": async (input, output) => {
      // opencode passes the call arguments in `output.args` here (input.args exists
      // only in tool.execute.after) — reading input.args made every guard below a no-op.
      const args = (output as any)?.args ?? (input as any).args ?? {};
      const stallMsg = stallAbortDecision({ aborted: stall.isAborted(input.sessionID), turns: stall.turns(input.sessionID), tool: input.tool, filePath: args?.filePath ?? args?.file_path ?? "" });
      if (stallMsg) throw new Error(stallMsg);
      beforeToolCheck({ tool: input.tool, sessionID: input.sessionID, args, gated, turns: turns.get(input.sessionID), maxTurns: MAX_TURNS });
    },

    "tool.execute.after": async (input, output) => {
      if (WRITE_TOOLS.has(input.tool)) stall.noteWrite(input.sessionID);
      return afterTool(input, output);
    },

    event: async ({ event }) => {
      if ((event as any).type === "message.part.updated") {
        const part = (event as any).properties?.part;
        if (part?.type === "text") stall.noteText(part.messageID, part.text);
        return;
      }
      if (event.type !== "message.updated") return;
      onAssistantMessage((event as any).properties?.info);
    },
  };
};

// ─── Why this file exports ONLY its Plugin ───────────────────────────
// A file in plugins/ must export ONLY its Plugin: OpenCode's loader calls every
// export as a plugin factory, so the helpers that used to live here were invoked
// with the loader's own context object — "glob.replace is not a function" — and
// the ENTIRE plugin (bash blocking, credential-write blocking, post-edit scans,
// telemetry, receipts) silently failed to load on every session. resume-anchor.ts
// exports only its Plugin and has never failed; that is the control case.
// Everything else now lives in plugins/lib/ (a subdirectory — the loader only globs
// top-level plugins/*.ts) and scripts/lib/.
