// plugins/lib/compaction-trigger.ts — pure proactive compaction trigger (WP-X3, INCREMENTAL_SCAN_PLAN §10 X3 / §11).
// NO opencode imports: shared by the v1 shell (plugins/expert-hooks.ts) and the v2 shell
// (plugins-v2/expert-hooks/index.ts), fed from the same assistant-message `info` stream as telemetry.ts / stall-guard.ts.
//
// Why: local-model sessions grow to 90-160k input tokens p95 and OpenCode only compacts when IT decides to.
// This module watches the context size of each completed assistant message and, when it crosses a threshold,
//   (1) injects the resume-anchor's compaction directive (compactionContext(buildAnchor(root)) — the text WP-X6's
//       resume-anchor hook uses) through the same channel as the TURN BUDGET / STALL messages (warn()), and
//   (2) REQUESTS a compaction through whatever the shell can reach (see "Request mechanism" below).
//
// Threshold (tokens), first match wins:
//   EXPERTS_COMPACT_AT  0 / "off"      -> trigger disabled
//   EXPERTS_COMPACT_AT  0 < x <= 1     -> fraction of the model's context window (needs context_window, else disabled)
//   EXPERTS_COMPACT_AT  x > 1          -> absolute tokens
//   unset                              -> 0.6 x models.json models["<provider>/<model>"].context_window
//   no window known                    -> null = disabled for that model (logged once, never guessed)
// models.json keys may be exact ids or globs (same `*` globbing as `tiers[].match`; exact key wins, then declaration order).
// `context_window` is written by scripts/sync-model-limits.mjs --write-models from LM Studio's loaded_context_length.
//
// Never fires twice within minGapTurns (default 10) turns of the last fire OR of an observed compaction.
//
// Request mechanism (documented choice):
//   v1 shell — `client.session.summarize({ path:{id}, body:{providerID, modelID} })` from the plugin input's `client`
//              (@opencode-ai/sdk; the same call as /compact). Least invasive: it is OpenCode's own compaction path, so
//              experimental.session.compacting (resume-anchor.ts) still contributes the pointers. `experimental.session.compacting`
//              itself is a compacting-TIME hook and cannot request one. If the call is missing or rejects, the directive
//              message falls back to asking the model to run /compact.
//   v2 shell — VERIFIED (@opencode/plugin 2.2.5): ctx has no `client`; the request is `ctx.session.compact({ sessionID })`
//              (SessionCompactInput = { sessionID, id?, delivery?: 'steer'|'queue' }); a rejection degrades to the directive.
//              Preferred v2 knob is native: opencode.json `compaction.keep.tokens` (docs/UNATTENDED_EXECUTION.md);
//              this trigger stays as the fallback.
// A compaction event tells the trigger a compaction happened: noteCompaction() resets the gap. v1: `session.compacted`;
// v2 (verified): `session.compaction.ended` { sessionID, reason: 'auto'|'manual', text }.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logTelemetry } from "./telemetry.ts";
import { buildAnchor, compactionContext, enabled as anchorEnabled } from "./resume-anchor-text.ts";

export const COMPACT_DEFAULT_FRACTION = 0.6;
export const COMPACT_MIN_GAP_TURNS = 10;

export type CompactAction = "none" | "compact";
export interface CompactResult {
  action: CompactAction;
  threshold: number | null;
  reason: string;
  /** True the first time a model resolved to "no threshold" (so the shell logs it once). */
  disabledFirst?: boolean;
}
export interface CompactObservation {
  sessionID: string;
  model: string;
  tokensIn: number;
  turn: number;
}

function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
}

/** models.json `models[key].context_window` for "provider/model": exact key first, then glob keys in declaration order. */
export function contextWindowFor(model: string, config: any): number | null {
  const models = config?.models;
  if (!model || !models || typeof models !== "object") return null;
  const valid = (v: any) => (Number.isFinite(Number(v?.context_window)) && Number(v.context_window) > 0 ? Math.floor(Number(v.context_window)) : null);
  if (Object.prototype.hasOwnProperty.call(models, model)) {
    const w = valid(models[model]);
    if (w) return w;
  }
  for (const [key, entry] of Object.entries(models)) {
    if (!key.includes("*")) continue;
    if (globToRegExp(key).test(model)) {
      const w = valid(entry);
      if (w) return w;
    }
  }
  return null;
}

/** Threshold in tokens for a model, or null (disabled). Pure: env + models.json config in, number out. */
export function resolveThreshold(model: string, env: Record<string, string | undefined>, config: any): number | null {
  const window = contextWindowFor(model, config);
  const raw = env.EXPERTS_COMPACT_AT?.trim();
  if (raw !== undefined && raw !== "") {
    if (/^(off|false|none)$/i.test(raw)) return null;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      if (n === 0) return null;
      if (n <= 1) return window ? Math.floor(n * window) : null;
      return Math.floor(n);
    }
    // garbage -> fall through to the default
  }
  return window ? Math.floor(COMPACT_DEFAULT_FRACTION * window) : null;
}

/** models.json at <root>, cached per root and re-read never (plugin lifetime = one opencode run). Absent = null. */
const configCache = new Map<string, any>();
export function loadModelsJson(root: string): any {
  if (configCache.has(root)) return configCache.get(root);
  let cfg: any = null;
  try {
    cfg = JSON.parse(readFileSync(join(root, "models.json"), "utf8"));
  } catch {
    /* absent -> no windows known */
  }
  configCache.set(root, cfg);
  return cfg;
}

export function createThresholdResolver(opts: {
  env?: Record<string, string | undefined>;
  root?: () => string;
  loadConfig?: (root: string) => any;
} = {}) {
  const env = opts.env ?? process.env;
  const root = opts.root ?? (() => process.cwd());
  const load = opts.loadConfig ?? loadModelsJson;
  return (model: string): number | null => resolveThreshold(model, env, load(root()));
}

