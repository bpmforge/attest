#!/usr/bin/env node
/**
 * Stack coherence gate — catches the "mish-mash" failure of agent-built UIs:
 * components pulled from the wrong framework, two UI kits fighting over the
 * same screen, Tailwind v3 syntax on a v4 install, two drag-and-drop or two
 * animation libraries, renamed/deprecated packages, unmet peer dependencies.
 *
 * Every one of these compiles, renders, and looks fine in a single screenshot.
 * They surface later as inconsistent styling, doubled bundle weight, and
 * upgrade dead-ends — which is why this is a deterministic check, not prose.
 *
 *   node stack-coherence.mjs                 # markdown report, exit 0
 *   node stack-coherence.mjs --check         # exit 1 when any ERROR finding
 *   node stack-coherence.mjs --json          # machine-readable findings
 *   node stack-coherence.mjs --online        # also ask the registry which deps are deprecated
 *
 * Options: --root=<dir> (default cwd), --src=<dir> (default <root>/src, falls back to <root>)
 *
 * Rules live in references/stack-coherence.md (SC-01 … SC-08). Static package
 * lists below were verified against the npm registry on 2026-10-12; --online
 * covers deprecations that happen after that date.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, isAbsolute, extname, relative } from "node:path";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const abs = (p, base) => (isAbsolute(p) ? p : join(base, p));

const ROOT = abs(opt("root", process.cwd()), process.cwd());
const SRC = (() => {
  const s = abs(opt("src", "src"), ROOT);
  return existsSync(s) ? s : ROOT;
})();

const readJsonText = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const readJson = (p) => (existsSync(p) ? readJsonText(readFileSync(p, "utf8")) : null);

// ── inputs ───────────────────────────────────────────────────────────────
const pkg = readJson(join(ROOT, "package.json"));
if (!pkg) {
  console.error(`stack-coherence: no readable package.json in ${ROOT}`);
  process.exit(2);
}
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);
const present = (names) => names.filter(has);
const installedVersion = (name) => readJson(join(ROOT, "node_modules", name, "package.json"))?.version ?? null;
const major = (name) => {
  const v = installedVersion(name) ?? String(deps[name] ?? "").replace(/^[^\d]*/, "");
  const m = /^(\d+)/.exec(v);
  return m ? Number(m[1]) : null;
};
const componentsJson = readJson(join(ROOT, "components.json"));

function* walk(dir, depth = 0) {
  if (depth > 8 || !existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".") || e === "dist" || e === "build") continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p, depth + 1);
    else yield p;
  }
}
const files = [...walk(SRC)];
const sourceFiles = files.filter((f) => [".ts", ".tsx", ".js", ".jsx", ".mjs", ".vue", ".svelte"].includes(extname(f)));
const cssFiles = files.filter((f) => extname(f) === ".css");

const findings = [];
const add = (rule, severity, message, evidence = []) => findings.push({ rule, severity, message, evidence });

// ── SC-01 framework mix ──────────────────────────────────────────────────
const FRAMEWORKS = { react: "React", vue: "Vue", svelte: "Svelte", "solid-js": "Solid", "@angular/core": "Angular", preact: "Preact" };
const frameworks = present(Object.keys(FRAMEWORKS));
if (frameworks.length > 1) {
  add("SC-01", "ERROR", `More than one UI framework is a dependency: ${frameworks.map((f) => FRAMEWORKS[f]).join(", ")}. Components from one cannot be used in the other.`, frameworks);
}
const primary = frameworks[0];
if (primary === "react" || primary === "preact") {
  const foreign = sourceFiles.filter((f) => [".vue", ".svelte"].includes(extname(f)));
  if (foreign.length) add("SC-01", "ERROR", "Vue/Svelte component files inside a React project — a copied component from the wrong framework.", foreign.map((f) => relative(ROOT, f)));
}
const IMPORT_RE = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
const imports = new Map(); // spec -> [files]
for (const f of sourceFiles) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("@/") || spec.startsWith("~/")) continue;
    const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    if (!imports.has(name)) imports.set(name, []);
    imports.get(name).push(relative(ROOT, f));
  }
}
if (primary) {
  const wrong = Object.keys(FRAMEWORKS).filter((fw) => fw !== primary && imports.has(fw) && !(primary === "react" && fw === "preact"));
  for (const fw of wrong) add("SC-01", "ERROR", `Source imports '${fw}' but the project's framework is ${FRAMEWORKS[primary]}.`, imports.get(fw).slice(0, 5));
}

