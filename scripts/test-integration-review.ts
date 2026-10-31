/**
 * test-integration-review.ts — WP-A5 (INCREMENTAL_SCAN_PLAN.md) for scripts/test.ts.
 *
 * scripts/conductor/integration-review.mjs keeps a per-branch, per-reviewer
 * watermark and, on the next run, reviews only `<watermark>...HEAD` (reusing the
 * prior verdict of a reviewer the delta does not touch). A delta review is a
 * weaker guarantee than full re-approval, so the summary says `Scope: delta` and
 * validate-release-readiness.sh refuses it. Fixtures are tmp git repos (deleted
 * afterwards) with a fake `opencode` on OPENCODE_BIN that writes a review doc
 * ending `VERDICT: APPROVED` and appends one line per spawned session.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

export async function testIntegrationReview(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const script = path.join(root, "scripts/conductor/integration-review.mjs");
  const releaseVal = path.join(root, "scripts/validators/validate-release-readiness.sh");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "integ-review-"));
  const fx = path.join(tmp, "repo");
  const spawnLog = path.join(tmp, "spawns.log");
  fs.mkdirSync(fx, { recursive: true });
  fs.writeFileSync(spawnLog, "");

  const check = (cond: boolean, label: string, detail = "") =>
    cond ? ok(label) : fail(label, detail || "assertion false");

  try {
    const fakeOpencode = path.join(tmp, "opencode");
    fs.writeFileSync(
      fakeOpencode,
      `#!/usr/bin/env bash
prompt="$2"
doc=$(printf '%s' "$prompt" | grep -oE 'docs/reviews/[A-Za-z0-9_.-]+\\.md' | tail -1)
agent=$(printf '%s' "$prompt" | grep -oE '^SDLC-TASK for [A-Za-z-]+' | head -1 | awk '{print $3}')
delta=no; [[ "$prompt" == *"DELTA REVIEW: prior report"* ]] && delta=yes
echo "$agent delta=$delta" >> "$SPAWN_LOG"
mkdir -p "$(dirname "$doc")"
printf '# review\\n\\nVERDICT: APPROVED\\n' > "$doc"
`,
      { mode: 0o755 },
    );

    const env = {
      ...process.env,
      OPENCODE_BIN: fakeOpencode,
      SPAWN_LOG: spawnLog,
      GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
    } as NodeJS.ProcessEnv;
    const git = (...a: string[]) => {
      const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...a], { cwd: fx, env, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
    const write = (rel: string, content: string) => {
      const p = path.join(fx, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    };
    const commitFile = (rel: string, content: string, msg: string) => {
      write(rel, content);
      git("add", rel);
      git("commit", "-q", "-m", msg);
    };

    git("init", "-q", "-b", "main");
    commitFile("README.md", "# fixture\n", "base");
    git("checkout", "-q", "-b", "feat/x");
    commitFile("src/a.ts", "export const a = 1;\n", "feature a");
    commitFile("src/ui/App.tsx", "export const App = () => null;\n", "feature ui");

    const run = (...extra: string[]) => {
      const r = spawnSync(
        process.execPath,
        [script, "--root", fx, "--base", "main", "--head", "HEAD", "--model", "test/model", "--parallel", "off", ...extra],
        { cwd: root, env, encoding: "utf8", timeout: 170_000 },
      );
      const rows = (r.stdout || "").split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
      return { status: r.status, rows, stderr: r.stderr || "" };
    };
    const spawns = () => fs.readFileSync(spawnLog, "utf8").split("\n").filter(Boolean);
    const watermark = () => {
      try { return JSON.parse(fs.readFileSync(path.join(fx, "docs/work/.integration-reviewed.json"), "utf8")); } catch { return null; }
    };
    const scopeRow = (rows: any[]) => rows.find((x) => x.kind === "integration.scope");
    const summaryFor = (range: string) =>
      fs.readdirSync(path.join(fx, "docs/reviews")).filter((f) => f.startsWith(`INTEGRATION_SUMMARY_${range}`)).map((f) =>
        fs.readFileSync(path.join(fx, "docs/reviews", f), "utf8"))[0] || "";

    const head1 = git("rev-parse", "HEAD");

    // ---- 1. dry run: scope full, nothing written ---------------------------------
    const dry = run("--dry-run", "--no-scan", "--no-validators");
    check(dry.status === 0 && scopeRow(dry.rows)?.msg === "scope: full", "integration-review: first (dry) run logs scope: full",
      JSON.stringify(scopeRow(dry.rows)) + dry.stderr);
    check(watermark() === null, "integration-review: --dry-run writes no watermark");
    check(spawns().length === 0, "integration-review: --dry-run spawns no session");

    // ---- 2. first real run: full, watermark written ------------------------------
    const first = run("--no-scan", "--no-validators");
    const wm1 = watermark();
    check(first.status === 0 && scopeRow(first.rows)?.msg === "scope: full", "integration-review: first run is scope full and exits 0",
      JSON.stringify(scopeRow(first.rows)) + first.stderr);
    check(spawns().length === 4, "integration-review: first run spawns code-reviewer, security, perf and ux (UI touched)", spawns().join("|"));
    const branchWm = wm1?.["feat/x"];
    check(
      !!branchWm && ["code-reviewer", "security", "perf", "ux"].every((r) => branchWm[r]?.head_sha === head1 && branchWm[r]?.verdict === "APPROVED" && /^docs\/reviews\//.test(branchWm[r]?.doc)),
      "integration-review: watermark records head_sha, doc and verdict per reviewer under the branch", JSON.stringify(wm1),
    );
    check(/^Scope: full$/m.test(summaryFor(head1 ? `${git("merge-base", "main", "HEAD").slice(0, 12)}..${head1.slice(0, 12)}` : "")),
      "integration-review: summary of a full run says `Scope: full`");

    // ---- 3. one non-UI commit: delta, ux reused ----------------------------------
    commitFile("src/b.ts", "export const b = 2;\n", "fix b");
    const head2 = git("rev-parse", "HEAD");
    const before = spawns().length;
    const second = run("--no-scan", "--no-validators");
    const s2 = scopeRow(second.rows);
    check(
      second.status === 0 && s2?.scope === "delta" && s2?.msg === `scope: delta ${head1.slice(0, 7)}..${head2.slice(0, 7)}`,
      "integration-review: second run logs `scope: delta <wm7>..<head7>` with the right range", JSON.stringify(s2) + second.stderr,
    );
    const new2 = spawns().slice(before);
    check(
      new2.length === 3 && new2.every((l) => l.endsWith("delta=yes")) && !new2.some((l) => l.startsWith("ux-engineer")),
      "integration-review: only the reviewers triggered by the delta spawn, each with a DELTA REVIEW prompt (ux is not)", new2.join("|"),
    );
    check(
      second.rows.some((x) => x.kind === "integration.review.reused" && x.reviewer === "ux" && x.verdict === "APPROVED"),
      "integration-review: the reviewer the delta does not touch is reused (`integration.review.reused`)",
    );
    const wm2 = watermark()?.["feat/x"];
    check(!!wm2 && ["code-reviewer", "security", "perf", "ux"].every((r) => wm2[r]?.head_sha === head2),
      "integration-review: watermark advances to the new head for spawned and reused reviewers", JSON.stringify(wm2));
    const sum2 = summaryFor(`${head1.slice(0, 12)}..${head2.slice(0, 12)}`);
    check(
      new RegExp(`^Scope: delta ${head1.slice(0, 7)}\\.\\.${head2.slice(0, 7)} \\(reviewers reused: ux\\)$`, "m").test(sum2),
      "integration-review: delta summary says `Scope: delta <wm7>..<head7> (reviewers reused: ux)`", sum2.slice(0, 400),
    );

    // ---- 4. nothing changed: everything reused, nothing spawned ------------------
    const before3 = spawns().length;
    const third = run("--no-scan", "--no-validators");
    check(
      third.status === 0 && spawns().length === before3 &&
        third.rows.filter((x) => x.kind === "integration.review.reused").length === 4,
      "integration-review: no change since the watermark reuses every verdict and spawns nothing", third.rows.map((x) => x.kind).join(",") + third.stderr,
    );

    // ---- 5. --since full: full again, watermark cleared first --------------------
    const dryFull = run("--dry-run", "--since", "full", "--no-scan", "--no-validators");
    check(dryFull.status === 0 && scopeRow(dryFull.rows)?.msg === "scope: full" && watermark()?.["feat/x"]?.security?.head_sha === head2,
      "integration-review: --since full --dry-run logs scope: full and leaves the watermark alone");
    const before4 = spawns().length;
    const forced = run("--since", "full", "--no-scan", "--no-validators");
    check(
      forced.status === 0 && scopeRow(forced.rows)?.msg === "scope: full" &&
        forced.rows.some((x) => x.kind === "integration.watermark.cleared") && spawns().length - before4 === 4,
      "integration-review: --since full logs scope: full, clears the watermark and re-reviews everyone", JSON.stringify(scopeRow(forced.rows)) + forced.stderr,
    );
    check(watermark()?.["feat/x"]?.security?.scope === "full", "integration-review: the full run re-seeds the watermark (scope full)");

    // ---- 6. a watermark that is not an ancestor falls back to full ---------------
    const wmBad = watermark();
    for (const r of Object.keys(wmBad["feat/x"])) wmBad["feat/x"][r].head_sha = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    fs.writeFileSync(path.join(fx, "docs/work/.integration-reviewed.json"), JSON.stringify(wmBad));
    const bad = run("--dry-run", "--no-scan", "--no-validators");
    check(scopeRow(bad.rows)?.msg === "scope: full", "integration-review: a watermark that is not an ancestor of HEAD falls back to scope full", JSON.stringify(scopeRow(bad.rows)));

    // ---- 7. validators run before the sessions and are linked in the summary -----
    commitFile("src/c.ts", "export const c = 3;\n", "more c");
    const head3 = git("rev-parse", "HEAD");
    const withVal = run("--no-scan");
    const valRow = withVal.rows.find((x) => x.kind === "integration.validators");
    const sum3 = summaryFor(`${git("merge-base", "main", "HEAD").slice(0, 12)}..${head3.slice(0, 12)}`) ||
      fs.readdirSync(path.join(fx, "docs/reviews")).filter((f) => f.startsWith("INTEGRATION_SUMMARY_")).map((f) => fs.readFileSync(path.join(fx, "docs/reviews", f), "utf8")).filter((t) => t.includes(head3)).join("\n");
    check(
      !!valRow && /\| Validator \| Exit \|/.test(sum3) &&
        ["validate-code-health.sh", "validate-dead-code.sh", "validate-deps.sh"].every((v) => new RegExp(`\\| ${v.replace(/\./g, "\\.")} \\| \\d+ \\|`).test(sum3)),
      "integration-review: summary links validate-code-health/dead-code/deps exit codes in a `| Validator | Exit |` table", sum3.slice(0, 900),
    );
    const logText = fs.readFileSync(path.join(fx, "docs/work/integration-review-log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const lastValIdx = logText.map((x) => x.kind).lastIndexOf("integration.validators");
    const lastStartIdx = logText.map((x) => x.kind).lastIndexOf("integration.review.start");
    check(lastValIdx >= 0 && lastValIdx < lastStartIdx, "integration-review: validators run before the model sessions start");

    // ---- 8. validate-release-readiness.sh refuses Scope: delta -------------------
    const rel = (scopeLine: string) => {
      const proj = fs.mkdtempSync(path.join(tmp, "rel-"));
      const g = (...a: string[]) => spawnSync("git", ["-c", "commit.gpgsign=false", ...a], { cwd: proj, env, encoding: "utf8" });
      g("init", "-q", "-b", "main");
      fs.mkdirSync(path.join(proj, "docs/reviews"), { recursive: true });
      fs.writeFileSync(path.join(proj, "README.md"), "x\n");
      g("add", "-A"); g("commit", "-q", "-m", "c");
      const sha = g("rev-parse", "HEAD").stdout.trim();
      fs.writeFileSync(
        path.join(proj, "docs/reviews/INTEGRATION_SUMMARY_aaaaaaaaaaaa..bbbbbbbbbbbb_2026-10-31.md"),
        `# Integration review\n\n${scopeLine}\nBase-SHA: ${sha}\nHead-SHA: ${sha}\n\nINTEGRATION: APPROVED\n`,
      );
      const r = spawnSync("bash", [releaseVal, proj], { cwd: proj, env: { ...env, PROJECT_ROOT: proj }, encoding: "utf8", timeout: 60_000 });
      return `${r.stdout}\n${r.stderr}`;
    };
    const deltaOut = rel("Scope: delta abc1234..def5678 (reviewers reused: ux)");
    check(/integration-review-delta-scope/.test(deltaOut) && !/INTEGRATION_SUMMARY scope is full/.test(deltaOut),
      "validate-release-readiness.sh: fails with a clear gap when the newest INTEGRATION_SUMMARY says `Scope: delta`", deltaOut.slice(-600));
    const fullOut = rel("Scope: full");
    check(!/integration-review-delta-scope/.test(fullOut) && /INTEGRATION_SUMMARY scope is full/.test(fullOut),
      "validate-release-readiness.sh: the `Scope: full` summary passes the scope check", fullOut.slice(-600));
  } catch (e) {
    fail("integration-review: fixture ran", String((e as Error)?.stack || e));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
