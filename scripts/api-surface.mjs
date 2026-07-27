#!/usr/bin/env node
/**
 * Grounds an agent in a library's REAL API by reading the installed package
 * instead of trusting training data.
 *
 * The failure this exists to prevent: a library's major version reorganizes its
 * packages or moves API onto interface merges, published tutorials keep
 * describing the old layout, and a model writes confident code against a shape
 * that no longer exists.
 *
 * The half a typecheck will not save you from: when an augmentation ships inside
 * a package you import anyway, its merged members type-resolve unconditionally,
 * but only *work* after a separate runtime registration (`graph.use(...)`, a
 * setup file, a middleware wrapper). TypeScript cannot see that step, so the
 * code compiles clean and throws at runtime.
 *
 *   node api-surface.mjs --scan                     # rank deps by grounding risk
 *   node api-surface.mjs --package=@antv/x6         # write a reference doc
 *   node api-surface.mjs --check                    # CI: stub deps + unmet augmentations
 *   node api-surface.mjs --family=@antv/x6          # registry: is "latest" the same major?
 *
 * Options:
 *   --root=<dir>     project root holding package.json  (default: cwd)
 *   --src=<dir>      source scanned for usage           (default: <root>/src)
 *   --out=<path>     doc destination     (default: docs/development/<PKG>_API.md)
 *
 * Everything reported is read off node_modules at run time, so the output cannot
 * drift from the version actually installed. Re-run after any upgrade.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, relative, isAbsolute, sep } from "node:path";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const abs = (p, base) => (isAbsolute(p) ? p : join(base, p));

const ROOT = abs(opt("root", process.cwd()), process.cwd());
const SRC = abs(opt("src", "src"), ROOT);
const MODULES = join(ROOT, "node_modules");

/** Ambient-declaration noise, not augmentation risk. */
const IGNORED = (name) => name.startsWith("@types/") || name === "typescript";

const read = (p) => readFileSync(p, "utf8");

/** Every file under `dir` matching `test`, skipping nested node_modules. */
function walk(dir, test, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(full, test, acc);
    else if (test(full)) acc.push(full);
  }
  return acc;
}

const typeFiles = (pkg) => walk(join(MODULES, pkg), (f) => f.endsWith(".d.ts"));
// Stylesheets count as source: a CSS-only package is referenced by `@import`,
// never by an ES import, and flagging it as dead would be wrong.
const sourceFiles = () => walk(SRC, (f) => /\.([cm]?[jt]sx?|s?css|sass|less|styl)$/.test(f));

function manifest() {
  const pkg = JSON.parse(read(join(ROOT, "package.json")));
  return { pkg, deps: { ...pkg.dependencies, ...pkg.devDependencies } };
}

function version(pkg) {
  try {
    return JSON.parse(read(join(MODULES, pkg, "package.json"))).version;
  } catch {
    return null;
  }
}

/** Body of the `{...}` block starting at `open`, matched by brace depth. */
function blockAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return "";
}

