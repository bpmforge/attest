// plugins/lib/stall-guard.ts — pure repeat-output / empty-turn stall detector (WP-X1, TOKEN_OPTIMIZATION_PLAN D1b).
// NO opencode imports: shared by the v1 shell (plugins/expert-hooks.ts) and the v2 shell
// (plugins-v2/expert-hooks/index.ts), fed from the same assistant-message stream telemetry.ts consumes.
//
// Why: 37% of all historical input tokens (79.7M of 214M) went to turns that produced <= 20 output tokens;
// one session emitted exactly 16 output tokens for 500+ turns and nothing stopped it. tools/loop-detector.ts
// is model-invoked, so a stuck model never calls it — this is the harness-level backstop.
//
// A turn is STALLED when either
//   - tiny:      tokensOut <= tinyTokens and no file write happened since the previous observation, or
//   - identical: its normalized text hashes (sha256) equal to the previous turn's (non-empty text only).
// The streak is the number of consecutive stalled turns (identical turns count the first one too: four equal
// replies = streak 4). A file write, or a substantive different output, resets it.
// warn fires once per streak at `warnAt`; abort fires once at `abortAt`.
// Env overrides: EXPERTS_STALL_WARN / EXPERTS_STALL_ABORT (integer; 0 disables that level).
import { createHash } from "node:crypto";
import { LEDGER_DIR_RE, WRITE_TOOLS } from "./turn-cap.ts";

export const STALL_DEFAULTS = { warnAt: 4, abortAt: 6, tinyTokens: 20 } as const;

export type StallAction = "none" | "warn" | "abort";
export interface StallResult {
  action: StallAction;
  consecutive: number;
  reason: string;
  /** Assistant turns observed for this session so far. */
  turns: number;
  /** Sum of tokens_in over the turns in the current streak (only when observe() was given tokensIn). */
  tokensInWasted: number;
}

export interface StallObservation {
  sessionID: string;
  messageID?: string;
  text?: string;
  tokensOut: number;
  wroteFile: boolean;
  tokensIn?: number;
}

function envLevel(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function normalizeStallText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function stallWarnMessage(n: number): string {
  return (
    `STALL DETECTED: your last ${n} replies were identical/empty. Re-read the HANDOFF and the task ledger; ` +
    `take ONE concrete tool action or print BLOCKED: <reason>.`
  );
}

export function stallAbortMessage(turns: number): string {
  return `BLOCKED: repeat-output stall after ${turns} turns`;
}

/** The refusal for a tool call in an aborted session; ledger writes stay allowed (as with the turn cap). */
export function stallAbortDecision(o: { aborted: boolean; turns: number; tool: string; filePath?: string }): string | null {
  if (!o.aborted) return null;
  if (WRITE_TOOLS.has(o.tool) && LEDGER_DIR_RE.test(o.filePath ?? "")) return null;
  return (
    `${stallAbortMessage(o.turns)}. The harness stopped this session because it repeated empty/identical output. ` +
    `No further tool calls are allowed except writes under docs/work/ and docs/reviews/: note the stall in your ledger ` +
    `and Completion Manifest, print BLOCKED: repeat-output stall, and stop.`
  );
}

interface SessionState {
  turns: number;
  prevHash: string | null;
  identRun: number;
  tinyRun: number;
  wasted: number;
  warned: boolean;
  aborted: boolean;
}

export function createStallGuard(opts: {
  warnAt?: number;
  abortAt?: number;
  tinyTokens?: number;
  now?: () => number;
  env?: Record<string, string | undefined>;
} = {}) {
  const env = opts.env ?? process.env;
  const warnAt = envLevel(env.EXPERTS_STALL_WARN, opts.warnAt ?? STALL_DEFAULTS.warnAt);
  const abortAt = envLevel(env.EXPERTS_STALL_ABORT, opts.abortAt ?? STALL_DEFAULTS.abortAt);
  const tinyTokens = opts.tinyTokens ?? STALL_DEFAULTS.tinyTokens;
  const now = opts.now ?? Date.now;

  const sessions = new Map<string, SessionState>();
  const seen = new Set<string>();
  const writes = new Set<string>();
  const texts = new Map<string, string>();

  const state = (id: string): SessionState => {
    let s = sessions.get(id);
    if (!s) {
      if (sessions.size > 2000) sessions.clear();
      s = { turns: 0, prevHash: null, identRun: 0, tinyRun: 0, wasted: 0, warned: false, aborted: false };
      sessions.set(id, s);
    }
    return s;
  };

  function observe(o: StallObservation): StallResult {
    const s = state(o.sessionID);
    // A message id is observed once (the event stream re-delivers updates).
    if (o.messageID) {
      if (seen.has(o.messageID)) return { action: "none", consecutive: Math.max(s.identRun >= 2 ? s.identRun : 0, s.tinyRun), reason: "duplicate", turns: s.turns, tokensInWasted: s.wasted };
      seen.add(o.messageID);
      if (seen.size > 5000) seen.clear();
    }
    s.turns++;

    const norm = o.text ? normalizeStallText(o.text) : "";
    const hash = norm ? createHash("sha256").update(norm).digest("hex") : null;
    const tiny = o.tokensOut <= tinyTokens && !o.wroteFile;

    if (o.wroteFile) {
      s.identRun = hash ? 1 : 0;
      s.tinyRun = 0;
    } else {
      s.identRun = hash && hash === s.prevHash ? s.identRun + 1 : hash ? 1 : 0;
      s.tinyRun = tiny ? s.tinyRun + 1 : 0;
    }
    s.prevHash = hash;

    const consecutive = Math.max(s.identRun >= 2 ? s.identRun : 0, s.tinyRun);
    if (consecutive === 0) {
      s.warned = false;
      s.wasted = 0;
      return { action: "none", consecutive, reason: "", turns: s.turns, tokensInWasted: 0 };
    }
    s.wasted += o.tokensIn ?? 0;
    const kind = s.identRun >= 2 && s.identRun >= s.tinyRun ? "identical output" : `<= ${tinyTokens}-token output with no file write`;
    const reason = `${consecutive} consecutive turns of ${kind}`;
    const res = (action: StallAction): StallResult => ({ action, consecutive, reason, turns: s.turns, tokensInWasted: s.wasted });

    if (abortAt > 0 && consecutive >= abortAt && !s.aborted) {
      s.aborted = true;
      return res("abort");
    }
    if (warnAt > 0 && consecutive >= warnAt && !s.warned && !s.aborted) {
      s.warned = true;
      return res("warn");
    }
    return res("none");
  }

  return {
    warnAt,
    abortAt,
    now,
    observe,
    isAborted: (sessionID: string) => sessions.get(sessionID)?.aborted === true,
    turns: (sessionID: string) => sessions.get(sessionID)?.turns ?? 0,
    /** Shell signal: a write/edit tool completed in this session since the last observation. */
    noteWrite(sessionID: string | undefined) { if (sessionID) writes.add(sessionID); },
    /** Shell signal: assistant text of a message (from message.part.updated); the last text part wins. */
    noteText(messageID: string | undefined, text: unknown) {
      if (!messageID || typeof text !== "string") return;
      if (texts.size > 2000) texts.clear();
      texts.set(messageID, text);
    },
    /** Consume the signals gathered for a completed message. */
    signals(sessionID: string, messageID: string): { text: string | undefined; wroteFile: boolean } {
      const wroteFile = writes.delete(sessionID);
      const text = texts.get(messageID);
      texts.delete(messageID);
      return { text, wroteFile };
    },
  };
}

export type StallGuard = ReturnType<typeof createStallGuard>;
