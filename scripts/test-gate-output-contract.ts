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

/**
 * A file in `plugins/` must export EXACTLY ONE thing: its Plugin.
 *
 * OpenCode's loader calls every export of a plugin file as a plugin factory.
 * expert-hooks.ts exported its Plugin plus four helpers, so the loader invoked
 * `globToRegExpForTier` with its own context object and the whole plugin failed:
 *
 *     failed to load plugin .../expert-hooks.ts
 *     error="glob.replace is not a function"
 *
 * It failed on EVERY session for an unknown period, silently disabling the
 * dangerous-bash blocklist, the .env/credential write guard, post-edit
 * format/lint/typecheck/secret-scan, telemetry and the session-model receipt.
 * Nothing surfaced it — the log line was the only evidence, and nothing read the
 * log. The control case is resume-anchor.ts, which exports only its Plugin and
 * has never failed to load.
 *
 * Helpers belong in scripts/lib/, which the plugin imports.
 */
export function testPluginExportContract(root: string, ok: Ok, fail: Fail) {
  const dir = path.join(root, "plugins");
  if (!fs.existsSync(dir)) {
    ok("plugin-export contract: no plugins/ directory");
    return;
  }
  const offenders: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".ts") && !f.endsWith(".mjs") && !f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    // Top-level exports, ignoring `export type`/`export interface` (erased).
    const names = [...src.matchAll(/^export\s+(?:const|function|async function|class|let|var)\s+(\w+)/gm)]
      .map((m) => m[1]);
    if (names.length !== 1) {
      offenders.push(`${f} exports ${names.length} (${names.join(", ") || "none"}) — expected exactly 1 (the Plugin)`);
    }
  }
  if (offenders.length === 0) {
    ok("plugin-export contract: every plugins/ file exports exactly its Plugin and nothing else");
  } else {
    fail(
      "plugin-export contract: every plugins/ file exports exactly its Plugin and nothing else",
      offenders.join("; ") +
        " — OpenCode calls every export as a plugin factory, so an extra export takes the whole plugin down. Move helpers to scripts/lib/.",
    );
  }
}

// -- persistence contract: every SDLC driver must be told not to stop early --
// sdlc-lead.md was the ONLY mode file missing the persistence banner — and it
// is the one agent whose whole job is driving the loop forward. The result:
// on a model that ends turns eagerly, the lead ran the gates after a specialist
// returned and then stopped, so the user had to type "continue" / "next steps"
// to push it through the four scoring steps it already owed. Every other mode
// and phase file carried the banner; nothing checked that they all did.
export function testPersistenceContract(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const dir = path.join(root, "agents");
  if (!fs.existsSync(dir)) {
    ok("persistence contract: no agents/ directory");
    return;
  }
  const drivers = fs
    .readdirSync(dir)
    .filter((f) => /^sdlc-.*\.md$/.test(f))
    .sort();
  const missing = drivers.filter(
    (f) =>
      !fs
        .readFileSync(path.join(dir, f), "utf8")
        .includes("Persistence (do not end your turn early)"),
  );
  if (missing.length === 0) {
    ok(
      `persistence contract: all ${drivers.length} SDLC driver file(s) carry the do-not-stop-early rule`,
    );
  } else {
    fail(
      "persistence contract: every SDLC driver carries the do-not-stop-early rule",
      `${missing.join(", ")} — an SDLC driver without it ends its turn mid-loop and the user has to push it through steps it already owed`,
    );
  }
}

// -- loop contract: a validator-bearing phase is driven by the WRAPPER --------
// validate-phase-gate.sh has no iteration counter. Calling it directly to drive
// a repair loop is how coreweave's Phase 2 ran ~12 remediation rounds when the
// cap is 3 — nothing was counting, so every round looked like progress. The
// wrapper (run-coverage-loop.sh) is the only path that counts, caps, and halts
// on a no-progress round. Read-only surfaces may still call the gate directly:
// they report a result, they do not drive a loop.
const LOOP_READONLY_ALLOWED = [
  "skills/gate/SKILL.md",              // /sdlc gate — one-off status check
  "skills/onboard-verify/SKILL.md",    // /onboard-verify — reports uncovered rows
  "commands/sdlc-gate.md",             // slash-command wrapper for the same
  "agents/shared/SDLC_RESUME_PROTOCOL.md", // gate-verifies claimed-complete phases
  "agents/shared/RALPH_WIGGUM_LOOP.md",    // documents what the wrapper runs
  "agents/sdlc-lead.md",               // /sdlc gate row + resume verification
];