/** Property and method names declared at the top level of an interface body. */
function membersOf(body) {
  const names = [];
  let depth = 0;
  for (const line of body.split("\n")) {
    if (depth === 0) {
      const m = /^\s*(?:readonly\s+)?([a-zA-Z_]\w*)\s*[?:(<]/.exec(line);
      if (m) names.push(m[1]);
    }
    depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
    if (depth < 0) depth = 0;
  }
  return names;
}

/**
 * Every `interface <Name>` declared in the package, wherever it lives. Needed
 * because an augmentation often merges an interface that inherits its members
 * from another file (`interface Assertion extends TestingLibraryMatchers {}`),
 * so the members are never present at the augmentation site.
 */
function interfacesIn(pkg) {
  const table = new Map();
  for (const file of typeFiles(pkg)) {
    let src;
    try {
      src = read(file);
    } catch {
      continue;
    }
    for (const m of src.matchAll(/\binterface\s+(\w+)(?:<[^>]*>)?\s*(?:extends ([^{]+))?\{/g)) {
      const open = m.index + m[0].length - 1;
      const bases = (m[2] ?? "")
        .split(",")
        .map((b) => /^\s*(\w+)/.exec(b)?.[1])
        .filter(Boolean);
      if (!table.has(m[1])) table.set(m[1], { members: membersOf(blockAt(src, open)), bases });
    }
  }
  return table;
}

/** An interface's own members plus everything it inherits within the package. */
function resolveMembers(table, name, seen = new Set()) {
  if (seen.has(name) || !table.has(name)) return [];
  seen.add(name);
  const entry = table.get(name);
  return [...entry.members, ...entry.bases.flatMap((b) => resolveMembers(table, b, seen))];
}

/**
 * `declare module '<target>' { interface <Name> {...} }` and its `declare global`
 * twin — the construct that makes a method typecheck without proving anything
 * registered it. Ambient module *declarations* (no interface merge inside) are
 * excluded; they are how @types packages describe an untyped dependency and
 * carry no runtime requirement.
 */
function augmentations(pkg) {
  const table = interfacesIn(pkg);
  const found = [];
  for (const file of typeFiles(pkg)) {
    let src;
    try {
      src = read(file);
    } catch {
      continue;
    }
    for (const m of src.matchAll(/declare\s+(?:(global)|module\s+["']([^"']+)["'])\s*\{/g)) {
      const body = blockAt(src, m.index + m[0].length - 1);
      // Members come from THIS block, not from a name lookup: a package with
      // several plugins declares `interface Graph` many times, and resolving by
      // name alone would report whichever block was parsed first for all of them.
      // The table is only consulted for `extends`, where the members genuinely
      // live in another file (`interface Assertion extends TestingLibraryMatchers`).
      for (const decl of body.matchAll(/\binterface\s+(\w+)(?:<[^>]*>)?\s*(?:extends ([^{]+))?\{/g)) {
        const own = membersOf(blockAt(body, decl.index + decl[0].length - 1));
        const inherited = (decl[2] ?? "")
          .split(",")
          .map((b) => /^\s*(\w+)/.exec(b)?.[1])
          .filter(Boolean)
          .flatMap((b) => resolveMembers(table, b));
        const members = [...new Set([...own, ...inherited])];
        if (!members.length) continue;
        found.push({
          file: relative(MODULES, file),
          target: m[1] ? "global scope" : m[2],
          merged: decl[1],
          members,
          key: `${m[1] ?? m[2]}|${decl[1]}|${[...members].sort().join(",")}`,
        });
      }
    }
  }
  // Packages ship the same declarations several times (es/, lib/, dist/ builds).
  // Identical merges are one trap, not three.
  const unique = new Map();
  for (const a of found) if (!unique.has(a.key)) unique.set(a.key, a);
  return [...unique.values()];
}

/**
 * Every `export declare class` in the package, with members and base class, so
 * inherited API (`on`/`off` from an EventEmitter base) is not mistaken for
 * missing API.
 */
function declaredClasses(pkg) {
  const classes = new Map();
  for (const file of typeFiles(pkg)) {
    let lines;
    try {
      lines = read(file).split("\n");
    } catch {
      continue;
    }
    for (let i = 0; i < lines.length; i++) {
      const head = /^export declare (?:abstract )?class (\w+)(?:<[^>]*>)?(?: extends (\w+))?/.exec(
        lines[i],
      );
      if (!head) continue;
      const members = new Set();
      for (let j = i + 1; j < lines.length && lines[j] !== "}"; j++) {
        const m = /^ {4}(?:static |readonly |protected |abstract )*([a-zA-Z_][\w]*)\s*[(<:?]/.exec(
          lines[j],
        );
        if (m && !["constructor", "private", "protected"].includes(m[1])) members.add(m[1]);
      }
      if (!classes.has(head[1])) classes.set(head[1], { members, base: head[2] ?? null });
    }
  }
  return classes;
}

/** A class's own members plus everything inherited. Returns member -> declaring class. */
function withInherited(classes, name) {
  const owner = new Map();
  const seen = new Set();
  for (let cur = name; cur && classes.has(cur) && !seen.has(cur); cur = classes.get(cur).base) {
    seen.add(cur);
    for (const member of classes.get(cur).members) if (!owner.has(member)) owner.set(member, cur);
  }
  return owner;
}

/**
 * Any mention of the package name in source — deliberately looser than
 * `importers`. A package with no JavaScript is still perfectly alive when it
 * ships assets reached some other way: `@import "tw-animate-css"` from CSS,
 * `require.resolve("tree-sitter-wasms/package.json")` to locate `.wasm` files,
 * a bundler alias, a dynamic import built from a variable.
 *
 * Enumerating those forms is a losing game, and the costs are lopsided: missing
 * a genuinely dead dependency wastes disk, while a false positive tells someone
 * to delete a working one. Bias to the cheap error.
 */
function referencesTo(pkg, files = sourceFiles()) {
  const q = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`["'\`]${q}(?:["'\`/])`);
  return files.filter((f) => {
    try {
      return re.test(read(f));
    } catch {
      return false;
    }
  });
}

/**
 * Packages that ship no JavaScript AND that nothing mentions — a dependency
 * resolving to nothing. Any reference at all clears it; see `referencesTo`.
 */
function stubPackages(deps, files = sourceFiles()) {
  return Object.keys(deps).filter((name) => {
    const dir = join(MODULES, name);
    if (!existsSync(dir) || IGNORED(name)) return false;
    if (walk(dir, (f) => /\.[cm]?js$/.test(f)).length) return false;
    return referencesTo(name, files).length === 0;
  });
}

/**
 * Files importing `pkg` at all — proof a runtime registration exists somewhere.
 * Side-effect imports (`import '@testing-library/jest-dom'`) count: for an
 * augmentation package that bare import IS the registration.
 */
function importers(pkg, files = sourceFiles()) {
  const q = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(?:from\\s*["']${q}(?:/[^"']*)?["']|require\\(\\s*["']${q}|import\\s*["']${q}(?:/[^"']*)?["'])`,
  );
  return files.filter((f) => {
    try {
      return re.test(read(f));
    } catch {
      return false;
    }
  });
}

/** How often each name is called as a method anywhere in the source tree. */
/**
 * Method names that already exist on a JavaScript built-in, computed from the
 * runtime rather than guessed at.
 *
 * `.member(` is a textual match, so a merged member sharing a name with a
 * built-in cannot be told apart from ordinary code: vitest augments `test` and
 * `timeout`, and `/re/.test(s)` plus `AbortSignal.timeout(5000)` then look like
 * 2 calls into an unregistered package. Ranking survives that noise; a CI gate
 * does not — it fails the build and tells someone their test runner is not
 * registered. Excluded from evidence, kept in the doc's ranking with a caveat.
 */
const BUILTIN_MEMBERS = (() => {
  const names = new Set();
  const roots = [
    Object, Array, String, Number, Boolean, Function, RegExp, Date, Error,
    Promise, Map, Set, WeakMap, WeakSet, Symbol, JSON, Math, Reflect,
    ArrayBuffer, DataView, Uint8Array, BigInt, Proxy,
    globalThis.AbortSignal, globalThis.AbortController, globalThis.URL,
    globalThis.URLSearchParams, globalThis.Headers, globalThis.Response,
  ].filter(Boolean);
  for (const root of roots) {
    for (const target of [root, root.prototype]) {
      if (!target) continue;
      try {
        for (const key of Object.getOwnPropertyNames(target)) names.add(key);
      } catch {
        /* exotic descriptor — skip */
      }
    }
  }
  return names;
})();

function callCounts(names, files = sourceFiles()) {
  const counts = new Map();
  const bodies = files.map((f) => {
    try {
      return read(f);
    } catch {
      return "";
    }
  });
  for (const name of names) {
    const re = new RegExp(`\\.${name}\\s*\\(`, "g");
    const n = bodies.reduce((sum, body) => sum + (body.match(re)?.length ?? 0), 0);
    if (n) counts.set(name, n);
  }
  return counts;
}

// ── scan ────────────────────────────────────────────────────────────────────
// Ranks dependencies by how likely an agent is to write wrong code against them.
// Risk is structural, not a guess: augmentation count (API that typechecks
// without runtime proof), sibling packages shipping no JS (a reorganized
// major version), and declared-but-never-imported (already dead).

function scan() {
  const { deps } = manifest();
  const files = sourceFiles();
  const rows = [];
  for (const name of Object.keys(deps)) {
    if (IGNORED(name) || !existsSync(join(MODULES, name))) continue;
    const augs = augmentations(name);
    const imports = importers(name, files).length;
    const ships =
      walk(join(MODULES, name), (f) => /\.[cm]?js$/.test(f)).length > 0 ||
      referencesTo(name, files).length > 0;
    const calls = augs.length
      ? [...callCounts([...new Set(augs.flatMap((a) => a.members))], files).values()].reduce(
          (a, b) => a + b,
          0,
        )
      : 0;

    // An unregistered package whose augmented API is already being called is a
    // live runtime failure, not a latent one. Everything else is exposure:
    // real traps that this codebase happens to satisfy today.
    //
    // Blast radius is what makes exposure actionable, so `calls` outweighs the
    // raw augmentation count. Without that, a framework merging a dozen members
    // onto `Window` that nobody registers anything for outranks the one feature
    // library the project genuinely depends on.
    const live = augs.length && !imports && calls;
    const score =
      (ships ? 0 : 10) +
      (live ? 25 : 0) +
      Math.min(augs.length, 6) +
      Math.min(Math.round(calls / 10), 10);
    if (score > 0) {
      rows.push({
        name,
        version: version(name),
        augs: augs.length,
        targets: [...new Set(augs.map((a) => a.merged))],
        imports,
        calls,
        ships,
        live,
        score,
      });
    }
  }
  rows.sort((a, b) => b.score - a.score || b.calls - a.calls);

  console.log(`Grounding risk in ${relative(process.cwd(), ROOT) || "."} — ${rows.length} flagged\n`);
  console.log("risk  package                          version    augs  merged onto        calls  registered");
  console.log("─".repeat(100));
  for (const r of rows) {
    const registered = !r.ships ? "SHIPS NO JS" : r.live ? "NO — LIVE BUG" : r.imports ? "yes" : "n/a";
    console.log(
      `${String(r.score).padStart(4)}  ${r.name.padEnd(32)} ${String(r.version).padEnd(10)} ` +
        `${String(r.augs).padStart(4)}  ${r.targets.join(",").slice(0, 17).padEnd(17)}  ` +
        `${String(r.calls).padStart(5)}  ${registered}`,
    );
  }
  console.log(
    `\naugs = API merged onto types the package does not own. Where the package is\n` +
      `imported for other reasons those members typecheck unconditionally, and only\n` +
      `work after a separate runtime registration tsc cannot see. "calls" counts\n` +
      `those members used in ${relative(ROOT, SRC)}/ — blast radius if one is missed.\n` +
      `Framework-wide merges rank on structure but rarely have a registration step.\n\n` +
      `Generate a reference for the top entries:\n` +
      `  node api-surface.mjs --package=${rows[0]?.name ?? "<pkg>"}`,
  );
  return rows;
}

// ── check ───────────────────────────────────────────────────────────────────
// CI gate. Two failures, both mechanical: a declared dependency that ships no
// JavaScript, and an augmented API called in source with no import of the
// package that declares it (the runtime TypeError that typechecks clean).

function check() {
  const { deps } = manifest();
  const files = sourceFiles();
  const problems = [];

  for (const name of stubPackages(deps, files)) {
    problems.push(`${name} ships no JavaScript — remove it or import from its replacement`);
  }

  for (const name of Object.keys(deps)) {
    if (IGNORED(name) || !existsSync(join(MODULES, name))) continue;
    const augs = augmentations(name);
    if (!augs.length || importers(name, files).length) continue;
    // Built-in-shadowing members are not evidence — see BUILTIN_MEMBERS.
    const called = callCounts(
      augs.flatMap((a) => a.members).filter((m) => !BUILTIN_MEMBERS.has(m)),
      files,
    );
    if (called.size) {
      const sample = [...called.keys()].slice(0, 3).join(", ");
      problems.push(
        `${name} is never imported, but source calls ${called.size} method(s) it augments ` +
          `(${sample}) — nothing registers them at runtime`,
      );
    }
  }

  for (const p of problems) console.error(`api-surface: ${p}`);
  console.log(problems.length ? `${problems.length} problem(s)` : "api-surface: no problems");
  return problems.length;
}


// ── family (registry) ───────────────────────────────────────────────────────
// `latest` is published PER PACKAGE, but compatibility is per FAMILY. When a
// library splits across a scope (@antv/x6*, @babel/*, @nestjs/*, @tanstack/*),
// a major can land on the core while satellite packages keep a `latest` tag
// pointing at the previous major. Installing "the latest version" of each then
// silently mixes majors.
//
// Real case, verified 2026-07-27: @antv/x6 is 3.1.7, but 10 of 12 @antv/x6-*
// satellites still tag v2 as latest. `npm i @antv/x6-plugin-selection` yields a
// working v2 plugin handed to a v3 graph — no import error, no type error.
//
// This is the rung below Context7: when published docs are wrong or missing,
// the registry plus the package's own type definitions are the ground truth.

async function registryInfo(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return {
      latest: body["dist-tags"]?.latest ?? null,
      versions: Object.keys(body.versions ?? {}),
    };
  } catch {
    return null; // offline: degrade to the local-only comparison
  }
}

const major = (v) => (v ? String(v).replace(/^[^\d]*/, "").split(".")[0] : null);

/**
 * Sibling packages published under the same name prefix. Enumerated from the
 * registry, not just from package.json, so the check answers "what will I get
 * if I install this family" BEFORE anything is installed — which is when the
 * answer actually changes a decision.
 */
async function registrySiblings(prefix) {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(prefix)}&size=100`,
    );
    if (!res.ok) return [];
    const body = await res.json();
    return (body.objects ?? [])
      .map((o) => o.package?.name)
      .filter((n) => n && n.startsWith(prefix));
  } catch {
    return [];
  }
}

async function family(anchor) {
  const { deps } = manifest();
  const prefix = anchor.includes("/") ? anchor.split("/")[0] + "/" : anchor.split("-")[0];
  const declared = Object.keys(deps).filter((n) => n.startsWith(prefix));
  const anchorPrefix = anchor.endsWith("/") ? anchor : anchor;
  const members = [
    ...new Set([
      anchor,
      ...declared,
      ...(await registrySiblings(anchorPrefix)).filter((n) => n.startsWith(anchorPrefix)),
    ]),
  ];

  const anchorInstalled = version(anchor);
  const anchorReg = await registryInfo(anchor);
  const target = major(anchorInstalled ?? anchorReg?.latest);

  console.log(`Family of ${anchor} — target major v${target ?? "?"}\n`);
  console.log("package                          installed  latest    highest-v" + target + "  verdict");
  console.log("─".repeat(96));

  const problems = [];
  for (const name of members.sort()) {
    const inst = version(name);
    const reg = await registryInfo(name);
    const compatible = (reg?.versions ?? []).filter((v) => major(v) === target).pop() ?? null;
    let verdict = "ok";
    if (inst && major(inst) !== target) {
      verdict = `MAJOR SKEW — installed v${major(inst)}`;
      problems.push(`${name} installed at ${inst}, family target is v${target}`);
    } else if (reg?.latest && major(reg.latest) !== target) {
      // Deliberately does NOT say "pin <compatible>": a v-target release can be
      // a stub published only to park the name after the functionality moved
      // into the core package (every @antv/x6-plugin-* 3.0.0 is CSS-only).
      // Surface the skew; let the caller confirm the package still ships code.
      verdict = compatible
        ? `latest is v${major(reg.latest)}; v${target} = ${compatible} — verify it ships JS, may have moved into core`
        : `no v${target} published — do not install`;
      if (!inst) problems.push(`${name} latest=${reg.latest} would install v${major(reg.latest)}`);
    }
    console.log(
      `${name.padEnd(32)} ${String(inst ?? "—").padEnd(10)} ${String(reg?.latest ?? "—").padEnd(9)} ` +
        `${String(compatible ?? "none").padEnd(11)} ${verdict}`,
    );
  }

  console.log(
    problems.length
      ? `\n${problems.length} package(s) where "install latest" does NOT give you v${target}.\n` +
          `Before pinning any of them, check whether the capability moved into ${anchor} itself —\n` +
          `a same-major release can be a name-parking stub with no JavaScript in it.`
      : `\nEvery family member resolves to v${target} — "install latest" is safe here.`,
  );
  return problems.length;
}

// ── reference doc ───────────────────────────────────────────────────────────

function generate(pkg) {
  const ver = version(pkg);
  if (!ver) {
    console.error(`api-surface: ${pkg} is not installed under ${MODULES}`);
    process.exit(1);
  }
  const { deps } = manifest();
  const files = sourceFiles();
  const classes = declaredClasses(pkg);
  const augs = augmentations(pkg);
  const imported = importers(pkg, files);
  const slug = pkg.replace(/^@/, "").replace(/[/-]/g, "_").toUpperCase();
  const out = abs(opt("out", join("docs", "development", `${slug}_API.md`)), ROOT);

  // Classes ranked by member count — the entry-point class first.
  const ranked = [...classes]
    .map(([name, c]) => ({ name, ...c, total: withInherited(classes, name).size }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const augMembers = [...new Set(augs.flatMap((a) => a.members))];
  const called = callCounts(augMembers, files);

  // A package often augments several host modules for alternative runtimes
  // (jest-dom merges onto `bun:test`, `@jest/expect` AND `vitest`). Attribute a
  // member to the host this project actually has installed; otherwise the table
  // names a test runner the reader does not use.
  const relevance = (a) => (a.target !== "global scope" && deps[a.target.split("/")[0]] ? 0 : 1);
  const augByMember = new Map();
  for (const a of [...augs].sort((x, y) => relevance(x) - relevance(y))) {
    for (const m of a.members) if (!augByMember.has(m)) augByMember.set(m, a);
  }

  // Sibling packages under the same scope that ship nothing — the signature of a
  // major version that folded satellite packages back into core.
  const scope = pkg.includes("/") ? pkg.split("/")[0] + "/" : null;
  const siblings = scope
    ? stubPackages(deps, files).filter((n) => n.startsWith(scope) && n !== pkg)
    : [];

  const usedRows = [...called]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => {
      const a = augByMember.get(name);
      // The declaring directory names the feature far better than the internal
      // relative module path does: plugin/keyboard/api.d.ts -> "keyboard".
      const parts = a.file.split(sep);
      const dir = parts[parts.length - 2] ?? "";
      const generic = ["types", "dist", "lib", "es", "esm", "cjs", "src", "build"];
      const feature = dir && !generic.includes(dir) ? dir : pkg;
      return `| \`${name}\` | ${n} | \`${a.merged}\` | ${feature} | ${
        imported.length ? "yes" : "**NO — runtime TypeError**"
      } |`;
    });

  const doc = `# ${pkg} — installed API surface (v${ver})

<!-- GENERATED by api-surface.mjs. Do not edit by hand. -->
<!-- Regenerate after any upgrade: node api-surface.mjs --package=${pkg} -->

Read from \`node_modules/${pkg}\` at generation time, not from documentation or
recall. Published tutorials describe whatever version was current when they were
written; this describes the one installed here.

- Version: **${ver}** (declared \`${deps[pkg] ?? "—"}\`)
- Exported classes: **${classes.size}**
- Interface merges onto other modules: **${augs.length}**
- Source files importing it: **${imported.length}**

${
  augs.length
    ? `## API added by interface merging

\`${pkg}\` merges members onto types it does not own, via \`declare module\` /
\`declare global\`. Two failure shapes follow, and they behave differently under
\`tsc\` — do not assume a green typecheck covers both:

1. **Missing import.** If nothing pulls the declaring file into the program, the
   merged members disappear from the type system too, and \`tsc\` reports them as
   unknown. Loud, and caught at build time.
2. **Import present, registration absent.** When the augmentation ships inside a
   package that is imported anyway, the types load unconditionally — but the
   members only *work* after a separate runtime step (\`graph.use(new Plugin())\`,
   a setup file, a middleware wrapper). TypeScript cannot see that step. The
   code compiles clean and throws \`TypeError\` at runtime.

Shape 2 is the one that reaches production. The "Provided by" column below names
the feature whose registration each member depends on.

| Merges onto | Declared in | Members |
|---|---|---|
${augs
  .slice(0, 12)
  .map(
    (a) =>
      `| \`${a.merged}\` in \`${a.target}\` | \`${a.file.split(sep).slice(1).join("/")}\` | ${a.members
        .slice(0, 5)
        .map((m) => `\`${m}\``)
        .join(", ")}${a.members.length > 5 ? ` … (${a.members.length})` : ""} |`,
  )
  .join("\n")}${augs.length > 12 ? `\n\n…and ${augs.length - 12} more.` : ""}

The declaring file usually names the feature that must be registered — an
augmentation under \`plugin/selection/\` needs the selection plugin enabled.

${
  imported.length
    ? `Imported by ${imported.length} file(s), first \`${relative(ROOT, imported[0])}\` — so the merged types load. That satisfies shape 1 only; shape 2 still needs the runtime registration, which nothing here can verify for you.`
    : `**No source file imports \`${pkg}\`.** Any merged member called in this codebase is unregistered.`
}
`
    : ""
}${
    usedRows.length
      ? `
### Augmented members this codebase calls

Counts are textual matches on \`.member(\` across \`${relative(ROOT, SRC)}/\`, so a
member with a common name (\`text\`, \`get\`, \`select\`) may be over-counted by
unrelated calls. Treat them as ranking, not as an exact census.

| Member | Calls | Merges onto | Provided by | Registered |
|---|---|---|---|---|
${usedRows.join("\n")}
`
      : ""
  }${
    ranked.length
      ? `
## Exported classes

| Class | Own members | With inherited | Extends |
|---|---|---|---|
${ranked
  .map(
    (c) =>
      `| \`${c.name}\` | ${c.members.size} | ${c.total} | ${c.base ? `\`${c.base}\`` : "—"} |`,
  )
  .join("\n")}

Inherited members are real API — resolve against the whole chain before
concluding a method is missing.
`
      : ""
  }${
  siblings.length
    ? `
## Sibling packages shipping no JavaScript

${siblings.map((s) => `- \`${s}\``).join("\n")}

