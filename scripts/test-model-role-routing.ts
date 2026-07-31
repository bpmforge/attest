/**
 * test-model-role-routing.ts -- Pass 36 chapter module for scripts/test.ts
 * (T28.2, M28 Conductor).
 *
 * Two things get unit-tested here, per the ticket's own acceptance criteria:
 *   1. Role resolution (scripts/lib/model-tiers.mjs's resolveRole /
 *      checkMakerVerifierDistinct) -- the live models.json's roles map
 *      resolves cleanly, and a planted same-model coder/reviewer (or
 *      coder/challenger) config is flagged as a violation.
 *   2. conductor.mjs's own startup gate (G4): a fixture models.json with
 *      coder==reviewer refuses the run by default (--role-gate block, exit
 *      2, before any ticket is claimed) and only warns-and-continues under
 *      --role-gate warn; the run log's conductor.start entry carries the
 *      resolved per-role model map either way (the "run log shows the
 *      mapped model per role" acceptance criterion).
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";

export async function testModelRoleRouting(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const lib = await import(
    pathToFileURL(path.join(root, "scripts/lib/model-tiers.mjs")).href
  );
  const { resolveRole, checkMakerVerifierDistinct } = lib;
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "models.json"), "utf8"),
  );

  // -- 1. resolveRole() over the live registry ------------------------------
  if (resolveRole("coder", config) === config.roles?.coder)
    ok("model-tiers — resolveRole('coder') reads the live registry");
  else
    fail(
      "model-tiers — resolveRole('coder')",
      `expected ${config.roles?.coder}, got ${resolveRole("coder", config)}`,
    );

  if (
    resolveRole("nonexistent-role", config, "fallback-model") ===
    "fallback-model"
  )
    ok("model-tiers — resolveRole() falls back for an unconfigured role");
  else
    fail(
      "model-tiers — resolveRole() fallback",
      `expected 'fallback-model', got ${resolveRole("nonexistent-role", config, "fallback-model")}`,
    );

  // -- 2. checkMakerVerifierDistinct() over the live registry --------------
  // The real models.json must ship clean (coder != reviewer/challenger) --
  // if this ever fails, it's a real misconfiguration, not a test bug.
  const liveViolations = checkMakerVerifierDistinct(config);
  if (liveViolations.length === 0)
    ok("model-tiers — live models.json roles are maker/verifier-distinct");
  else
    fail(
      "model-tiers — live models.json role distinctness",
      JSON.stringify(liveViolations),
    );

  // -- 3. checkMakerVerifierDistinct() planted-violation fixtures ----------
  const sameModel = "anthropic/claude-opus-4-8";

  {
    const violations = checkMakerVerifierDistinct({
      roles: {
        coder: sameModel,
        reviewer: sameModel,
        challenger: "google/gemini-2.5-flash",
      },
    });
    if (
      violations.length === 1 &&
      violations[0].role === "reviewer" &&
      violations[0].model === sameModel
    )
      ok("model-tiers — checkMakerVerifierDistinct flags coder==reviewer");
    else
      fail(
        "model-tiers — coder==reviewer violation",
        JSON.stringify(violations),
      );
  }

  {
    const violations = checkMakerVerifierDistinct({
      roles: {
        coder: sameModel,
        reviewer: "google/gemini-2.5-flash",
        challenger: sameModel,
      },
    });
    if (
      violations.length === 1 &&
      violations[0].role === "challenger" &&
      violations[0].model === sameModel
    )
      ok("model-tiers — checkMakerVerifierDistinct flags coder==challenger");
    else
      fail(
        "model-tiers — coder==challenger violation",
        JSON.stringify(violations),
      );
  }

  {
    // No coder model configured -- nothing to compare against, not a violation.
    const violations = checkMakerVerifierDistinct({
      roles: { reviewer: sameModel },
    });
    if (violations.length === 0)
      ok(
        "model-tiers — checkMakerVerifierDistinct is a no-op with no coder role configured",
      );
    else fail("model-tiers — no-coder-role case", JSON.stringify(violations));
  }

  {
    // Clean config -- all three roles distinct.
    const violations = checkMakerVerifierDistinct({
      roles: {
        coder: "google/gemini-2.5-flash",
        reviewer: sameModel,
        challenger: sameModel,
      },
    });
    if (violations.length === 0)
      ok(
        "model-tiers — checkMakerVerifierDistinct clean when coder differs from reviewer+challenger (both may share a model)",
      );
    else
      fail(
        "model-tiers — clean distinct-roles case",
        JSON.stringify(violations),
      );
  }

  // -- 4. conductor.mjs G4 startup gate, via the real CLI on a fixture plan -
  const CONDUCTOR = path.join(root, "scripts/conductor/conductor.mjs");

  function mkFixtureRepo(
    name: string,
    modelsRoles: Record<string, string>,
  ): string {
    const dir = fs.mkdtempSync(
      path.join(fs.realpathSync(root), `.tmp-role-routing-${name}-`),
    );
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    execFileSync(
      "git",
      ["config", "user.email", "role-routing-test@example.com"],
      { cwd: dir },
    );
    execFileSync("git", ["config", "user.name", "Role Routing Test"], {
      cwd: dir,
    });
    execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
    fs.writeFileSync(
      path.join(dir, "plan.json"),
      JSON.stringify({ goal: "fixture", modules: [] }, null, 2) + "\n",
    );
    fs.writeFileSync(
      path.join(dir, "models.json"),
      JSON.stringify({ roles: modelsRoles }, null, 2) + "\n",
    );
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "initial fixture"], {
      cwd: dir,
    });
    return dir;
  }

  function runConductor(
    dir: string,
    extraArgs: string[],
  ): { exitCode: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync(
        "node",
        // --model-gate off: G4b asks the LOCAL opencode install whether each
        // configured model resolves, so leaving it on would make these G4
        // fixtures pass or fail according to which providers the developer
        // happens to have authenticated. G4b has its own test below, with a
        // stubbed `opencode models`.
        [
          CONDUCTOR,
          "--root",
          dir,
          "--no-push",
          "--max-tickets",
          "0",
          "--model-gate",
          "off",
          ...extraArgs,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return { exitCode: 0, stdout, stderr: "" };
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return {
        exitCode: e.status ?? 1,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
      };
    }
  }

  // RED: a same-model coder/reviewer models.json refuses the run by default.
  {
    const dir = mkFixtureRepo("block", {
      coder: sameModel,
      reviewer: sameModel,
    });
    const result = runConductor(dir, []);
    if (
      result.exitCode === 2 &&
      /roles\.reviewer/.test(result.stderr) &&
      /refusing to run/.test(result.stderr)
    )
      ok(
        "conductor.mjs — G4 default (--role-gate block): same-model coder/reviewer refuses the run (exit 2)",
      );
    else
      fail(
        "conductor.mjs — G4 default block",
        `exitCode=${result.exitCode} stderr=${result.stderr}`,
      );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // WARN: the same config with --role-gate warn logs the gate and proceeds
  // (an empty plan means it halts immediately after on "nothing claimable",
  // exit 0 -- proving the mismatch did NOT block the run under warn mode).
  {
    const dir = mkFixtureRepo("warn", {
      coder: sameModel,
      reviewer: sameModel,
    });
    const result = runConductor(dir, ["--role-gate", "warn"]);
    const log = fs
      .readFileSync(path.join(dir, "docs/work/conductor-log.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const mismatch = log.find(
      (r: { kind: string }) => r.kind === "gate.role-mismatch",
    );
    if (
      result.exitCode === 0 &&
      mismatch &&
      /roles\.reviewer/.test(mismatch.msg)
    )
      ok(
        "conductor.mjs — G4 (--role-gate warn): same-model coder/reviewer logs gate.role-mismatch but does not block",
      );
    else
      fail(
        "conductor.mjs — G4 warn mode",
        `exitCode=${result.exitCode} log=${JSON.stringify(log)}`,
      );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // GREEN: a clean, fully-distinct roles map runs clean and the run log's
  // conductor.start entry carries the resolved per-role model map.
  {
    const dir = mkFixtureRepo("clean", {
      coder: "google/gemini-2.5-flash",
      reviewer: sameModel,
      challenger: sameModel,
    });
    const result = runConductor(dir, []);
    const log = fs
      .readFileSync(path.join(dir, "docs/work/conductor-log.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const start = log.find(
      (r: { kind: string }) => r.kind === "conductor.start",
    );
    const mismatch = log.find(
      (r: { kind: string }) => r.kind === "gate.role-mismatch",
    );
    if (
      result.exitCode === 0 &&
      !mismatch &&
      start?.roles?.coder === "google/gemini-2.5-flash" &&
      start?.roles?.reviewer === sameModel &&
      start?.roles?.challenger === sameModel
    )
      ok(
        "conductor.mjs — GREEN: clean roles map runs clean; conductor.start log entry shows the mapped model per role",
      );
    else
      fail(
        "conductor.mjs — GREEN clean roles map",
        `exitCode=${result.exitCode} start=${JSON.stringify(start)} mismatch=${JSON.stringify(mismatch)}`,
      );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // -- 5. G4b: the configured models must RESOLVE, not merely differ ---------
  //
  // G4 above compares two strings drawn from the same file, so it can pass
  // while guaranteeing nothing. That is not hypothetical: models.json shipped
  // `google/gemini-2.5-flash` (coder) and `anthropic/claude-opus-4-8`
  // (reviewer) against an install whose only authenticated providers were
  // GitHub Copilot, OpenAI and LMStudio. `opencode run --model <unknown>` does
  // not fail -- it falls back to the agent's own model. The server log for the
  // run that "landed" a ticket shows 23 streams on github-copilot/claude-haiku
  // -4.5 and none on gemini, while the conductor logged the gemini id and the
  // receipts inherited that claim. Two distinct roles, one real model, and a
  // maker/verifier split that existed only in the config file.
  //
  // `opencode models` is stubbed so this asserts the GATE, not the developer's
  // authentication state.
  {
    const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "g4b-stub-"));
    const stub = path.join(stubDir, "opencode");
    fs.writeFileSync(
      stub,
      `#!/bin/sh\n[ "$1" = "models" ] && { echo real/model-a; echo real/model-b; exit 0; }\nexit 0\n`,
    );
    fs.chmodSync(stub, 0o755);

    const runWithStub = (dir: string, args: string[]) => {
      try {
        const stdout = execFileSync(
          "node",
          [
            CONDUCTOR,
            "--root",
            dir,
            "--no-push",
            "--max-tickets",
            "0",
            ...args,
          ],
          {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, OPENCODE_BIN: stub },
          },
        );
        return { exitCode: 0, stdout, stderr: "" };
      } catch (err: unknown) {
        const e = err as { status?: number; stdout?: string; stderr?: string };
        return {
          exitCode: e.status ?? 1,
          stdout: e.stdout ?? "",
          stderr: e.stderr ?? "",
        };
      }
    };

    // RED: distinct roles, but the reviewer's model does not exist.
    {
      const dir = mkFixtureRepo("g4b-red", {
        coder: "real/model-a",
        reviewer: "ghost/model-that-does-not-exist",
      });
      const result = runWithStub(dir, []);
      if (
        result.exitCode === 2 &&
        /ghost\/model-that-does-not-exist/.test(result.stderr) &&
        /cannot resolve/.test(result.stderr)
      )
        ok(
          "conductor.mjs — G4b: a role model this install cannot resolve refuses the run (exit 2), even though the roles differ",
        );
      else
        fail(
          "conductor.mjs — G4b block",
          `exitCode=${result.exitCode} stderr=${result.stderr}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // GREEN: every role model is in the registry -- no gate, run proceeds.
    {
      const dir = mkFixtureRepo("g4b-green", {
        coder: "real/model-a",
        reviewer: "real/model-b",
      });
      const result = runWithStub(dir, []);
      const log = fs
        .readFileSync(path.join(dir, "docs/work/conductor-log.jsonl"), "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      const gate = log.find(
        (r: { kind: string }) => r.kind === "gate.model-resolve",
      );
      if (result.exitCode === 0 && !gate)
        ok(
          "conductor.mjs — G4b: resolvable role models pass silently — the gate fires on absence, not on every run",
        );
      else
        fail(
          "conductor.mjs — G4b green",
          `exitCode=${result.exitCode} gate=${JSON.stringify(gate)}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    fs.rmSync(stubDir, { recursive: true, force: true });
  }
}
