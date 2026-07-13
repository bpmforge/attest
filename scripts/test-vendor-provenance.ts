/**
 * test-vendor-provenance.ts — Pass 31 chapter module for scripts/test.ts
 * (T29.8, R-30, field lesson B-2).
 *
 * Field lesson: a design doc claimed "we use library X" for a vendored
 * component set that was actually AI-written from memory — renamed
 * variants, dropped sizes, an older template — never pulled from the real
 * library. validate-vendor-provenance.sh closes this by requiring a
 * VENDORED.md provenance manifest at any vendored directory (source +
 * version, or an explicit generated-from-memory + divergence declaration)
 * and by comparing a manifest's declared file/variant list against what's
 * actually on disk.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface RunResult {
  exitCode: number;
  stdout: string;
}

function run(script: string, args: string[]): RunResult {
  try {
    const stdout = execFileSync("/bin/bash", [script, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, EXPERTS_TELEMETRY: "0" },
    });
    return { exitCode: 0, stdout };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string };
    return { exitCode: e.status ?? 1, stdout: e.stdout ?? "" };
  }
}

function writeFixture(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

export async function testVendorProvenance(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const VALIDATOR = path.join(
    root,
    "scripts/validators/validate-vendor-provenance.sh",
  );
  const FIXTURES_DIR = path.join(
    root,
    "evals/fixtures/validators/validate-vendor-provenance",
  );

  // -- 1. RED fixture: dropped + renamed variants + undeclared vendoring ---
  {
    const redDir = path.join(FIXTURES_DIR, "red");
    const red = run(VALIDATOR, [redDir]);
    const stdout = red.stdout;
    const hasDropped = stdout.includes('"category":"dropped-variant"');
    const hasUndeclaredVariant = stdout.includes(
      '"category":"undeclared-variant"',
    );
    const hasUndeclaredProvenance = stdout.includes(
      '"category":"undeclared-vendor-provenance"',
    );
    if (
      red.exitCode !== 0 &&
      hasDropped &&
      hasUndeclaredVariant &&
      hasUndeclaredProvenance
    ) {
      ok(
        "validate-vendor-provenance — RED: dropped variant, renamed/undeclared variant, and undeclared vendoring all caught (exit != 0)",
      );
    } else {
      fail(
        "validate-vendor-provenance — RED",
        `expected exit!=0 with dropped-variant + undeclared-variant + undeclared-vendor-provenance, got exit=${red.exitCode} stdout=${stdout.slice(0, 600)}`,
      );
    }
  }

  // -- 2. GREEN fixture: declared manifest matches disk; declared ----------
  //    generated-from-memory + divergence note also passes.
  {
    const greenDir = path.join(FIXTURES_DIR, "green");
    const green = run(VALIDATOR, [greenDir]);
    if (green.exitCode === 0 && green.stdout.includes('"gaps":0')) {
      ok(
        "validate-vendor-provenance — GREEN: matching manifest and declared memory-generated divergence both pass",
      );
    } else {
      fail(
        "validate-vendor-provenance — GREEN",
        `expected exit=0 and 0 gaps, got exit=${green.exitCode} stdout=${green.stdout.slice(0, 400)}`,
      );
    }
  }

  // -- 3. False-positive stress cases (ad hoc, not the red/green pair) -----
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-provenance-fp-"));

    // 3a. A README that merely mentions a library in passing (no vendoring
    // language) must not be flagged as undeclared vendoring.
    writeFixture(
      tmp,
      "components/chart/README.md",
      [
        "# Chart",
        "",
        "This component renders data using our internal charting utilities.",
        "See the design system docs for usage.",
        "",
      ].join("\n"),
    );
    const fp1 = run(VALIDATOR, [tmp]);
    if (fp1.exitCode === 0) {
      ok(
        "validate-vendor-provenance — false-positive check: README mentioning a library without vendoring language not flagged",
      );
    } else {
      fail(
        "validate-vendor-provenance — false-positive check (incidental library mention)",
        `expected exit=0, got exit=${fp1.exitCode} stdout=${fp1.stdout.slice(0, 400)}`,
      );
    }
    fs.rmSync(path.join(tmp, "components", "chart"), { recursive: true });

    // 3b. Prose in a non-README markdown file (e.g. an agent prompt doc)
    // discussing vendoring as a CONCEPT must not be flagged — only a
    // directory's own README is treated as a provenance claim site.
    writeFixture(
      tmp,
      "agents/some-agent.md",
      [
        "# Some Agent",
        "",
        "When code is vendored from a library, record the source and version.",
        "",
      ].join("\n"),
    );
    const fp2 = run(VALIDATOR, [tmp]);
    if (fp2.exitCode === 0) {
      ok(
        "validate-vendor-provenance — false-positive check: non-README prose discussing vendoring as a concept not flagged",
      );
    } else {
      fail(
        "validate-vendor-provenance — false-positive check (non-README concept discussion)",
        `expected exit=0, got exit=${fp2.exitCode} stdout=${fp2.stdout.slice(0, 400)}`,
      );
    }
    fs.rmSync(path.join(tmp, "agents"), { recursive: true });

    // 3c. A VENDORED.md with a files: list that exactly matches disk, plus
    // extra unrelated non-component files (e.g. a .md doc) in the same
    // dir, must not be flagged — only component-extension files count.
    writeFixture(
      tmp,
      "components/ui2/VENDORED.md",
      ["source: radix-ui", "version: 1.0.0", "files: input.tsx", ""].join("\n"),
    );
    writeFixture(tmp, "components/ui2/input.tsx", "export {}\n");
    writeFixture(tmp, "components/ui2/NOTES.md", "internal notes\n");
    const fp3 = run(VALIDATOR, [tmp]);
    if (fp3.exitCode === 0) {
      ok(
        "validate-vendor-provenance — false-positive check: non-component files alongside a matching manifest not flagged",
      );
    } else {
      fail(
        "validate-vendor-provenance — false-positive check (non-component sibling file)",
        `expected exit=0, got exit=${fp3.exitCode} stdout=${fp3.stdout.slice(0, 400)}`,
      );
    }

    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