Packages under \`${scope}\` that contain no JavaScript. This is the signature of a
major version that folded satellite packages back into the core module: the names
still resolve on npm, tutorials still reference them, and importing one gets you
nothing. Import from \`${pkg}\` instead and drop these from package.json.
`
    : ""
}
## Keeping this honest

\`\`\`bash
node api-surface.mjs --package=${pkg}   # regenerate after any upgrade
node api-surface.mjs --check            # CI gate
\`\`\`
`;

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, doc);
  console.log(`api-surface: wrote ${relative(ROOT, out)} for ${pkg}@${ver}`);
  console.log(
    `  ${classes.size} classes, ${augs.length} augmentation(s), ` +
      `${called.size} augmented member(s) called, ${imported.length} importer(s)` +
      (siblings.length ? `, ${siblings.length} stub sibling(s)` : ""),
  );
}

// ── entry ───────────────────────────────────────────────────────────────────

if (!existsSync(join(ROOT, "package.json"))) {
  console.error(`api-surface: no package.json at ${ROOT} — pass --root=<dir>`);
  process.exit(2);
}

if (argv.includes("--check")) process.exit(check() ? 1 : 0);
else if (argv.includes("--scan")) scan();
else if (opt("family")) process.exit((await family(opt("family"))) ? 1 : 0);
else if (opt("package")) generate(opt("package"));
else {
  console.error("api-surface: pass --scan, --check, --family=<name>, or --package=<name>");
  process.exit(2);
}
