// plugins/lib/turn-cap.ts — pure turn-budget logic (TOKEN_OPTIMIZATION_PLAN D1).
// NO opencode imports: shared by the v1 plugin shell (plugins/expert-hooks.ts) and
// the v2 shell (plugins-v2/expert-hooks/index.ts). Seam for WP-X1 (stall guard) and
// WP-X3 (compaction trigger): add sibling modules, wire them in both shells.
//
// EXPERTS_MAX_TURNS=<n> (default 150 when unset, 0 = off) makes the budget mechanical: after n completed assistant
// turns every further tool call is refused EXCEPT writes under docs/work/ and
// docs/reviews/, so the agent can update its ledger, write its Completion
// Manifest and stop cleanly (the conductor then resumes in a fresh session).

export const WRITE_TOOLS = new Set(["write", "edit", "multiedit"]);
export const LEDGER_DIR_RE = /(^|\/)docs\/(work|reviews)\//;

/** Default budget when EXPERTS_MAX_TURNS is unset (WP-X1): one 602-turn session burned 46.6M input tokens. */
export const DEFAULT_MAX_TURNS = 150;

// The conductor exports no "I am the conductor" marker, only EXPERTS_MAX_TURNS itself (set whenever its
// --max-turns > 0, default 120). So "unset" is the signal for "not under the conductor": it gets
// DEFAULT_MAX_TURNS. An explicit EXPERTS_MAX_TURNS=0 (or garbage) still means off.
export function parseMaxTurns(env: Record<string, string | undefined>): number {
  const raw = env.EXPERTS_MAX_TURNS;
  if (raw === undefined || raw === "") return DEFAULT_MAX_TURNS;
  return Number(raw) || 0;
}

export function turnCapMessage(turns: number, max: number): string {
  return (
    `TURN BUDGET REACHED: this session has completed ${turns} assistant turns (limit ${max}, EXPERTS_MAX_TURNS). ` +
    `No further tool calls are allowed except writes under docs/work/ and docs/reviews/. ` +
    `Do this now, in order: (1) update docs/work/TASKS_*.md so every checkbox reflects what is on disk; ` +
    `(2) write your Completion Manifest with "Partial output — turn budget reached. Remaining items: [list]"; ` +
    `(3) print BLOCKED: turn budget reached, and stop. The orchestrator resumes from the ledger in a fresh session.`
  );
}

/** The refusal message when the cap is hit and this call is not a ledger write; otherwise null. */
export function turnCapDecision(o: { turns: number; max: number; tool: string; filePath?: string }): string | null {
  if (!(o.max > 0) || o.turns < o.max) return null;
  const ledgerWrite = WRITE_TOOLS.has(o.tool) && LEDGER_DIR_RE.test(o.filePath ?? "");
  return ledgerWrite ? null : turnCapMessage(o.turns, o.max);
}

/** Per-session completed-assistant-turn counter; each message id is counted once. */
export function createTurnCounter(max: number) {
  const bySession = new Map<string, number>();
  const counted = new Set<string>();
  return {
    get: (sessionID: string) => bySession.get(sessionID) ?? 0,
    /** Count a completed assistant message. Returns the new count, or null when not counted. */
    record(sessionID: string | undefined, messageID: string | undefined, completed: unknown): number | null {
      if (!(max > 0) || !completed || !sessionID || !messageID || counted.has(messageID)) return null;
      counted.add(messageID);
      if (counted.size > 5000) counted.clear();
      const n = (bySession.get(sessionID) ?? 0) + 1;
      bySession.set(sessionID, n);
      return n;
    },
  };
}