// ── SC-02 competing component kits ───────────────────────────────────────
const KITS = ["@mui/material", "antd", "@chakra-ui/react", "@mantine/core", "react-bootstrap", "primereact", "@fluentui/react-components", "@nextui-org/react", "@heroui/react", "daisyui", "flowbite-react"];
const kits = present(KITS);
if (componentsJson) kits.unshift("shadcn/ui (components.json)");
if (kits.length > 1) {
  add("SC-02", "ERROR", `Multiple component kits in one app: ${kits.join(", ")}. Each brings its own tokens, focus styles and theming — screens will not look like one product. Pick one and migrate.`, kits);
}

// ── SC-03 duplicate-purpose libraries ────────────────────────────────────
const PURPOSES = {
  "drag-and-drop": ["@dnd-kit/core", "@dnd-kit/react", "@hello-pangea/dnd", "react-beautiful-dnd", "react-dnd", "sortablejs", "react-sortablejs", "@atlaskit/pragmatic-drag-and-drop"],
  animation: ["motion", "framer-motion", "gsap", "react-spring", "@react-spring/web", "animejs"],
  charts: ["recharts", "chart.js", "react-chartjs-2", "echarts", "echarts-for-react", "victory", "@visx/visx", "apexcharts", "highcharts"],
  icons: ["lucide-react", "@heroicons/react", "react-icons", "@tabler/icons-react", "@phosphor-icons/react", "@radix-ui/react-icons", "@fortawesome/react-fontawesome"],
  styling: ["tailwindcss", "styled-components", "@emotion/react", "@stitches/react", "@vanilla-extract/css"],
  "headless primitives": ["radix-ui", "@headlessui/react", "@base-ui/react", "react-aria-components", "@ark-ui/react"],
};
// @radix-ui/react-* are many packages of one kit; count them once.
const radixScoped = Object.keys(deps).some((d) => d.startsWith("@radix-ui/react-") && d !== "@radix-ui/react-icons");
for (const [purpose, list] of Object.entries(PURPOSES)) {
  const distinct = present(list);
  // `radix-ui` and `@radix-ui/react-*` are one kit in two packagings — count it once.
  if (purpose === "headless primitives" && radixScoped && !distinct.includes("radix-ui")) distinct.unshift("@radix-ui/*");
  if (distinct.length > 1) {
    const sev = purpose === "drag-and-drop" || purpose === "styling" || purpose === "headless primitives" ? "ERROR" : "WARN";
    add("SC-03", sev, `${distinct.length} ${purpose} libraries: ${distinct.join(", ")}. One per purpose unless a written reason exists.`, distinct);
  }
}

