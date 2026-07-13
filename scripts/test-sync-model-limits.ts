/**
 * test-sync-model-limits.ts -- Pass 31 chapter module for scripts/test.ts
 * (T30.8, LOCAL_CONTEXT_INTEGRITY_DESIGN P2 -- context-limit sync).
 *
 * scripts/lib/model-limits-sync.mjs's planSync() is pure (no fetch/fs), so
 * every scenario runs against fixture "loaded models" arrays and fixture
 * opencode config objects -- no live LM Studio needed. Covers the ticket's
 * own acceptance bullets directly:
 *   1. mismatch fixture (config > loaded) corrected by sync
 *   2. sub-floor load refused with the message
 *   3. plus: already-truthful no-op, output-cap from models.json capped at
 *      the hard 32k ceiling, non-matching-origin providers left untouched,
 *      not-loaded models skipped, and the local-profile compaction/tool_output
 *      trim only firing (and only ever tightening) when something changed.
 * (The third acceptance bullet -- "a big-tool-output run compacts and
 * completes instead of 400ing" -- is a live end-to-end behavior against a
 * real loaded model + opencode session; verified manually, see PR evidence.)
 */

import * as path from "path";
import { pathToFileURL } from "url";

type Finding = string;

export async function testSyncModelLimits(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const mod = await import(
    pathToFileURL(path.join(root, "scripts/lib/model-limits-sync.mjs")).href
  );
  const { planSync, HARD_OUTPUT_CEILING, SYNC_DEFAULTS } = mod;

  const BASE = "http://127.0.0.1:1234";
  const modelsConfig = {
    models: { "qwen/loaded-model": { max_output_real: 10000 } },
  };

  function baseCfg(limitOverrides: Record<string, unknown> = {}) {
    return {
      provider: {
        lmstudio: {
          options: { baseURL: `${BASE}/v1` },
          models: {
            "qwen/loaded-model": { limit: limitOverrides },
          },
        },
      },
    };
  }
  function dropEmptyLimit(cfg: any) {
    // fixtures pass `{}` for "no limit configured yet" -- planSync treats an
    // absent key and an empty object identically via `modelCfg.limit ?? {}`.
    if (
      cfg.provider.lmstudio.models["qwen/loaded-model"].limit &&
      Object.keys(cfg.provider.lmstudio.models["qwen/loaded-model"].limit)
        .length === 0
    ) {
      delete cfg.provider.lmstudio.models["qwen/loaded-model"].limit;
    }
    return cfg;
  }

  const findingsFor = (findings: Finding[], prefix: string) =>
    findings.filter((f) => f.startsWith(prefix));

  // -- 1. mismatch fixture: config has a STALE limit.context higher than the
  //    truthful (loaded - margin) value -- must be corrected, not left alone
  //    (this is the exact "config > loaded" defect class named in the
  //    ticket's acceptance criteria). ---------------------------------------
  {
    const loaded = [
      { id: "qwen/loaded-model", state: "loaded", type: "llm", loaded_context_length: 65536 },
    ];
    const cfg = dropEmptyLimit(baseCfg({ context: 999999, output: 40000 }));
    const res = planSync(loaded, cfg, { baseUrl: BASE, modelsConfig });
    const wantContext = 65536 - SYNC_DEFAULTS.margin;
    const gotLimit = res.cfg.provider.lmstudio.models["qwen/loaded-model"].limit;
    if (res.changed && gotLimit.context === wantContext && gotLimit.output === 10000) {
      ok("sync-model-limits — mismatch fixture (config > loaded) corrected");
    } else {
      fail(
        "sync-model-limits — mismatch fixture (config > loaded) corrected",
        `expected changed=true, limit={${wantContext},10000}, got changed=${res.changed}, limit=${JSON.stringify(gotLimit)}`,
      );
    }
    if (findingsFor(res.findings, "SYNC").some((f) => f.includes("999999"))) {
      ok("sync-model-limits — mismatch finding names the stale value");
    } else {
      fail("sync-model-limits — mismatch finding names the stale value", res.findings.join(" | "));
    }
  }

  // -- 2. sub-floor load: loaded context below the floor must be REFUSEd,
  //    not written -- V7's unconverging-compaction-loop failure mode. -------
  {
    const loaded = [
      { id: "qwen/loaded-model", state: "loaded", type: "llm", loaded_context_length: 8192 },
    ];
    const cfg = dropEmptyLimit(baseCfg({}));
    const res = planSync(loaded, cfg, { baseUrl: BASE, modelsConfig });
    const untouched = res.cfg.provider.lmstudio.models["qwen/loaded-model"].limit === undefined;
    if (res.refused && !res.changed && untouched) {
      ok("sync-model-limits — sub-floor load refused, limit left unwritten");
    } else {
      fail(
        "sync-model-limits — sub-floor load refused, limit left unwritten",
        `expected refused=true changed=false limit=unset, got refused=${res.refused} changed=${res.changed} limit=${JSON.stringify(res.cfg.provider.lmstudio.models["qwen/loaded-model"].limit)}`,
      );
    }
    const refuseFindings = findingsFor(res.findings, "REFUSE");
    if (refuseFindings.length === 1 && /load the per-model default context|raise the per-model default context/.test(refuseFindings[0])) {
      ok("sync-model-limits — refusal message says to load the model bigger");
    } else {
      fail("sync-model-limits — refusal message says to load the model bigger", res.findings.join(" | "));
    }
  }

  // -- 3. already-truthful config: no-op, no compaction/tool_output trim
  //    fires when nothing needed changing. ---------------------------------
  {
    const loaded = [
      { id: "qwen/loaded-model", state: "loaded", type: "llm", loaded_context_length: 65536 },
    ];
    const truthfulContext = 65536 - SYNC_DEFAULTS.margin;
    const cfg = baseCfg({ context: truthfulContext, output: 10000 });
    const res = planSync(loaded, cfg, { baseUrl: BASE, modelsConfig });
    if (!res.changed && res.cfg.compaction === undefined && res.cfg.tool_output === undefined) {
      ok("sync-model-limits — already-truthful config is a true no-op");
    } else {
      fail(
        "sync-model-limits — already-truthful config is a true no-op",
        `expected changed=false and no compaction/tool_output keys, got changed=${res.changed} compaction=${JSON.stringify(res.cfg.compaction)} tool_output=${JSON.stringify(res.cfg.tool_output)}`,
      );
    }
  }

  // -- 4. output cap: models.json max_output_real is honored but always
  //    clamped to the hard 32k ceiling (opencode ignores anything above it
  //    regardless of what's configured -- design doc Part 1/4). ------------
  {
    const loaded = [
      { id: "big-output-model", state: "loaded", type: "llm", loaded_context_length: 131072 },
    ];
    const cfg = {
      provider: {
        lmstudio: { options: { baseURL: `${BASE}/v1` }, models: { "big-output-model": {} } },
      },
    };
    const modelsConfigBig = { models: { "big-output-model": { max_output_real: 999999 } } };
    const res = planSync(loaded, cfg, { baseUrl: BASE, modelsConfig: modelsConfigBig });
    const got = res.cfg.provider.lmstudio.models["big-output-model"].limit.output;
    if (got === HARD_OUTPUT_CEILING && HARD_OUTPUT_CEILING === 32000) {
      ok("sync-model-limits — output clamped to the hard 32k ceiling regardless of max_output_real");
    } else {
      fail(
        "sync-model-limits — output clamped to the hard 32k ceiling",
        `expected ${HARD_OUTPUT_CEILING}, got ${got}`,
      );
    }
  }

  // -- 5. non-matching-origin provider left completely untouched (a :12345
  //    remote provider must not be affected by a :1234 probe -- the exact
  //    startsWith-vs-origin bug the design doc's live validation caught). --
  {
    const loaded = [
      { id: "qwen/loaded-model", state: "loaded", type: "llm", loaded_context_length: 65536 },
    ];
    const cfg = {
      provider: {
        "lmstudio-remote": {
          options: { baseURL: "http://127.0.0.1:12345/v1" },
          models: { "qwen/loaded-model": {} },
        },
      },
    };
    const res = planSync(loaded, cfg, { baseUrl: BASE, modelsConfig });
    if (!res.changed && res.findings.length === 0) {
      ok("sync-model-limits — non-matching-origin provider (:12345 vs :1234) left untouched");
    } else {
      fail(
        "sync-model-limits — non-matching-origin provider left untouched",
        `expected no findings/changes, got changed=${res.changed} findings=${res.findings.join(" | ")}`,
      );
    }
  }

  // -- 6. a configured model that ISN'T currently loaded is skipped, not
  //    zeroed out or errored. ------------------------------------------------
  {
    const loaded = [
      { id: "some-other-model", state: "loaded", type: "llm", loaded_context_length: 65536 },
    ];
    const cfg = dropEmptyLimit(baseCfg({}));
    const res = planSync(loaded, cfg, { baseUrl: BASE, modelsConfig });
    if (!res.changed && findingsFor(res.findings, "SKIP").length === 1) {
      ok("sync-model-limits — not-currently-loaded model is skipped, not errored");
    } else {
      fail(
        "sync-model-limits — not-currently-loaded model is skipped",
        `findings=${res.findings.join(" | ")}`,
      );
    }
  }

  // -- 7. local-profile trim: fires (compaction.prune -> true, tool_output
  //    lowered from opencode's real defaults) only when a limit actually
  //    changed, and never LOOSENS an existing stricter tool_output value. --
  {
    const loaded = [
      { id: "qwen/loaded-model", state: "loaded", type: "llm", loaded_context_length: 65536 },
    ];
    const cfg = dropEmptyLimit(baseCfg({}));
    (cfg as any).tool_output = { max_lines: 100, max_bytes: 5000 }; // stricter than the 500/20000 target
    const res = planSync(loaded, cfg, { baseUrl: BASE, modelsConfig });
    const compactionOk = res.cfg.compaction?.prune === true;
    const linesUnchanged = res.cfg.tool_output.max_lines === 100;
    const bytesUnchanged = res.cfg.tool_output.max_bytes === 5000;
    if (res.changed && compactionOk && linesUnchanged && bytesUnchanged) {
      ok("sync-model-limits — local-profile trim sets compaction.prune, never loosens stricter tool_output");
    } else {
      fail(
        "sync-model-limits — local-profile trim never loosens stricter tool_output",
        `compaction=${JSON.stringify(res.cfg.compaction)} tool_output=${JSON.stringify(res.cfg.tool_output)}`,
      );
    }
  }

  // -- 8. local-profile trim DOES lower an unset/looser tool_output toward
  //    the (configurable) target when a limit changed. ----------------------
  {
    const loaded = [
      { id: "qwen/loaded-model", state: "loaded", type: "llm", loaded_context_length: 65536 },
    ];
    const cfg = dropEmptyLimit(baseCfg({}));
    const res = planSync(loaded, cfg, {
      baseUrl: BASE,
      modelsConfig,
      toolOutputMaxLines: 500,
      toolOutputMaxBytes: 20000,
    });
    if (
      res.changed &&
      res.cfg.compaction?.prune === true &&
      res.cfg.tool_output?.max_lines === 500 &&
      res.cfg.tool_output?.max_bytes === 20000
    ) {
      ok("sync-model-limits — local-profile trim lowers unset tool_output to the target caps");
    } else {
      fail(
        "sync-model-limits — local-profile trim lowers unset tool_output to the target caps",
        `compaction=${JSON.stringify(res.cfg.compaction)} tool_output=${JSON.stringify(res.cfg.tool_output)}`,
      );
    }
  }

  // -- 9. input config object is never mutated (planSync returns a new cfg). -
  {
    const loaded = [
      { id: "qwen/loaded-model", state: "loaded", type: "llm", loaded_context_length: 65536 },
    ];
    const cfg = dropEmptyLimit(baseCfg({}));
    const before = JSON.stringify(cfg);
    planSync(loaded, cfg, { baseUrl: BASE, modelsConfig });
    if (JSON.stringify(cfg) === before) {
      ok("sync-model-limits — input config object is never mutated");
    } else {
      fail("sync-model-limits — input config object is never mutated", "input cfg changed in place");
    }
  }
}
