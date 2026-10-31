// plugins/lib/telemetry.ts — pure telemetry + assistant-message event handling (plan 4.12).
// NO opencode imports. Append-only JSONL of ACTUALS to <project>/docs/work/telemetry.jsonl:
// counts and identifiers only — never message content. Disable: EXPERTS_TELEMETRY=0.
// Seam for WP-X1: the stall guard consumes the same `info` stream via `onMessage`.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export function logTelemetry(projectRoot: string, row: Record<string, unknown>): void {
  try {
    const file = join(projectRoot, "docs", "work", "telemetry.jsonl");
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(row) + "\n");
  } catch {
    // Telemetry must never break the session — silent.
  }
}

/** One telemetry row from a completed assistant message `info` (shape shared by v1 events and, assumed, v2). */
export function buildTelemetryRow(info: any): Record<string, unknown> {
  return {
    ts: new Date(info.time.completed).toISOString(),
    source: "plugin",
    session: info.sessionID,
    message: info.id,
    agent: info.mode ?? null,
    model: `${info.providerID}/${info.modelID}`,
    duration_ms: info.time.completed - info.time.created,
    tokens_in: info.tokens?.input ?? 0,
    tokens_out: info.tokens?.output ?? 0,
    tokens_reasoning: info.tokens?.reasoning ?? 0,
    cache_read: info.tokens?.cache?.read ?? 0,
    cache_write: info.tokens?.cache?.write ?? 0,
    cost: info.cost ?? 0,
    finish: info.finish ?? null,
    error: info.error?.name ?? null,
    error_detail: info.error?.message ? String(info.error.message).slice(0, 200) : null,
  };
}

/**
 * Operator-facing warnings for a completed assistant message: provider stream failure
 * (TUI capture 2026-10-21) and output-cap hit (finish=length). Named where they happen so
 * they are not read as "the agent is looping".
 */
export function streamWarnings(info: any): string[] {
  const out: string[] = [];
  if (info.error || (info.finish && !["stop", "tool-calls", "length"].includes(String(info.finish)))) {
    out.push(
      `[expert-hooks] provider stream did not complete (${info.error?.name ?? `finish=${info.finish}`}${info.error?.message ? `: ${String(info.error.message).slice(0, 160)}` : ""}) on ${info.providerID}/${info.modelID} after ${info.tokens?.output ?? "?"} output tokens. ` +
        `opencode retries; the partial text shown above is from the failed attempt, not the agent repeating itself. ` +
        `If this recurs, route this role to a more reliable model in models.json (roles.* / agents.*) or raise the provider's timeout.`,
    );
  }
  if (info.finish === "length") {
    out.push(
      `[expert-hooks] reply hit the model's OUTPUT CAP (finish=length, ${info.tokens?.output ?? "?"} output tokens, ${info.providerID}/${info.modelID}). ` +
        `The TUI will show it cut off and regenerated. Raise provider.${info.providerID}.models.${info.modelID}.limit.output in opencode.json (or the server's max_tokens), ` +
        `and keep turn-ending replies short — the handoff reply is five lines (handoff-emit.sh).`,
    );
  }
  return out;
}

export interface MessageHandlerDeps {
  /** Turn counter (plugins/lib/turn-cap.ts createTurnCounter). */
  turns: { record(sessionID: string | undefined, messageID: string | undefined, completed: unknown): number | null };
  maxTurns: number;
  turnCapMessage: (turns: number, max: number) => string;
  /** G1 session-model receipt (scripts/lib/session-receipt.mjs logSessionReceipt). */
  logSessionReceipt: (root: string, info: any) => void;
  env?: Record<string, string | undefined>;
  warn?: (msg: string) => void;
  cwd?: () => string;
}

/**
 * Handler for a (possibly partial) assistant message update. Shared by the v1 `event` hook
 * (message.updated) and the v2 `ctx.event.subscribe` shell. Holds the once-only sets.
 */
export function createAssistantMessageHandler(deps: MessageHandlerDeps) {
  const sessionModelLogged = new Set<string>();
  const loggedMessages = new Set<string>();
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const env = deps.env ?? process.env;
  return function onAssistantMessage(info: any): void {
    if (!info || info.role !== "assistant") return;

    // Turn counting is independent of telemetry: a budget that switches off
    // with EXPERTS_TELEMETRY=0 is not a budget.
    const n = deps.turns.record(info.sessionID, info.id, info.time?.completed);
    if (n !== null && n === deps.maxTurns) warn(`[expert-hooks] ${deps.turnCapMessage(n, deps.maxTurns)}`);

    if (env.EXPERTS_TELEMETRY === "0") return;

    // G1 — session-model receipt (T30.2): once per session, on the first assistant message
    // seen (providerID/modelID exist at creation, the earliest observable point).
    if (!sessionModelLogged.has(info.sessionID)) {
      sessionModelLogged.add(info.sessionID);
      if (sessionModelLogged.size > 5000) sessionModelLogged.clear();
      deps.logSessionReceipt(info.path?.root ?? (deps.cwd ?? process.cwd)(), info);
    }

    // Only completed assistant messages beyond this point.
    if (!info.time?.completed) return;
    if (loggedMessages.has(info.id)) return;
    loggedMessages.add(info.id);
    if (loggedMessages.size > 5000) loggedMessages.clear();

    for (const w of streamWarnings(info)) warn(w);
    logTelemetry(info.path?.root ?? (deps.cwd ?? process.cwd)(), buildTelemetryRow(info));
  };
}