export function testCoverageLoopContract(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const roots = ["agents", "skills", "commands"];
  const offenders: string[] = [];
  const walk = (d: string): string[] => {
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(d, e.name);
      if (e.isDirectory()) return walk(full);
      return e.isFile() && e.name.endsWith(".md") ? [full] : [];
    });
  };
  for (const r of roots) {
    for (const file of walk(path.join(root, r))) {
      const rel = path.relative(root, file);
      if (LOOP_READONLY_ALLOWED.includes(rel)) continue;
      const text = fs.readFileSync(file, "utf8");
      // A phase argument after the gate = driving a phase, not a bare mention.
      const m = text.match(
        /validate-phase-gate\.sh\s+(phase-[0-9.]+|onboard-deep|security-deep|feature|improve)/g,
      );
      if (m) offenders.push(`${rel} → ${[...new Set(m)].join(", ")}`);
    }
  }
  if (offenders.length === 0) {
    ok(
      "coverage-loop contract: every phase-driving call goes through run-coverage-loop.sh, not the uncounted gate",
    );
  } else {
    fail(
      "coverage-loop contract: every phase-driving call goes through run-coverage-loop.sh",
      offenders.join("; ") +
        " — the bare gate has no iteration counter, so a repair loop there is unbounded (coreweave Phase 2: ~12 rounds against a cap of 3). Use run-coverage-loop.sh, or add the file to LOOP_READONLY_ALLOWED if it only reports.",
    );
  }
}

// -- challenger contract: no mode may be silently unchallenged ---------------
// It used to be hand-listed per phase, so security-deep and onboard-deep — the
// two modes producing the most unverified claims — had none. It is appended
// systemically now; this pins that it stays that way.
export function testChallengerContract(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const gate = path.join(root, "scripts/validators/validate-phase-gate.sh");
  if (!fs.existsSync(gate)) {
    ok("challenger contract: no phase gate");
    return;
  }
  const text = fs.readFileSync(gate, "utf8");
  const systemic =
    /GATE_VALIDATORS\+=\("validate-challenger-gate\.sh"\)/.test(text) &&
    /\$\{#GATE_VALIDATORS\[@\]\} -gt 0/.test(text);
  if (systemic) {
    ok(
      "challenger contract: the challenger gate is appended systemically to every validator-bearing phase, not hand-listed per mode",
    );
  } else {
    fail(
      "challenger contract: challenger appended systemically",
      "validate-phase-gate.sh no longer appends validate-challenger-gate.sh to every validator-bearing phase — a per-phase list is how security-deep and onboard-deep ended up unchallenged",
    );
  }
}

// -- installer preflight contract -------------------------------------------
// Two real bugs this pins, both made while writing the preflight itself:
//   1. ensure_tool CALLED before its definition -> "command not found", and
//      every dependency check silently did nothing.
//   2. the preflight placed AFTER the Node check -> nvm is downloaded with
//      curl, so a fresh WSL image failed to bootstrap Node with a bare
//      command-not-found before curl was ever offered.
// A fresh machine is exactly where this matters and exactly where nobody
// tests, so the ordering is asserted rather than trusted.
export function testInstallerPreflightContract(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const f = path.join(root, "install.sh");
  if (!fs.existsSync(f)) {
    ok("installer preflight contract: no install.sh");
    return;
  }
  const text = fs.readFileSync(f, "utf8");
  const problems: string[] = [];

  const defAt = text.indexOf("ensure_tool() {");
  const firstCall = text.search(/^\s*ensure_tool /m);
  if (defAt === -1) problems.push("ensure_tool() is not defined");
  else if (firstCall !== -1 && firstCall < defAt)
    problems.push("ensure_tool is called before it is defined");

  for (const tool of ["git", "jq"]) {
    if (!new RegExp(`ensure_tool ${tool}\\b`).test(text))
      problems.push(`no ensure_tool check for ${tool}`);
  }
  if (!/ensure_tool curl\b/.test(text))
    problems.push("no ensure_tool check for curl");

  // curl must be settled before Node is bootstrapped, since nvm is downloaded.
  const nodeCheck = text.indexOf('echo -n "Checking Node version... "');
  const toolCheck = text.indexOf('echo "Checking required tools..."');
  if (nodeCheck !== -1 && toolCheck !== -1 && toolCheck > nodeCheck)
    problems.push(
      "tool preflight runs after the Node check — nvm needs curl, so a machine without it cannot install Node",
    );

  // A skipped MCP registration must not still report success.
  if (!/MCP_REGISTRATION_SKIPPED/.test(text))
    problems.push("no MCP_REGISTRATION_SKIPPED tracking — a build-but-not-register run would report success");

  if (problems.length === 0)
    ok(
      "installer preflight contract: git/jq/curl are ensured, helpers precede their calls, and tools are checked before the Node bootstrap",
    );
  else
    fail("installer preflight contract", problems.join("; "));
}
