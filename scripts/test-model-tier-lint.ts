/**
 * test-model-tier-lint.ts -- Pass 29 chapter module for scripts/test.ts (T30.1,
 * M30 model-tier guard).
 *
 * Two things get unit-tested here, per the ticket's own acceptance criteria:
 *   1. Tier resolution (scripts/lib/model-tiers.mjs) -- every glob pattern
 *      declared in the live models.json's tiers registry, exercised with a
 *      real example model id, plus the no-match/gate-policy/max_output_real
 *      lookups.
 *   2. The G3 config-pin lint (scripts/validators/validate-model-pins.sh) --
 *      a planted frontier-tier pin (the exact 2026-07-08 opus-4.8 misconfig
 *      class) must fail the validator (exit 1); a raw non-frontier pin warns
 *      but does not fail; a clean tree passes with zero findings.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

export async function testModelTierLint(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const lib = await import(
    pathToFileURL(path.join(root, "scripts/lib/model-tiers.mjs")).href
  );
  const { resolveTier, getGatePolicy, getMaxOutputReal, scanRepoForModelPins } =
    lib;
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "models.json"), "utf8"),
  );

  // -- 1. tier resolution: every match pattern in the live registry --------
  const cases: Array<[string, string, string | null]> = [
    ["local — lmstudio/*", "lmstudio/qwen3.6-35b-a3b", "local"],
    ["local — lmstudio-remote/*", "lmstudio-remote/gemma-qat", "local"],
    ["cheap — google/gemini-*-flash*", "google/gemini-2.5-flash", "cheap"],
    [
      "cheap — google/gemini-*-flash* (suffix variant)",
      "google/gemini-2.5-flash-lite",
      "cheap",
    ],
    ["cheap — *haiku*", "anthropic/claude-haiku-4-5", "cheap"],
    ["frontier — *opus*", "anthropic/claude-opus-4-8", "frontier"],
    ["frontier — *sonnet*", "github-copilot/claude-sonnet-5", "frontier"],
    ["frontier — *fable*", "claude-fable-5", "frontier"],
    ["frontier — *gpt-5*", "openai/gpt-5", "frontier"],
    ["frontier — *gemini-*-pro*", "google/gemini-2.5-pro", "frontier"],
    ["no match — unknown model", "unknown/foo-bar", null],
  ];
  for (const [label, modelId, expected] of cases) {
    const got = resolveTier(modelId, config);
    if (got === expected)
      ok(`model-tiers — ${label} (-> ${expected ?? "null"})`);
    else
      fail(
        `model-tiers — ${label}`,
        `resolveTier("${modelId}") expected ${expected}, got ${got}`,
      );
  }

  // -- gate policy + max_output_real ---------------------------------------
  if (getGatePolicy("anthropic/claude-opus-4-8", config) === "escalation-token")
    ok("model-tiers — frontier gate policy is escalation-token");
  else fail("model-tiers — frontier gate policy", "expected escalation-token");

  if (getGatePolicy("lmstudio/qwen3.6-35b-a3b", config) === "none")
    ok("model-tiers — local gate policy is none");
  else fail("model-tiers — local gate policy", "expected none");

  if (getGatePolicy("unknown/foo-bar", config) === null)
    ok("model-tiers — unresolved model has no gate policy");
  else fail("model-tiers — unresolved gate policy", "expected null");

  if (getMaxOutputReal("lmstudio/qwen3.6-35b-a3b", config) === 10000)
    ok("model-tiers — max_output_real lookup (qwen3.6, the 45k/10k lesson)");
  else fail("model-tiers — max_output_real lookup", "expected 10000");

  if (getMaxOutputReal("unknown/foo-bar", config) === null)
    ok("model-tiers — max_output_real lookup, unknown model -> null");
  else fail("model-tiers — max_output_real unknown model", "expected null");

  // The CLI entry guard must survive symlinked paths such as macOS /tmp ->
  // /private/tmp; otherwise verification exits 0 without running main().
  const cliFixture = fs.mkdtempSync(path.join(fs.realpathSync(root), ".tmp-model-tier-cli-"));
  try {
    const cliAlias = path.join(cliFixture, "model-tiers.mjs");
    fs.symlinkSync(path.join(root, "scripts/lib/model-tiers.mjs"), cliAlias);
    const result = spawnSync(
      process.execPath,
      [cliAlias, "resolve", "github-copilot/claude-sonnet-5", path.join(root, "models.json")],
      { encoding: "utf8" },
    );
    if (result.status === 0 && result.stdout.trim() === "frontier")
      ok("model-tiers — CLI runs through a symlinked script path");
    else
      fail(
        "model-tiers — CLI symlink path",
        `exit=${result.status}; stdout=${JSON.stringify(result.stdout)}; stderr=${JSON.stringify(result.stderr)}`,
      );
  } finally {
    fs.rmSync(cliFixture, { recursive: true, force: true });
  }

  // -- 2. G3 config-pin lint: planted fixtures via the real CLI ------------
  const scriptPath = path.join(
    root,
    "scripts/validators/validate-model-pins.sh",
  );

  function runValidator(fixtureDir: string): {
    exitCode: number;
    stderr: string;
  } {
    const result = spawnSync("bash", [scriptPath, fixtureDir], {
      encoding: "utf8",
    });
    return { exitCode: result.status ?? 1, stderr: result.stderr ?? "" };
  }

  function mkFixture(name: string): string {
    const dir = fs.mkdtempSync(
      path.join(fs.realpathSync(root), `.tmp-model-pins-${name}-`),
    );
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "agents"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "models.json"),
      JSON.stringify(config, null, 2),
    );
    return dir;
  }

  // RED: a planted repo opus-pin must fail the validator (acceptance criterion).
  {
    const dir = mkFixture("red");
    fs.writeFileSync(
      path.join(dir, "agents/some-agent.md"),
      "---\nname: some-agent\nmodel: anthropic/claude-opus-4-8\n---\nbody\n",
    );
    const result = runValidator(dir);
    if (result.exitCode !== 0 && /claude-opus-4-8/.test(result.stderr))
      ok(
        "validate-model-pins — RED: a planted repo opus-pin fails the validator (exit != 0)",
      );
    else
      fail(
        "validate-model-pins — planted opus-pin",
        `exitCode=${result.exitCode} stderr=${result.stderr}`,
      );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // WARN: a raw non-frontier pin outside models.json warns but does not fail.
  {
    const dir = mkFixture("warn");
    fs.writeFileSync(
      path.join(dir, "agents/some-agent.md"),
      "---\nname: some-agent\nmodel: lmstudio/qwen3.6-35b-a3b\n---\nbody\n",
    );
    const result = runValidator(dir);
    if (result.exitCode === 0 && /qwen3\.6-35b-a3b/.test(result.stderr))
      ok(
        "validate-model-pins — WARN: a raw local-tier pin outside models.json warns without failing",
      );
    else
      fail(
        "validate-model-pins — warn-only pin",
        `exitCode=${result.exitCode} stderr=${result.stderr}`,
      );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // GREEN: a clean tree passes with zero findings.
  {
    const dir = mkFixture("clean");
    const result = runValidator(dir);
    if (result.exitCode === 0 && !/\[GAP\]|\[WARN\]/.test(result.stderr))
      ok("validate-model-pins — GREEN: a clean tree passes with zero findings");
    else
      fail(
        "validate-model-pins — clean tree",
        `exitCode=${result.exitCode} stderr=${result.stderr}`,
      );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // -- direct scanRepoForModelPins() severity classification (unit, not CLI) --
  {
    const dir = mkFixture("classify");
    fs.writeFileSync(
      path.join(dir, "agents/frontier.md"),
      "---\nmodel: anthropic/claude-opus-4-8\n---\n",
    );
    fs.writeFileSync(
      path.join(dir, "agents/local.md"),
      "---\nmodel: lmstudio/qwen3.6-35b-a3b\n---\n",
    );
    const modelsJsonPath = path.join(dir, "models.json");
    const findings = scanRepoForModelPins(dir, config, modelsJsonPath);
    const frontierFinding = findings.find(
      (f: { modelId: string }) => f.modelId === "anthropic/claude-opus-4-8",
    );
    const localFinding = findings.find(
      (f: { modelId: string }) => f.modelId === "lmstudio/qwen3.6-35b-a3b",
    );
    if (
      frontierFinding?.severity === "gap" &&
      localFinding?.severity === "warn"
    )
      ok(
        "model-tiers — scanRepoForModelPins() classifies frontier=gap, local=warn",
      );
    else
      fail(
        "model-tiers — scanRepoForModelPins classification",
        JSON.stringify(findings),
      );

    // models.json itself must never be scanned as a pin source.
    const selfFinding = findings.find(
      (f: { file: string }) => f.file === "models.json",
    );
    if (!selfFinding)
      ok("model-tiers — scanRepoForModelPins() excludes models.json itself");
    else
      fail(
        "model-tiers — models.json self-exclusion",
        JSON.stringify(selfFinding),
      );

    fs.rmSync(dir, { recursive: true, force: true });
  }
}
