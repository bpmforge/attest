#!/usr/bin/env node
/**
 * verify-receipt.mjs — the agent does not author its own pass/fail.
 *
 * The most repeated failure in delegated work is a completion report claiming
 * "tsc clean / lint clean / tests pass" when a re-run says otherwise. It appeared
 * in 4 of 5 named tickets in one downstream project's field report, and every
 * instance cost a correction round. The lead currently catches it by hand, per
 * ticket, forever — which is the only reason the escape rate is zero, and the
 * first discipline a deadline will erode.
 *
 * `validate-completion-manifest.sh` deliberately declines this case, for sound
 * reasons stated in its own header: re-executing a command string extracted from
 * prose is an injection vector and is not reproducible in a validator's context.
 * That reasoning is correct and is NOT reversed here.
 *
 * The fix is not to re-run prose. It is to stop letting the agent write the
 * numbers at all. A project declares its verify commands ONCE, in a file under
 * version control. This wrapper runs exactly those, and writes a receipt holding
 * each command, its exit code, an output tail, and the commit it ran at. The
 * agent cites the receipt; it never authors a field in it. A non-zero exit is
 * physically present in the artifact and cannot be narrated away.
 *
 *   node verify-receipt.mjs --ticket=T-123           # run the suite, write the receipt
 *   node verify-receipt.mjs --ticket=T-123 --check   # gate: receipt real, current, green
 *   node verify-receipt.mjs --init                   # scaffold .sdlc/verify.json
 *
 * Options:
 *   --root=<dir>   project root (default: cwd)
 *   --out=<dir>    receipt directory (default: docs/work/receipts)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const ROOT = (() => {
  const r = opt("root", process.cwd());
  return isAbsolute(r) ? r : join(process.cwd(), r);
})();
const CONFIG = join(ROOT, ".sdlc", "verify.json");
const OUT = (() => {
  const o = opt("out", join("docs", "work", "receipts"));
  return isAbsolute(o) ? o : join(ROOT, o);
})();

const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** HEAD as the receipt's identity. A receipt that does not name a commit proves nothing. */
function head() {
  try {
    return sh("git rev-parse HEAD");
  } catch {
    return null;
  }
}

/** Uncommitted changes mean the receipt describes a tree nobody else can fetch. */
function dirty() {
  try {
    return sh("git status --porcelain").length > 0;
  } catch {
    return false;
  }
}

/**
 * Commands come from a committed file, never from an argument or from prose.
 * That is the whole mechanism: the set is fixed before the work starts, so it
 * cannot be narrowed to the ones that happen to pass.
 */
function loadConfig() {
  if (!existsSync(CONFIG)) {
    console.error(`verify-receipt: no ${CONFIG.replace(ROOT + "/", "")}`);
    console.error(`verify-receipt: run --init to scaffold one, then commit it`);
    process.exit(2);
  }
  const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
  if (!Array.isArray(cfg.commands) || !cfg.commands.length) {
    console.error(`verify-receipt: ${CONFIG} has no "commands" array`);
    process.exit(2);
  }
  return cfg;
}

function init() {
  const detected = [];
  const add = (name, cmd) => detected.push({ name, cmd });
  if (existsSync(join(ROOT, "package.json"))) {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const s = pkg.scripts ?? {};
    if (s.typecheck) add("typecheck", "npm run typecheck");
    else add("typecheck", "npx tsc --noEmit");
    if (s.lint) add("lint", "npm run lint");
    if (s["test:run"]) add("test", "npm run test:run");
    else if (s.test) add("test", "npm test");
  }
  if (existsSync(join(ROOT, "Cargo.toml"))) {
    add("check", "cargo check --all-targets");
    add("clippy", "cargo clippy --all-targets -- -D warnings");
    add("test", "cargo test");
  }
  if (existsSync(join(ROOT, "go.mod"))) {
    add("vet", "go vet ./...");
    add("test", "go test ./...");
  }
  if (!detected.length) {
    console.error("verify-receipt: no manifest recognized — write .sdlc/verify.json by hand");
    process.exit(2);
  }
  mkdirSync(join(ROOT, ".sdlc"), { recursive: true });
  writeFileSync(CONFIG, JSON.stringify({ commands: detected }, null, 2) + "\n");
  console.log(`verify-receipt: wrote ${CONFIG.replace(ROOT + "/", "")} with ${detected.length} command(s)`);
  console.log(`  ${detected.map((d) => d.name).join(", ")}`);
  console.log(`Review it, adjust, and COMMIT it — an uncommitted config can be edited to pass.`);
  return 0;
}

