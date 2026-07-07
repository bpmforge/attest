/**
 * test-gate-receipts.ts — Pass 5 chapter module for scripts/test.ts (T27.1).
 *
 * Red/green fixtures for the phase-gate receipt mechanism. A gate must be
 * provable, not just claimed: these fixtures prove the specific spoofing
 * paths the 2026-07-07 ticket-hygiene incident exposed are now refused, not
 * just that the happy path works. Extracted from test.ts to keep it under
 * the file-size cap (CODE_BOOK_PROTOCOL.md) — this is test.ts's "chapter"
 * for gate receipts; test.ts is the barrel that invokes it.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

export async function testGateReceipts(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const gatePassScript = path.join(
    root,
    "scripts/validators/validate-phase-gate.sh",
  );
  const detectStateScript = path.join(root, "scripts/detect-sdlc-state.sh");
  const waiveScript = path.join(root, "scripts/waive-gate.sh");

  function makeFixtureDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "gate-receipt-fixture-"));
  }

  function writeFiles(dir: string, files: Record<string, string>) {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }

  // runGate: returns {exitCode, stdout} without throwing, so red-fixture
  // assertions can inspect a non-zero exit directly instead of catching.
  function runGate(
    script: string,
    args: string[],
  ): { exitCode: number; stdout: string } {
    try {
      const stdout = execFileSync("bash", [script, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return { exitCode: 0, stdout };
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string };
      return { exitCode: e.status ?? 1, stdout: e.stdout ?? "" };
    }
  }

  function readReceipt(dir: string, phase: string): string | null {
    const p = path.join(dir, "docs/work/gates", `${phase}-receipt.json`);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  }

  try {
    // -- GREEN: a real phase-0 -> phase-1 run produces valid, chained receipts
    {
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "docs/VISION.md": "# Vision\ncontent",
        "docs/COMPETITIVE_ANALYSIS.md": "# Competitive\ncontent",
      });
      const r0 = runGate(gatePassScript, ["phase-0", dir]);
      const receipt0 = readReceipt(dir, "phase-0");
      if (r0.exitCode === 0 && receipt0 && JSON.parse(receipt0).mode === "real")
        ok("gate receipts — real phase-0 run writes a mode:real receipt");
      else
        fail(
          "gate receipts — real phase-0 run",
          `exit=${r0.exitCode} receipt=${receipt0}`,
        );

      writeFiles(dir, {
        "docs/SCOPE.md": "# Scope",
        "docs/RISKS.md": "# Risks",
        "docs/CONSTRAINTS.md": "# Constraints",
        "docs/USER_PERSONAS.md": "# Personas",
      });
      const r1 = runGate(gatePassScript, ["phase-1", dir]);
      if (r1.exitCode === 0 && !r1.stdout.includes('"phase-ordering"'))
        ok("gate receipts — phase-1 accepts a valid chained phase-0 receipt");
      else fail("gate receipts — chained receipt accepted", r1.stdout);

      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- RED 1: hand-touched fake receipt (old-style bare timestamp) refused
    {
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "docs/SCOPE.md": "# Scope",
        "docs/RISKS.md": "# Risks",
        "docs/CONSTRAINTS.md": "# Constraints",
        "docs/USER_PERSONAS.md": "# Personas",
        "docs/work/gates/phase-0-receipt.json": "2026-01-01T00:00:00Z\n",
      });
      const r = runGate(gatePassScript, ["phase-1", dir]);
      if (r.exitCode !== 0 && r.stdout.includes('"phase-ordering"'))
        ok("gate receipts — RED: hand-touched fake receipt refused");
      else
        fail(
          "gate receipts — hand-touched fake receipt should be refused",
          `exit=${r.exitCode} ${r.stdout}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- RED 2: retroactive minting is dead — detect-sdlc-state.sh must NOT
    // create a receipt just because a phase's files exist.
    {
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "docs/VISION.md": "# Vision",
        "docs/COMPETITIVE_ANALYSIS.md": "# Competitive",
      });
      runGate(detectStateScript, [dir]); // exit code varies by overall status; not the assertion
      const receipt = readReceipt(dir, "phase-0");
      if (receipt === null)
        ok(
          "gate receipts — RED: detect-sdlc-state.sh does not retroactively mint a receipt",
        );
      else
        fail(
          "gate receipts — retroactive minting should be dead",
          `a receipt was created: ${receipt}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- RED 3: receipt missing a chained validator refused
    {
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "docs/SRS.md": "# SRS",
        "docs/USER_STORIES.md": "# Stories",
        "docs/USE_CASES.md": "# Cases",
      });
      // Compute the real hash the same way the gate does, via the shared lib,
      // so only the missing-validator condition is under test here.
      const hash = execFileSync(
        "bash",
        [
          "-c",
          `source "${path.join(root, "scripts/validators/_lib.sh")}" && sha256_of_paths "${dir}" docs/SRS.md docs/USER_STORIES.md docs/USE_CASES.md`,
        ],
        { encoding: "utf8" },
      ).trim();
      writeFiles(dir, {
        "docs/work/gates/phase-2-receipt.json": JSON.stringify({
          phase: "phase-2",
          timestamp: "2026-01-01T00:00:00Z",
          mode: "real",
          inputTreeHash: hash,
          validators: [
            { name: "validate-use-cases.sh", exitCode: 0, gaps: 0 },
            { name: "validate-user-stories.sh", exitCode: 0, gaps: 0 },
            // validate-requirements-matrix.sh deliberately omitted
          ],
          filesChecked: [
            "docs/SRS.md",
            "docs/USER_STORIES.md",
            "docs/USE_CASES.md",
          ],
        }),
      });
      const r = runGate(gatePassScript, ["phase-3", dir]);
      if (
        r.exitCode !== 0 &&
        r.stdout.includes("phase-2 receipt is incomplete")
      )
        ok("gate receipts — RED: receipt missing a chained validator refused");
      else
        fail(
          "gate receipts — incomplete receipt should be refused",
          `exit=${r.exitCode} ${r.stdout}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- RED 4 (bonus): stale receipt (input files changed after gate ran)
    {
      const dir = makeFixtureDir();
      writeFiles(dir, {
        "docs/VISION.md": "# Vision",
        "docs/COMPETITIVE_ANALYSIS.md": "# Competitive",
      });
      runGate(gatePassScript, ["phase-0", dir]); // phase-1's own prereq
      writeFiles(dir, {
        "docs/SCOPE.md": "# Scope v1",
        "docs/RISKS.md": "# Risks",
        "docs/CONSTRAINTS.md": "# Constraints",
        "docs/USER_PERSONAS.md": "# Personas",
      });
      runGate(gatePassScript, ["phase-1", dir]);
      fs.writeFileSync(
        path.join(dir, "docs/SCOPE.md"),
        "# Scope v2, edited after gate ran",
      );
      writeFiles(dir, {
        "docs/SRS.md": "# SRS",
        "docs/USER_STORIES.md": "# Stories",
        "docs/USE_CASES.md": "# Cases",
      });
      const r = runGate(gatePassScript, ["phase-2", dir]);
      if (r.exitCode !== 0 && r.stdout.includes("receipt is stale"))
        ok("gate receipts — RED: stale receipt (docs changed since) refused");
      else
        fail(
          "gate receipts — stale receipt should be refused",
          `exit=${r.exitCode} ${r.stdout}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- Waiver: agent-signed refused, too-short reason refused, human accepted
    {
      const dir = makeFixtureDir();
      const agentSigned = runGate(waiveScript, [
        "phase-0",
        "testing the agent-signed rejection path",
        "--signed-by",
        "claude",
        dir,
      ]);
      const shortReason = runGate(waiveScript, [
        "phase-0",
        "short",
        "--signed-by",
        "user",
        dir,
      ]);
      const humanSigned = runGate(waiveScript, [
        "phase-0",
        "pre-tooling project, docs live outside this repo",
        "--signed-by",
        "user",
        dir,
      ]);
      const receipt = readReceipt(dir, "phase-0");
      if (
        agentSigned.exitCode !== 0 &&
        shortReason.exitCode !== 0 &&
        humanSigned.exitCode === 0 &&
        receipt &&
        JSON.parse(receipt).mode === "waiver" &&
        JSON.parse(receipt).signedBy === "user"
      )
        ok(
          "gate receipts — waiver: agent-signed + short-reason refused, human-signed accepted",
        );
      else
        fail(
          "gate receipts — waiver signer/reason validation",
          `agent=${agentSigned.exitCode} short=${shortReason.exitCode} human=${humanSigned.exitCode} receipt=${receipt}`,
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // -- RED (independent review, 2026-07-07): the human-signer blocklist
    // must be case/whitespace-insensitive. The original check was a bare
    // `case` match against exact-cased strings — confirmed live to accept
    // "AGENT", "CLAUDE", "aGeNt", " agent", "agent " as valid human signers.
    {
      const dir = makeFixtureDir();
      const bypassAttempts = [
        "AGENT",
        "CLAUDE",
        "SYSTEM",
        "BOT",
        "aGeNt",
        " agent",
        "agent ",
        "assistant",
      ];
      const results = bypassAttempts.map((signer) =>
        runGate(waiveScript, [
          "phase-0",
          "testing a casing/whitespace bypass attempt",
          "--signed-by",
          signer,
          dir,
        ]),
      );
      const allRefused = results.every((r) => r.exitCode !== 0);
      const receiptAfterAttempts = readReceipt(dir, "phase-0");
      if (allRefused && receiptAfterAttempts === null)
        ok(
          "gate receipts — RED: waiver signer blocklist is case/whitespace-insensitive",
        );
      else
        fail(
          "gate receipts — waiver signer blocklist bypassed by casing/whitespace",
          JSON.stringify(
            bypassAttempts.map((s, i) => ({
              signer: s,
              exitCode: results[i]!.exitCode,
            })),
          ),
        );
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail("gate receipts", `unexpected failure: ${message}`);
  }
}
