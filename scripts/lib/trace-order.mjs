/**
 * trace-order.mjs — deterministic rule-compliance grading over a tool-call trace.
 * Group K4, adapted from affaan-m/ECC `skill-comply` scripts/grader.py (MIT).
 *
 * ECC detects which tool call is which step with an LLM classifier and only the
 * ORDERING is deterministic. Here step detection is a PREDICATE on tool + args + output
 * (no LLM, no spend), so the whole grade is reproducible and fixture-testable.
 *
 * Trace event : { seq, group?, session?, tool, file?, cmd?, out? }   seq = call order.
 *               Events sharing a `group` were issued in parallel: their relative
 *               order is undefined, so an after/before constraint between two events
 *               of one group NEVER fails (ECC's synthetic timestamps get this wrong).
 *               LIMITATION: opencode's tool.execute.after does not say which calls were
 *               parallel, so traceEvent() emits no `group`; ties exist only when the trace
 *               source supplies one (e.g. Claude stream-json, per assistant message).
 * Spec        : { id, threshold?, steps:[{ id, required?, match, after?, before? }] }
 *               match = { tool?: string[], file?: regex, cmd?: regex, out?: regex,
 *                         notFile?: regex }   (all present fields must hold)
 */

export function matches(ev, m) {
  if (m.tool && !m.tool.map((t) => t.toLowerCase()).includes(String(ev.tool).toLowerCase())) return false;
  if (m.file && !new RegExp(m.file, "i").test(ev.file ?? "")) return false;
  if (m.notFile && new RegExp(m.notFile, "i").test(ev.file ?? "")) return false;
  if (m.cmd && !new RegExp(m.cmd, "i").test(ev.cmd ?? "")) return false;
  if (m.out && !new RegExp(m.out, "i").test(ev.out ?? "")) return false;
  return true;
}

const tied = (a, b) => a.group !== undefined && a.group === b.group;

function temporalFailure(step, ev, resolved, candidatesOf, graded) {
  if (step.after) {
    let ref = resolved.get(step.after);
    if (!ref) {
      // Graded but absent => it failed its own checks: never lend its raw candidates to a dependant.
      if (graded.has(step.after)) return `after '${step.after}' did not pass its own checks`;
      ref = candidatesOf(step.after); // forward reference to a step declared later
    }
    if (!ref.length) return `after '${step.after}' not yet detected`;
    const last = ref.reduce((a, b) => (b.seq > a.seq ? b : a));
    if (ev.seq <= last.seq && !tied(ev, last)) return `must occur after '${step.after}' (last at ${last.seq}), found at ${ev.seq}`;
  }
  if (step.before) {
    // A failed reference is NOT excluded here: dropping it would relax a constraint because some other step failed.
    const ref = resolved.get(step.before) ?? candidatesOf(step.before);
    if (ref.length) {
      const first = ref.reduce((a, b) => (b.seq < a.seq ? b : a));
      if (ev.seq >= first.seq && !tied(ev, first)) return `must occur before '${step.before}' (first at ${first.seq}), found at ${ev.seq}`;
    }
  }
  return null;
}

/** Fail loudly on a malformed spec: a typo'd `before` id used to relax a constraint silently. */
export function validateSpec(spec) {
  const err = (m) => { throw new Error(`trace-order spec ${spec?.id ?? "?"}: ${m}`); };
  if (!spec || !Array.isArray(spec.steps)) err("steps[] missing");
  const ids = new Set();
  for (const st of spec.steps) {
    if (!st.id || ids.has(st.id)) err(`missing or duplicate step id '${st.id}'`);
    ids.add(st.id);
    const m = st.match ?? err(`step '${st.id}' has no match`);
    if (m.tool !== undefined && !Array.isArray(m.tool)) err(`step '${st.id}' match.tool must be an array`);
    for (const k of ["file", "notFile", "cmd", "out"]) if (m[k] !== undefined) { try { new RegExp(m[k]); } catch { err(`step '${st.id}' match.${k} is not a valid regex`); } }
  }
  for (const st of spec.steps) for (const k of ["after", "before"]) if (st[k] !== undefined && !ids.has(st[k])) err(`step '${st.id}' ${k} '${st[k]}' is not a step id`);
  const seen = (id, path) => { if (path.includes(id)) err(`after-cycle through '${id}'`); const a = spec.steps.find((x) => x.id === id)?.after; if (a) seen(a, [...path, id]); };
  for (const st of spec.steps) seen(st.id, []);
}

export function gradeTrace(spec, trace, opts = {}) {
  validateSpec(spec);
  if (!Array.isArray(trace)) throw new Error("trace-order: trace must be an array of events");
  // A capture file can interleave sessions (seq is per plugin instance): grade one session at a time.
  const events = (opts.session ? trace.filter((e) => e.session === opts.session) : [...trace]).sort((a, b) => a.seq - b.seq);
  const byStep = new Map(spec.steps.map((s) => [s.id, events.filter((e) => matches(e, s.match))]));
  const candidatesOf = (id) => byStep.get(id) ?? [];
  const resolved = new Map();
  const graded = new Set();
  let results = [];

  for (const step of spec.steps) {
    let matched = null, reason = null;
    for (const ev of candidatesOf(step.id)) {
      const fail = temporalFailure(step, ev, resolved, candidatesOf, graded);
      if (fail === null) { matched = ev; break; }
      reason = fail;
    }
    if (matched) resolved.set(step.id, [matched]);
    else reason ??= `no event matched step '${step.id}'`;
    graded.add(step.id);
    results.push({ id: step.id, required: step.required !== false, detected: !!matched, evidence: matched, reason: matched ? null : reason });
  }

  // Demotion: a dependant declared BEFORE its prerequisite was graded on the prerequisite's raw candidates;
  // if that prerequisite then failed, the dependant's pass never held. Repeat to a fixed point (only removes passes).
  const afterOf = new Map(spec.steps.filter((s) => s.after).map((s) => [s.id, s.after]));
  for (;;) {
    const failed = new Set(results.filter((r) => !r.detected).map((r) => r.id));
    const demote = results.filter((r) => r.detected && failed.has(afterOf.get(r.id)));
    if (!demote.length) break;
    results = results.map((r) => demote.includes(r)
      ? { ...r, detected: false, evidence: null, reason: `after '${afterOf.get(r.id)}' did not pass its own checks` } : r);
  }

  const req = results.filter((r) => r.required);
  const rate = req.length ? req.filter((r) => r.detected).length / req.length : 0;
  return { spec: spec.id, steps: results, complianceRate: rate, recommendHook: rate < (spec.threshold ?? 0.8) };
}

/**
 * One trace row for an opencode tool.execute.after call. Deliberately small: tool, target and a
 * short output head (the "did the test fail?" signal) — never the file contents or full output.
 */
export function traceEvent(seq, input, output, now = Date.now()) {
  const a = input?.args ?? {};
  return {
    seq, ts: now, session: input?.sessionID, tool: input?.tool,
    file: a.filePath ?? a.file_path, cmd: typeof a.command === "string" ? a.command.slice(0, 300) : undefined,
    out: typeof output?.output === "string" ? output.output.slice(0, 200) : undefined,
  };
}