function run(ticket) {
  const cfg = loadConfig();
  const sha = head();
  if (!sha) {
    console.error("verify-receipt: not a git repository — a receipt needs a commit to name");
    return 2;
  }

  const results = [];
  for (const { name, cmd } of cfg.commands) {
    process.stdout.write(`  ${name.padEnd(12)} `);
    let code = 0;
    let out = "";
    try {
      out = execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      code = e.status ?? 1;
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    // Tail, not head: compilers and test runners put the verdict last.
    const tail = out.trim().split("\n").slice(-12).join("\n");
    results.push({ name, cmd, exitCode: code, tail });
    console.log(code === 0 ? "PASS" : `FAIL (exit ${code})`);
  }

  const receipt = {
    ticket,
    sha,
    dirty: dirty(),
    branch: (() => {
      try {
        return sh("git rev-parse --abbrev-ref HEAD");
      } catch {
        return null;
      }
    })(),
    results,
    // No "status: pass" field. The exit codes ARE the status; a summary field is
    // something a later editor could flip without touching the evidence.
  };

  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${ticket}-${sha.slice(0, 8)}.json`);
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");

  const failed = results.filter((r) => r.exitCode !== 0);
  console.log(`\nverify-receipt: wrote ${path.replace(ROOT + "/", "")}`);
  if (receipt.dirty) console.log("  WARNING: working tree dirty — this receipt describes uncommitted state");
  console.log(
    failed.length
      ? `  ${failed.length}/${results.length} FAILED: ${failed.map((f) => f.name).join(", ")}`
      : `  ${results.length}/${results.length} passed`,
  );
  return failed.length ? 1 : 0;
}

/**
 * The gate. Three ways a receipt fails to be evidence, all mechanical:
 * absent, stale (ran against a different commit), or containing a failure.
 */
function check(ticket) {
  const sha = head();
  if (!sha) {
    console.error("verify-receipt: not a git repository");
    return 2;
  }
  if (!existsSync(OUT)) {
    console.error(`verify-receipt: no receipt directory at ${OUT.replace(ROOT + "/", "")}`);
    return 1;
  }

  const files = readdirSync(OUT).filter((f) => f.startsWith(`${ticket}-`) && f.endsWith(".json"));
  if (!files.length) {
    console.error(`verify-receipt: no receipt for ${ticket} — the work is unverified`);
    return 1;
  }

  // A receipt names the commit it ran at, but committing the receipt itself moves
  // HEAD — so requiring an exact match would make every receipt invalid the moment
  // it was recorded. The real question is not "is this the same commit" but "could
  // anything have changed the outcome since". Accept a receipt whose commit is an
  // ancestor of HEAD with no source changes in between; receipts and other declared
  // no-effect paths do not count as source.
  const relOut = OUT.replace(ROOT + "/", "");
  const ignore = [relOut, ...(existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")).ignorePaths ?? [] : [])];

  let current = null;
  for (const f of files) {
    const rSha = JSON.parse(readFileSync(join(OUT, f), "utf8")).sha;
    if (!rSha) continue;
    if (rSha === sha) {
      current = f;
      break;
    }
    let changed;
    try {
      changed = sh(`git diff --name-only ${rSha} HEAD`).split("\n").filter(Boolean);
    } catch {
      continue; // receipt names a commit this clone does not have
    }
    const material = changed.filter((c) => !ignore.some((i) => i && c.startsWith(i)));
    if (!material.length) {
      current = f;
      break;
    }
  }

  if (!current) {
    console.error(
      `verify-receipt: ${ticket} has ${files.length} receipt(s), none covering HEAD ${sha.slice(0, 8)}`,
    );
    console.error(`  found: ${files.join(", ")}`);
    console.error(`  source changed since every one of them — re-run the suite`);
    return 1;
  }

  const receipt = JSON.parse(readFileSync(join(OUT, current), "utf8"));
  const failed = (receipt.results ?? []).filter((r) => r.exitCode !== 0);
  if (receipt.dirty) {
    console.error(`verify-receipt: ${current} was recorded against a dirty tree — not reproducible`);
    return 1;
  }
  if (failed.length) {
    for (const f of failed) console.error(`verify-receipt: ${f.name} exited ${f.exitCode}`);
    console.error(`verify-receipt: ${failed.length} command(s) failed at ${sha.slice(0, 8)}`);
    return 1;
  }
  const at = receipt.sha === sha ? "at HEAD" : `at ${receipt.sha.slice(0, 8)}, still current`;
  console.log(
    `verify-receipt: ${ticket} verified ${at} — ` +
      `${receipt.results.length}/${receipt.results.length} commands passed`,
  );
  return 0;
}

if (argv.includes("--init")) process.exit(init());
const ticket = opt("ticket");
if (!ticket) {
  console.error("verify-receipt: pass --ticket=<id> [--check], or --init");
  process.exit(2);
}
process.exit(argv.includes("--check") ? check(ticket) : run(ticket));
