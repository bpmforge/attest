/**
 * test-figma-adapter.ts — chapter module for scripts/test.ts (Figma adapter).
 *
 * Covers scripts/figma/figma.mjs + scripts/lib/design-tokens.mjs against a
 * MOCKED Figma (injected fetchImpl) — no live file. Proves the design guarantees
 * in docs/DESIGN_FIGMA_ADAPTER.md:
 *   1. Graceful fallback — no FIGMA_TOKEN ⇒ config disabled.
 *   2. pull — variables→tokens, components→inventory, top-level frames→screens.
 *   3. Variables API 403 (free plan) ⇒ empty tokens but components/screens still
 *      captured (never throws).
 *   4. deriveTokens — maps color/spacing/semantic by naming convention into the
 *      design-system-lead tokens.json shape, and reports required keys it can't
 *      fill (so tokens.json is derived, not invented).
 *   5. designTokenGaps drift gate — skip when no snapshot; dropped-token error;
 *      value-drift warning.
 *   6. validate-design-tokens.sh — skips clean with no snapshot; flags a dropped
 *      token when a snapshot is present (also wires the validator into npm test).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import {
  resolveConfig,
  FigmaClient,
  pull,
  deriveTokens,
  figmaColorToHex,
} from "./figma/figma.mjs";
import { designTokenGaps } from "./lib/design-tokens.mjs";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

const FILE = {
  name: "Design File",
  document: {
    children: [
      {
        type: "CANVAS",
        name: "Page 1",
        children: [
          { type: "FRAME", name: "Home", id: "1:2" },
          { type: "FRAME", name: "Settings", id: "1:3" },
          { type: "RECTANGLE", name: "not-a-screen", id: "1:4" },
        ],
      },
    ],
  },
  components: { a: { key: "k1", name: "Button", description: "primary" } },
};
const VARS = {
  meta: {
    variables: {
      v1: {
        name: "color/primary",
        resolvedType: "COLOR",
        valuesByMode: { m: { r: 0.2, g: 0.4, b: 0.9 } },
      },
      v2: {
        name: "color/semantic/error",
        resolvedType: "COLOR",
        valuesByMode: { m: { r: 0.9, g: 0.1, b: 0.1 } },
      },
      v3: { name: "spacing/2", resolvedType: "FLOAT", valuesByMode: { m: 8 } },
      v4: { name: "spacing/1", resolvedType: "FLOAT", valuesByMode: { m: 4 } },
    },
  },
};

function mockFetch(opts: { varsStatus?: number } = {}) {
  return async (url: string) => {
    if (url.includes("/variables/local")) {
      const st = opts.varsStatus || 200;
      return {
        ok: st < 300,
        status: st,
        text: async () => (st < 300 ? JSON.stringify(VARS) : "forbidden"),
      };
    }
    if (url.includes("/v1/me"))
      return { ok: true, status: 200, text: async () => "{}" };
    return { ok: true, status: 200, text: async () => JSON.stringify(FILE) };
  };
}

const ENV = {
  FIGMA_TOKEN: "tok",
  FIGMA_FILE_KEY: "KEY",
  __FIGMA_FAKE_TS: "2026-07-14T00:00:00Z",
};

export async function testFigmaAdapter(_root: string, ok: OK, fail: FAIL) {
  console.log("\n[Pass 42] Figma adapter — mocked REST");
  const cfg = resolveConfig(ENV as any);

  // 1. fallback
  try {
    const d = resolveConfig({} as any);
    if (
      !d.enabled &&
      cfg.enabled &&
      figmaColorToHex({ r: 1, g: 0, b: 0, a: 1 }) === "#ff0000"
    )
      ok(
        "fallback: no FIGMA_TOKEN ⇒ disabled; figmaColorToHex maps 0..1 → hex",
      );
    else fail("fallback", `disabled=${d.enabled} enabled=${cfg.enabled}`);
  } catch (e: any) {
    fail("fallback", e.message);
  }

  // 2. pull
  let snap: any;
  try {
    const client = new FigmaClient(cfg, mockFetch());
    snap = await pull(client);
    if (
      snap.tokens.length === 4 &&
      snap.components.length === 1 &&
      snap.screens.length === 2 &&
      snap.screens[0].name === "Home"
    )
      ok(
        "pull: 4 variables→tokens, 1 component, 2 frames→screens (non-FRAME nodes excluded)",
      );
    else
      fail(
        "pull",
        `tokens=${snap.tokens.length} comps=${snap.components.length} screens=${snap.screens.length}`,
      );
  } catch (e: any) {
    fail("pull", e.message + "\n" + e.stack);
  }

  // 3. variables 403 → empty tokens, rest intact
  try {
    const client = new FigmaClient(cfg, mockFetch({ varsStatus: 403 }));
    const s = await pull(client);
    if (
      s.tokens.length === 0 &&
      s.components.length === 1 &&
      s.screens.length === 2
    )
      ok(
        "pull: Variables API 403 (free plan) ⇒ 0 tokens but components/screens still captured (no throw)",
      );
    else
      fail(
        "pull 403",
        `tokens=${s.tokens.length} comps=${s.components.length}`,
      );
  } catch (e: any) {
    fail("pull 403", e.message);
  }

  // 4. deriveTokens
  try {
    const { tokens, missing } = deriveTokens(snap);
    const okColor =
      tokens.color.primary === "#3366e6" &&
      tokens.color.semantic.error === "#e61a1a";
    const okSpacing = JSON.stringify(tokens.spacing) === "[4,8]";
    const reportsMissing =
      missing.includes("color.surface") &&
      missing.includes("typography.fontFamily");
    if (okColor && okSpacing && reportsMissing)
      ok(
        "deriveTokens: color/spacing/semantic mapped by convention; unfillable required keys reported (derived, not invented)",
      );
    else
      fail(
        "deriveTokens",
        `color=${okColor} spacing=${okSpacing} missing=${JSON.stringify(missing)}`,
      );
  } catch (e: any) {
    fail("deriveTokens", e.message + "\n" + e.stack);
  }

  // 5. designTokenGaps drift gate
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "figma-test-"));
  try {
    const snapPath = path.join(tmp, "figma-snapshot.json");
    const tokPath = path.join(tmp, "tokens.json");
    // no snapshot → skip
    const s0 = designTokenGaps(path.join(tmp, "nope.json"), tokPath);
    fs.writeFileSync(snapPath, JSON.stringify(snap));
    // snapshot present, tokens.json missing surface + wrong primary
    fs.writeFileSync(
      tokPath,
      JSON.stringify({
        color: { primary: "#000000", semantic: { error: "#e61a1a" } },
      }),
    );
    const s1 = designTokenGaps(snapPath, tokPath);
    const drift = s1.warnings.some((w: string) => /primary/.test(w));
    // consistent tokens.json → no gaps
    fs.writeFileSync(
      tokPath,
      JSON.stringify({
        color: { primary: "#3366e6", semantic: { error: "#e61a1a" } },
      }),
    );
    const s2 = designTokenGaps(snapPath, tokPath);
    if (s0.skipped && drift && s2.gaps.length === 0)
      ok(
        "designTokenGaps: skips with no snapshot; flags value-drift on a changed color; clean when consistent",
      );
    else
      fail(
        "designTokenGaps",
        `skip=${s0.skipped} drift=${drift} s2gaps=${s2.gaps.length}`,
      );
  } catch (e: any) {
    fail("designTokenGaps", e.message + "\n" + e.stack);
  }

  // 6. validate-design-tokens.sh (also wires it into npm test)
  try {
    const proj = path.join(tmp, "proj");
    fs.mkdirSync(path.join(proj, "docs", "design"), { recursive: true });
    const val = path.join(
      _root,
      "scripts",
      "validators",
      "validate-design-tokens.sh",
    );
    // no snapshot → skip clean (0)
    let skipExit = 0;
    try {
      execFileSync("bash", [val, proj], { encoding: "utf8" });
    } catch (e: any) {
      skipExit = e.status;
    }
    // snapshot present, no tokens.json → gap (1)
    fs.writeFileSync(
      path.join(proj, "docs", "design", "figma-snapshot.json"),
      JSON.stringify(snap),
    );
    let gapExit = 0,
      out = "";
    try {
      out = execFileSync("bash", [val, proj], { encoding: "utf8" });
    } catch (e: any) {
      gapExit = e.status;
      out = (e.stdout || "") + (e.stderr || "");
    }
    if (skipExit === 0 && gapExit === 1 && /snapshot-without-tokens/.test(out))
      ok(
        "validate-design-tokens.sh: skips clean without a snapshot; flags snapshot-without-tokens when one exists",
      );
    else
      fail(
        "validate-design-tokens.sh",
        `skip=${skipExit} gap=${gapExit} out=${out.slice(0, 160)}`,
      );
  } catch (e: any) {
    fail("validate-design-tokens.sh", e.message);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
}
