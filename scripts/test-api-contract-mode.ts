/**
 * test-api-contract-mode.ts — chapter module for scripts/test.ts.
 *
 * validate-api-coverage.sh has two contract modes (api_contract_mode in
 * scripts/validators/_lib.sh). The fixture harness (evals/fixtures/validators/
 * validate-api-coverage/{red,green}) covers JSON-Schema mode; this module
 * covers the rest:
 *   - openapi mode RED: a route in source missing from openapi.yaml
 *   - openapi mode GREEN: the route is in API_DESIGN.md and openapi.yaml
 *   - fallback: schemas present but NO "no HTTP API" declaration -> still
 *     openapi mode, so the missing openapi.yaml is a gap (the adaptation must
 *     be declared, not inferred from a directory existing)
 *   - an existing openapi.yaml always wins over schemas + declaration
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-contract-mode-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const ROUTE_SRC = `router.get("/users", handler);\n`;
const DESIGN_HTTP =
  "# API Design\n\n## Endpoints\n\nGET /users -- list users\n";
const OPENAPI_OK = `openapi: "3.0.3"\npaths:\n  /users:\n    get: {}\n`;
const OPENAPI_MISSING_ROUTE = `openapi: "3.0.3"\npaths:\n  /orders:\n    get: {}\n`;
const DESIGN_TOOLS =
  "# API Design\n\nThere is no HTTP API.\n\n| Tool | Purpose |\n|---|---|\n| `get_feedback` | list |\n";

export function testApiContractMode(root: string, ok: OK, fail: FAIL): void {
  const script = path.join(root, "scripts/validators/validate-api-coverage.sh");

  const cases: Array<{
    label: string;
    files: Record<string, string>;
    expectExit: number;
    expectOut?: RegExp;
  }> = [
    {
      label: "openapi mode RED: source route absent from openapi.yaml",
      files: {
        "docs/API_DESIGN.md": DESIGN_HTTP,
        "docs/api/openapi.yaml": OPENAPI_MISSING_ROUTE,
        "src/routes.ts": ROUTE_SRC,
      },
      expectExit: 1,
      expectOut: /missing-in-openapi/,
    },
    {
      label: "openapi mode GREEN: route in API_DESIGN.md and openapi.yaml",
      files: {
        "docs/API_DESIGN.md": DESIGN_HTTP,
        "docs/api/openapi.yaml": OPENAPI_OK,
        "src/routes.ts": ROUTE_SRC,
      },
      expectExit: 0,
    },
    {
      label:
        "undeclared schemas dir does not switch modes: missing openapi.yaml is a gap",
      files: {
        "docs/API_DESIGN.md":
          "# API Design\n\n| Tool | Purpose |\n|---|---|\n| `get_feedback` | list |\n",
        "docs/api/schemas/get_feedback.json": "{}\n",
      },
      expectExit: 1,
      expectOut: /docs\/api\/openapi\.yaml not found/,
    },
    {
      label:
        "existing openapi.yaml wins over schemas + declaration (openapi mode)",
      files: {
        "docs/API_DESIGN.md": DESIGN_TOOLS + "\nGET /users -- list users\n",
        "docs/api/schemas/get_feedback.json": "{}\n",
        "docs/api/openapi.yaml": OPENAPI_MISSING_ROUTE,
        "src/routes.ts": ROUTE_SRC,
      },
      expectExit: 1,
      expectOut: /missing-in-openapi/,
    },
    {
      label: "JSON-Schema mode declared in API_DESIGN.md alone: GREEN",
      files: {
        "docs/API_DESIGN.md": DESIGN_TOOLS,
        "docs/api/schemas/tool.get_feedback.input.json": '{"type":"object"}\n',
      },
      expectExit: 0,
      expectOut: /JSON-Schema contract mode/,
    },
    {
      label:
        "JSON-Schema mode with no Tool/Endpoint table: no-contract-names gap",
      files: {
        "docs/API_DESIGN.md": "# API Design\n\nThere is no HTTP API.\n",
        "docs/api/schemas/x.json": "{}\n",
      },
      expectExit: 1,
      expectOut: /no-contract-names/,
    },
  ];

  for (const c of cases) {
    const dir = project(c.files);
    try {
      const r = spawnSync("bash", [script, dir], { encoding: "utf8" });
      const out = `${r.stdout}\n${r.stderr}`;
      if (r.status !== c.expectExit) {
        fail(c.label, `expected exit ${c.expectExit}, got ${r.status}\n${out}`);
      } else if (c.expectOut && !c.expectOut.test(out)) {
        fail(c.label, `output did not match ${c.expectOut}\n${out}`);
      } else {
        ok(c.label);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
