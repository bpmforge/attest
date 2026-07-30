// Pass 52 — the gate-output contract: what a harness EMITS and what the agent
// docs say it emits must move together.
//
// WHY THIS EXISTS. Four consecutive field blocks in one week traced to the same
// shape — a mechanism changed, and the instruction that tells an agent how to
// read it kept describing the old behaviour:
//
//   v3.0.1  agent docs pointed at `./scripts/validators/...`, a path that
//           resolves in neither install mode
//   v3.0.4  two docs asserted `.code-search/` was gitignored; nothing made it so
//   v3.0.6  `[warn]` was added so the done-gate would stop blocking, and the
//           reading instruction still said "RED lists exactly what is missing" —
//           a researcher dutifully reported two warnings as its blockers
//   v3.0.7  retry counters changed meaning from "repeats" to "attempts" and the
//           surrounding rule was never updated, so productive iteration hit
//           "retry budget exhausted"
//
// Each was fixed individually. This pass closes the CLASS: every verdict state a
// harness can emit must be findable in the documents agents read. A new state
// with no documentation fails here, at the point of introduction, rather than in
// somebody's blocked session a week later.
//
// Deliberately a presence check, not a wording check — it asserts the state is
// explained SOMEWHERE an agent reads, and stays silent on how it is phrased.

import * as fs from "node:fs";
import * as path from "node:path";

type Ok = (msg: string) => void;
type Fail = (msg: string, detail: string) => void;

/** Distinctive marker → the emitting harness, for the failure message. */
const EMITTED_STATES: Array<{ marker: string; from: string; note: string }> = [
  // verify-handoff.sh
  {
    marker: "ALL GREEN",
    from: "verify-handoff.sh",
    note: "every command passed",
  },
  {
    marker: "BASELINE NOT CHECKED",
    from: "verify-handoff.sh",
    note: "no baseline stored, regressions undetectable",
  },
  {
    marker: "BASELINE_RED",
    from: "verify-handoff.sh",
    note: "every failure pre-dates this work",
  },
  {
    marker: "matched nothing",
    from: "verify-handoff.sh",
    note: "fence/path/config defect, not a code defect",
  },
  {
    marker: "pre-date this work",
    from: "verify-handoff.sh",
    note: "count regression alongside pre-existing failures",
  },
  // handoff-done.sh
  {
    marker: "DONE-CHECK: GREEN",
    from: "handoff-done.sh",
    note: "print the completion phrase",
  },
  {
    marker: "DONE-CHECK: RED",
    from: "handoff-done.sh",
    note: "blocking items listed",
  },
  {
    marker: "NOT blockers",
    from: "handoff-done.sh",
    note: "[warn] lines never block",
  },
  // run-handoff-gates.sh
  {
    marker: "GATE FAILED",
    from: "run-handoff-gates.sh",
    note: "names the failing gate",
  },
  {
    marker: "UNRUN",
    from: "run-handoff-gates.sh",
    note: "fail-fast: later gates did not run",
  },
];

export function testGateOutputContract(root: string, ok: Ok, fail: Fail) {
  // The corpus an agent actually reads at runtime.
  const dirs = ["agents", "skills"].map((d) => path.join(root, d));
  const corpus: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) corpus.push(fs.readFileSync(p, "utf8"));
    }
  };
  for (const d of dirs) if (fs.existsSync(d)) walk(d);
  const all = corpus.join("\n");

  const undocumented = EMITTED_STATES.filter((s) => !all.includes(s.marker));
  if (undocumented.length === 0) {
    ok(
      `gate-output contract: all ${EMITTED_STATES.length} emitted verdict states are documented where agents read them`,
    );
  } else {
    fail(
      `gate-output contract: all ${EMITTED_STATES.length} emitted verdict states are documented where agents read them`,
      undocumented
        .map(
          (s) =>
            `${s.from} emits "${s.marker}" (${s.note}) — explained nowhere in agents/ or skills/`,
        )
        .join("; "),
    );
  }

  // The inverse guard: a state listed here must still be emitted by its harness.
  // Otherwise this file rots into a list of verdicts that no longer exist, and
  // the next real drift hides behind a passing test.
  const scripts: Record<string, string> = {
    "verify-handoff.sh": path.join(root, "scripts/verify-handoff.sh"),
    "handoff-done.sh": path.join(root, "scripts/handoff-done.sh"),
    "run-handoff-gates.sh": path.join(
      root,
      "scripts/validators/run-handoff-gates.sh",
    ),
  };
  const sources: Record<string, string> = {};
  for (const [k, p] of Object.entries(scripts)) {
    sources[k] = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  }
  const stale = EMITTED_STATES.filter(
    (s) => !(sources[s.from] ?? "").includes(s.marker),
  );
  if (stale.length === 0) {
    ok(
      "gate-output contract: every documented state is still emitted by its harness",
    );
  } else {
    fail(
      "gate-output contract: every documented state is still emitted by its harness",
      stale
        .map(
          (s) =>
            `"${s.marker}" is listed for ${s.from} but that script no longer emits it`,
        )
        .join("; "),
    );
  }
}