// ── SC-04 deprecated / renamed / superseded ──────────────────────────────
const SUPERSEDED = {
  "react-beautiful-dnd": ["ERROR", "deprecated by Atlassian — use @dnd-kit/react (or @hello-pangea/dnd as a drop-in fork)"],
  "@measured/puck": ["ERROR", "deprecated — Puck moved to @puckeditor/core"],
  "react-flow-renderer": ["ERROR", "deprecated — renamed; current package is @xyflow/react"],
  "@base-ui-components/react": ["ERROR", "deprecated — renamed to @base-ui/react"],
  reactflow: ["WARN", "the v11 line — new work uses @xyflow/react (v12)"],
  "framer-motion": ["WARN", "same library as 'motion' (import from 'motion/react'); new code should use 'motion'"],
};
for (const [name, [sev, why]] of Object.entries(SUPERSEDED)) if (has(name)) add("SC-04", sev, `${name}: ${why}.`, [name]);
if (has("@dnd-kit/core") && has("@dnd-kit/react")) add("SC-04", "ERROR", "@dnd-kit/core (legacy API) and @dnd-kit/react (new API) are both installed — two incompatible dnd-kit APIs in one app.", ["@dnd-kit/core", "@dnd-kit/react"]);
if (flag("online")) {
  for (const name of Object.keys(deps)) {
    try {
      const out = execFileSync("npm", ["view", name, "deprecated", "--json"], { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (out && out !== '""' && !SUPERSEDED[name]) add("SC-04", "ERROR", `${name} is deprecated on the registry: ${JSON.parse(out)}`, [name]);
    } catch {
      /* unreachable registry or private package — not a finding */
    }
  }
}

// ── SC-05 Tailwind major vs the syntax actually used ─────────────────────
if (has("tailwindcss")) {
  const tw = major("tailwindcss");
  const cssText = cssFiles.map((f) => [f, readFileSync(f, "utf8")]);
  const v3Directives = cssText.filter(([, t]) => /@tailwind\s+(base|components|utilities)/.test(t)).map(([f]) => relative(ROOT, f));
  const v4Import = cssText.filter(([, t]) => /@import\s+["']tailwindcss["']/.test(t)).map(([f]) => relative(ROOT, f));
  if (tw >= 4 && v3Directives.length) add("SC-05", "ERROR", `Tailwind v${tw} installed but CSS uses v3 '@tailwind' directives — v4 uses '@import "tailwindcss"'.`, v3Directives);
  if (tw === 3 && v4Import.length) add("SC-05", "ERROR", "Tailwind v3 installed but CSS uses the v4 '@import \"tailwindcss\"' entry.", v4Import);
  if (tw >= 4 && has("tailwindcss-animate")) add("SC-05", "WARN", "tailwindcss-animate is the v3-era plugin; Tailwind v4 projects (and current shadcn) use tw-animate-css.", ["tailwindcss-animate"]);
  if (tw >= 4 && componentsJson?.tailwind?.config) add("SC-05", "WARN", `components.json points at a Tailwind config file (${componentsJson.tailwind.config}); with Tailwind v4 shadcn expects it empty (CSS-first config).`, ["components.json"]);
}

// ── SC-06 ecosystem majors that must move together ───────────────────────
const PAIRS = [
  // [package, its major, required companion, allowed companion majors, why]
  ["@react-three/fiber", 9, "react", [19], "R3F 9 targets React 19"],
  ["@react-three/fiber", 8, "react", [18], "R3F 8 targets React 18"],
  ["@react-three/drei", 10, "@react-three/fiber", [9], "drei 10 pairs with R3F 9"],
  ["@react-three/drei", 9, "@react-three/fiber", [8], "drei 9 pairs with R3F 8"],
];
for (const [p, pm, c, cms, why] of PAIRS) {
  if (has(p) && major(p) === pm && has(c) && major(c) !== null && !cms.includes(major(c))) {
    add("SC-06", "ERROR", `${p}@${pm} with ${c}@${major(c)} — ${why}.`, [p, c]);
  }
}
if (existsSync(join(ROOT, "node_modules"))) {
  let out = "{}";
  try {
    out = execFileSync("npm", ["ls", "--json", "--depth=0"], { cwd: ROOT, encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    out = e.stdout || "{}"; // npm ls exits non-zero WHEN there are problems; the JSON is still on stdout.
  }
  const problems = readJsonText(out)?.problems || [];
  for (const prob of problems) if (/peer|invalid/i.test(prob)) add("SC-06", "ERROR", `npm reports: ${prob}`);
}

// ── SC-07 imports of kits/libraries that are not declared ────────────────
const UI_SCOPES = [...KITS, ...Object.values(PURPOSES).flat(), ...Object.keys(FRAMEWORKS)];
for (const [name, where] of imports) {
  if (!has(name) && (UI_SCOPES.includes(name) || name.startsWith("@radix-ui/"))) {
    add("SC-07", "ERROR", `Source imports '${name}' but it is not in package.json — pasted from another project or a hallucinated dependency.`, where.slice(0, 5));
  }
}

// ── SC-08 shadcn registry config vs installed packages ───────────────────
if (componentsJson) {
  const ICONS = { lucide: "lucide-react", radix: "@radix-ui/react-icons", tabler: "@tabler/icons-react", phosphor: "@phosphor-icons/react" };
  const want = ICONS[componentsJson.iconLibrary];
  if (want && !has(want)) add("SC-08", "WARN", `components.json iconLibrary is '${componentsJson.iconLibrary}' but ${want} is not installed — registry components will import a missing package.`, ["components.json"]);
  if (!has("tailwindcss")) add("SC-08", "ERROR", "components.json present (shadcn) but tailwindcss is not a dependency.", ["components.json"]);
}

// ── output ───────────────────────────────────────────────────────────────
const errors = findings.filter((f) => f.severity === "ERROR").length;
const warns = findings.length - errors;
if (flag("json")) {
  console.log(JSON.stringify({ root: ROOT, errors, warnings: warns, findings }, null, 2));
} else {
  console.log(`# Stack coherence — ${relative(process.cwd(), ROOT) || "."}`);
  console.log(`\nFramework: ${frameworks.map((f) => FRAMEWORKS[f]).join(", ") || "none detected"} · component kit: ${kits.join(", ") || "none"} · ${errors} error(s), ${warns} warning(s)\n`);
  if (!findings.length) console.log("No coherence problems found.");
  for (const f of findings) {
    console.log(`- **${f.severity} ${f.rule}** — ${f.message}`);
    if (f.evidence.length) console.log(`  - evidence: ${f.evidence.map((e) => `\`${e}\``).join(", ")}`);
  }
  console.log("\nRules: references/stack-coherence.md");
}
process.exit(flag("check") && errors ? 1 : 0);
