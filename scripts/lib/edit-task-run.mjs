/**
 * edit-task-run.mjs — pure pieces of the gateguard A/B runner (Group K2).
 * Arms: A ungated · B gate + fact request · C ungated + prompt line · D gate, neutral pause message.
 */
import { createHash } from "node:crypto";

export const ARMS = ["A", "B", "C", "D"];
export const PROMPT_LINE_C =
  "Before editing any file, list every file that imports it and the functions your change affects.";

export const gated = (arm) => arm === "B" || arm === "D";

export function promptFor(task, arm) {
  return arm === "C" ? `${task.prompt}\n\n${PROMPT_LINE_C}` : task.prompt;
}

/** Env for one run. Ungated arms carry NO gateguard flags (not "0"): they must be byte-identical to a plain session. */
export function armEnv(arm, { workdir, gateLog, traceLog }) {
  const env = { WORKDIR: workdir, EXPERTS_TRACE_LOG: traceLog };
  if (gated(arm)) {
    env.EXPERTS_GATEGUARD = "1";
    env.EXPERTS_GATEGUARD_LOG = gateLog;
    if (arm === "D") env.EXPERTS_GATEGUARD_NEUTRAL = "1";
  }
  return env;
}

/** Deterministic shuffle (seeded) so arm/task order does not drift with time-of-day / cache warmth. */
export function shuffled(items, seed) {
  const a = [...items];
  let h = createHash("sha256").update(String(seed)).digest();
  let i = 0;
  const rnd = () => { if (i >= h.length - 4) { h = createHash("sha256").update(h).digest(); i = 0; } const v = h.readUInt32BE(i); i += 4; return v / 2 ** 32; };
  for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; }
  return a;
}

const READ_TOOLS = new Set(["read", "grep", "glob", "list", "codesearch", "search"]);
const READ_CMD = /\b(grep|rg|ag|find|cat|head|tail|ls|git\s+grep)\b/;
const WRITE_TOOLS = new Set(["write", "edit", "multiedit", "patch", "apply_patch"]);
const BASH_WRITE = /(\bsed\s+-i|>>?\s*[^\s|&]|\btee\b|\bcp\b|\bmv\b|python3?\s+-c|node\s+-e|perl\s+-[a-z]*i)/;

/**
 * gateRows  : rows from EXPERTS_GATEGUARD_LOG ({ts,file,...})
 * traceRows : rows from EXPERTS_TRACE_LOG ({seq,ts,tool,file,cmd,...})
 * hiddenMarkers: strings that betray a peek at the hidden test (its dir/path)
 */
export function scoreRun({ arm, gateRows = [], traceRows = [], hiddenMarkers = [] }) {
  const denies = gateRows.length;
  const fired = denies > 0;
  // facts given: between a deny and the NEXT write of that file, did the agent read/search anything?
  let factsGiven = null;
  if (fired) {
    factsGiven = gateRows.every((d) => {
      const after = traceRows.filter((t) => t.ts >= d.ts).sort((a, b) => a.seq - b.seq);
      const next = after.findIndex((t) => WRITE_TOOLS.has(String(t.tool).toLowerCase()) && t.file === d.file);
      const between = next === -1 ? after : after.slice(0, next);
      return between.some((t) => READ_TOOLS.has(String(t.tool).toLowerCase()) || (String(t.tool).toLowerCase() === "bash" && READ_CMD.test(t.cmd ?? "")));
    });
  }
  const tools = [...new Set(traceRows.map((t) => String(t.tool).toLowerCase()))].sort();
  const gamed = traceRows.some((t) => hiddenMarkers.some((m) => m && `${t.file ?? ""} ${t.cmd ?? ""}`.includes(m)));
  const bashWrite = traceRows.some((t) => String(t.tool).toLowerCase() === "bash" && BASH_WRITE.test(t.cmd ?? ""));
  return { arm, denies, fired, factsGiven, tools, gamed, bashWrite };
}
