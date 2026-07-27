/**
 * test-verify-receipt.ts — chapter module for scripts/test.ts.
 *
 * verify-receipt.mjs exists to make one failure impossible: an agent reporting
 * "typecheck clean" when it was not. The properties worth pinning are the ones
 * that make the receipt evidence rather than another claim.
 *
 * The staleness rule is the subtle one and was wrong in the first draft. A receipt
 * names the commit it ran at, but committing the receipt moves HEAD — so an exact
 * SHA match makes every receipt invalid the instant it is recorded. The rule is
 * "no MATERIAL change since", where the receipt directory itself is not material.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}
function run(script: string, cwd: string, args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("node", [script, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

export function testVerifyReceipt(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  const script = path.join(root, "scripts/verify-receipt.mjs");
  if (!fs.existsSync(script)) {
    fail("verify-receipt — script present", `${script} not found`);
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-receipt-"));
  try {
    const proj = path.join(tmp, "p");
    fs.mkdirSync(path.join(proj, "src"), { recursive: true });
    const setScripts = (typecheck: string) =>
      fs.writeFileSync(
        path.join(proj, "package.json"),
        JSON.stringify({ name: "p", scripts: { typecheck, test: 'node -e "process.exit(0)"' } }),
      );
    setScripts('node -e "process.exit(0)"');
    fs.writeFileSync(path.join(proj, "src/a.js"), "a\n");
    git(proj, "init", "-q");
    git(proj, "config", "user.email", "t@t");
    git(proj, "config", "user.name", "t");
    git(proj, "add", "-A");
    git(proj, "commit", "-qm", "init");

    // -- config must exist and be committed; commands never come from an argument
    const noCfg = run(script, proj, ["--ticket=T-1"]);
    if (noCfg.code === 2 && /verify\.json/.test(noCfg.out))
      ok("verify-receipt — refuses to run without a committed .sdlc/verify.json");
    else fail("verify-receipt — missing config", `exit=${noCfg.code} out=${noCfg.out.trim()}`);

    run(script, proj, ["--init"]);
    git(proj, "add", "-A");
    git(proj, "commit", "-qm", "cfg");

    // -- RED: the gate must refuse work that was never verified
    const noReceipt = run(script, proj, ["--ticket=T-1", "--check"]);
    if (noReceipt.code === 1 && /no receipt/.test(noReceipt.out))
      ok("verify-receipt — RED: a ticket with no receipt is unverified, not assumed passing");
    else fail("verify-receipt — RED no receipt", `exit=${noReceipt.code} out=${noReceipt.out.trim()}`);

    // -- GREEN: receipt recorded, then committed (HEAD moves) — still valid
    run(script, proj, ["--ticket=T-1"]);
    git(proj, "add", "-A");
    git(proj, "commit", "-qm", "receipt");
    const afterCommit = run(script, proj, ["--ticket=T-1", "--check"]);
    if (afterCommit.code === 0)
      ok("verify-receipt — GREEN: committing the receipt moves HEAD but does not invalidate it");
    else
      fail(
        "verify-receipt — GREEN receipt survives its own commit",
        `exit=${afterCommit.code} out=${afterCommit.out.trim()}`,
      );

    // -- RED: source moved since the receipt, so it no longer describes this code
    fs.appendFileSync(path.join(proj, "src/a.js"), "b\n");
    git(proj, "add", "-A");
    git(proj, "commit", "-qm", "src change");
    const stale = run(script, proj, ["--ticket=T-1", "--check"]);
    if (stale.code === 1 && /source changed/.test(stale.out))
      ok("verify-receipt — RED: a receipt predating a source change is stale, not evidence");
    else fail("verify-receipt — RED stale receipt", `exit=${stale.code} out=${stale.out.trim()}`);

    // -- RED: the failure this whole script exists to make un-narratable
    setScripts('node -e "process.exit(2)"');
    git(proj, "add", "-A");
    git(proj, "commit", "-qm", "break typecheck");
    const runFail = run(script, proj, ["--ticket=T-2"]);
    git(proj, "add", "-A");
    git(proj, "commit", "-qm", "receipt2");
    const gateFail = run(script, proj, ["--ticket=T-2", "--check"]);
    const receiptFile = fs
      .readdirSync(path.join(proj, "docs/work/receipts"))
      .find((f) => f.startsWith("T-2"));
    const recorded = JSON.parse(
      fs.readFileSync(path.join(proj, "docs/work/receipts", receiptFile!), "utf8"),
    );
    const typecheck = recorded.results.find((r: any) => r.name === "typecheck");
    if (runFail.code === 1 && gateFail.code === 1 && typecheck.exitCode === 2)
      ok("verify-receipt — RED: a failing command is recorded as a non-zero exit and gates the ticket");
    else
      fail(
        "verify-receipt — RED failing command",
        `run=${runFail.code} gate=${gateFail.code} recordedExit=${typecheck?.exitCode}`,
      );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