interface SessionState {
  lastEventTurn: number | null;
}

export function createCompactionTrigger(opts: {
  thresholdFor: (model: string) => number | null;
  minGapTurns?: number;
}) {
  const minGap = opts.minGapTurns ?? COMPACT_MIN_GAP_TURNS;
  const sessions = new Map<string, SessionState>();
  const disabledLogged = new Set<string>();
  const state = (id: string): SessionState => {
    let s = sessions.get(id);
    if (!s) {
      if (sessions.size > 2000) sessions.clear();
      s = { lastEventTurn: null };
      sessions.set(id, s);
    }
    return s;
  };

  return {
    minGap,
    observe(o: CompactObservation): CompactResult {
      const threshold = opts.thresholdFor(o.model);
      if (threshold === null || !(threshold > 0)) {
        const first = !disabledLogged.has(o.model);
        if (first) disabledLogged.add(o.model);
        return { action: "none", threshold: null, reason: "no threshold (model context window unknown and EXPERTS_COMPACT_AT unset)", disabledFirst: first };
      }
      if (!(o.tokensIn >= threshold)) return { action: "none", threshold, reason: "below threshold" };
      const s = state(o.sessionID);
      if (s.lastEventTurn !== null && o.turn - s.lastEventTurn < minGap) {
        return { action: "none", threshold, reason: `within ${minGap} turns of the last compaction request/compaction (turn ${s.lastEventTurn})` };
      }
      s.lastEventTurn = o.turn;
      return { action: "compact", threshold, reason: `tokens_in ${o.tokensIn} >= ${threshold}` };
    },
    /** A compaction was observed (session.compacted event / compacting hook): restart the gap from this turn. */
    noteCompaction(sessionID: string | undefined, turn: number): void {
      if (!sessionID) return;
      state(sessionID).lastEventTurn = turn;
    },
  };
}
export type CompactionTrigger = ReturnType<typeof createCompactionTrigger>;

export function compactionRequestMessage(tokensIn: number, threshold: number, directive: string | null, requested: boolean): string {
  return (
    `CONTEXT SIZE: this session's context is ${tokensIn} tokens (compaction threshold ${threshold}, EXPERTS_COMPACT_AT). ` +
    (requested
      ? `The harness has requested a compaction; finish your current step, and after it completes resume from the HANDOFF and the task ledger.`
      : `Run /compact now (finish your current step first), then resume from the HANDOFF and the task ledger.`) +
    (directive ? `\n\n${directive}` : "")
  );
}

export interface CompactionHandlerDeps {
  trigger: CompactionTrigger;
  /** Same injection channel as the turn-cap / stall messages. */
  warn?: (msg: string) => void;
  /** Ask the host to compact this session. Absent or rejecting = directive-only fallback (/compact). */
  request?: (sessionID: string, providerID: string, modelID: string) => Promise<unknown>;
  env?: Record<string, string | undefined>;
  cwd?: () => string;
}

/**
 * Handler for a (possibly partial) assistant message update, called by both shells next to the telemetry/stall handler.
 * Counts completed messages per session (its own turn clock, independent of EXPERTS_MAX_TURNS), observes context size
 * (input + cache read + cache write — what the model actually received), and on 'compact' injects + requests.
 */
export function createCompactionHandler(deps: CompactionHandlerDeps) {
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const env = deps.env ?? process.env;
  const seen = new Set<string>();
  const turns = new Map<string, number>();
  return {
    /** Wire to `session.compacted`. */
    onCompacted(sessionID: string | undefined): void {
      if (sessionID) deps.trigger.noteCompaction(sessionID, turns.get(sessionID) ?? 0);
    },
    async onAssistantMessage(info: any): Promise<void> {
      if (!info || info.role !== "assistant" || !info.time?.completed || !info.sessionID || !info.id || seen.has(info.id)) return;
      seen.add(info.id);
      if (seen.size > 5000) seen.clear();
      const turn = (turns.get(info.sessionID) ?? 0) + 1;
      turns.set(info.sessionID, turn);
      if (info.error) return; // a failed stream's token counts are not a context measurement

      const tokensIn = (info.tokens?.input ?? 0) + (info.tokens?.cache?.read ?? 0) + (info.tokens?.cache?.write ?? 0);
      const model = `${info.providerID}/${info.modelID}`;
      const r = deps.trigger.observe({ sessionID: info.sessionID, model, tokensIn, turn });
      if (r.disabledFirst) warn(`[expert-hooks] compaction trigger disabled for ${model}: ${r.reason}. Add models.json models["${model}"].context_window (scripts/sync-model-limits.mjs --write-models) or set EXPERTS_COMPACT_AT.`);
      if (r.action !== "compact" || r.threshold === null) return;

      const root = info.path?.root ?? (deps.cwd ?? process.cwd)();
      if (env.EXPERTS_TELEMETRY !== "0") {
        logTelemetry(root, {
          ts: new Date().toISOString(), source: "compaction-trigger", session: info.sessionID, turn,
          tokens_in: tokensIn, threshold: r.threshold, model,
        });
      }
      let directive: string | null = null;
      try {
        if (anchorEnabled()) directive = compactionContext(buildAnchor(root));
      } catch {
        /* the directive is an aid; the request still goes out */
      }
      let requested = false;
      if (deps.request) {
        try {
          await deps.request(info.sessionID, info.providerID, info.modelID);
          requested = true;
        } catch {
          requested = false;
        }
      }
      warn(`[expert-hooks] ${compactionRequestMessage(tokensIn, r.threshold, directive, requested)}`);
    },
  };
}
export type CompactionHandler = ReturnType<typeof createCompactionHandler>;
