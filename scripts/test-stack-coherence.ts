/**
 * test-stack-coherence.ts — chapter module for scripts/test.ts.
 *
 * `stack-coherence.mjs --check` is a gate, so every rule gets a planted RED
 * fixture, and one coherent project (React 19 + shadcn + Tailwind v4 + one
 * library per purpose) must come back GREEN — the false-positive guard. A gate
 * that flags a clean shadcn app teaches agents to ignore it.
 *
 * Fixtures are package.json + a few source/CSS files only; no node_modules, so
 * the npm-ls peer pass is skipped and majors are read from the declared ranges.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

type Fixture = {
  deps: Record<string, string>;
  files?: Record<string, string>;
  components?: object;
};

const CLEAN: Fixture = {
  deps: {
    react: "^19.1.0",
    "react-dom": "^19.1.0",
    tailwindcss: "^4.3.0",
    "tw-animate-css": "^1.4.0",
    "radix-ui": "^1.8.0",
    "lucide-react": "^0.500.0",
    "@dnd-kit/react": "0.5.0",
    "@dnd-kit/helpers": "0.5.0",
    motion: "^14.1.0",
  },
  files: {
    "src/app.css": '@import "tailwindcss";\n@import "tw-animate-css";\n',
    "src/Board.tsx":
      'import { DragDropProvider } from "@dnd-kit/react";\nimport { motion } from "motion/react";\nimport { Plus } from "lucide-react";\nimport { Button } from "@/components/ui/button";\nexport const B = () => null;\n',
  },
  components: {
    style: "new-york",
    iconLibrary: "lucide",
    tailwind: { config: "", css: "src/app.css" },
  },
};

// rule id → fixture that must trip it (as an ERROR unless noted)
const RED: Array<[string, string, Fixture, "ERROR" | "WARN"]> = [
  [
    "SC-01",
    "React + Vue both installed",
    { deps: { react: "^19.0.0", vue: "^3.5.0" } },
    "ERROR",
  ],
  [
    "SC-01",
    ".vue component file in a React app",
    {
      deps: { react: "^19.0.0" },
      files: { "src/Card.vue": "<template><div/></template>\n" },
    },
    "ERROR",
  ],
  [
    "SC-01",
    "React app imports from svelte",
    {
      deps: { react: "^19.0.0" },
      files: { "src/x.tsx": 'import { onMount } from "svelte";\n' },
    },
    "ERROR",
  ],
  [
    "SC-02",
    "shadcn + MUI",
    {
      deps: {
        react: "^19.0.0",
        tailwindcss: "^4.0.0",
        "@mui/material": "^7.0.0",
      },
      components: { iconLibrary: "lucide", tailwind: { config: "" } },
    },
    "ERROR",
  ],
  [
    "SC-03",
    "two drag-and-drop libraries",
    {
      deps: {
        react: "^19.0.0",
        "@dnd-kit/react": "0.5.0",
        "@hello-pangea/dnd": "^18.0.0",
      },
    },
    "ERROR",
  ],
  [
    "SC-03",
    "Tailwind + styled-components",
    {
      deps: {
        react: "^19.0.0",
        tailwindcss: "^4.0.0",
        "styled-components": "^6.0.0",
      },
    },
    "ERROR",
  ],
  [
    "SC-03",
    "two icon sets (warn)",
    {
      deps: {
        react: "^19.0.0",
        "lucide-react": "^0.500.0",
        "react-icons": "^5.0.0",
      },
    },
    "WARN",
  ],
  [
    "SC-04",
    "deprecated react-beautiful-dnd",
    { deps: { react: "^18.0.0", "react-beautiful-dnd": "^13.1.1" } },
    "ERROR",
  ],
  [
    "SC-04",
    "deprecated @measured/puck",
    { deps: { react: "^19.0.0", "@measured/puck": "^0.20.0" } },
    "ERROR",
  ],
  [
    "SC-04",
    "legacy + new dnd-kit APIs together",
    {
      deps: {
        react: "^19.0.0",
        "@dnd-kit/core": "^6.3.0",
        "@dnd-kit/react": "0.5.0",
      },
    },
    "ERROR",
  ],
  [
    "SC-05",
    "Tailwind v4 with v3 directives",
    {
      deps: { react: "^19.0.0", tailwindcss: "^4.3.0" },
      files: {
        "src/index.css":
          "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
      },
    },
    "ERROR",
  ],
  [
    "SC-05",
    "Tailwind v3 with v4 import",
    {
      deps: { react: "^18.0.0", tailwindcss: "^3.4.0" },
      files: { "src/index.css": '@import "tailwindcss";\n' },
    },
    "ERROR",
  ],
  [
    "SC-06",
    "R3F 9 on React 18",
    { deps: { react: "^18.3.0", "@react-three/fiber": "^9.8.0" } },
    "ERROR",
  ],
  [
    "SC-06",
    "drei 10 on R3F 8",
    {
      deps: {
        react: "^18.3.0",
        "@react-three/fiber": "^8.17.0",
        "@react-three/drei": "^10.7.0",
      },
    },
    "ERROR",
  ],
  [
    "SC-07",
    "imports a kit that is not a dependency",
    {
      deps: { react: "^19.0.0" },
      files: { "src/x.tsx": 'import { Button } from "@mui/material";\n' },
    },
    "ERROR",
  ],
  [
    "SC-08",
    "shadcn without tailwindcss",
    {
      deps: { react: "^19.0.0", "lucide-react": "^0.500.0" },
      components: { iconLibrary: "lucide", tailwind: { config: "" } },
    },
    "ERROR",
  ],
];

function build(dir: string, fx: Fixture) {
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "fx", dependencies: fx.deps }),
  );
  if (fx.components)
    fs.writeFileSync(
      path.join(dir, "components.json"),
      JSON.stringify(fx.components),
    );
  for (const [rel, text] of Object.entries(fx.files || {})) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
}

export function testStackCoherence(root: string, ok: OK, fail: FAIL) {
  const script = path.join(root, "scripts", "stack-coherence.mjs");
  const run = (dir: string) =>
    spawnSync("node", [script, "--check", "--json", `--root=${dir}`], {
      encoding: "utf8",
    });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stack-coh-"));
  try {
    const clean = path.join(tmp, "clean");
    fs.mkdirSync(clean);
    build(clean, CLEAN);
    const g = run(clean);
    const gj = JSON.parse(g.stdout || "{}");
    if (g.status === 0 && gj.findings?.length === 0)
      ok(
        "stack-coherence: coherent React 19 + shadcn + Tailwind v4 project is GREEN (no false positives)",
      );
    else
      fail(
        "stack-coherence: clean fixture",
        `status=${g.status} findings=${JSON.stringify(gj.findings)}`,
      );

    RED.forEach(([rule, label, fx, sev], i) => {
      const d = path.join(tmp, `red-${i}`);
      fs.mkdirSync(d);
      build(d, fx);
      const r = run(d);
      const j = JSON.parse(r.stdout || "{}");
      const hit = (j.findings || []).some(
        (f: { rule: string; severity: string }) =>
          f.rule === rule && f.severity === sev,
      );
      const exitOk = sev === "ERROR" ? r.status === 1 : true;
      if (hit && exitOk) ok(`stack-coherence ${rule} (${sev}): ${label}`);
      else
        fail(
          `stack-coherence ${rule}: ${label}`,
          `status=${r.status} findings=${JSON.stringify(j.findings)}`,
        );
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
