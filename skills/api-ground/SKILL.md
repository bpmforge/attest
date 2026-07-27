---
name: api-ground
description: 'Ground the agent in a library''s real API before writing code against it — generate a version-pinned reference from the installed package, not from training data. Use before adopting a library, after a major upgrade, or when generated code keeps calling methods that do not exist.'
---

# API Ground

Models write library code from training data. Training data describes whatever
version was current when the tutorials were written. When a library reorganizes
between majors, the generated code is confidently wrong — and a green typecheck
does not always catch it.

This skill produces a **version-pinned reference read off `node_modules`**, so the
agent has the API that is installed rather than the one that was popular.

Use it when: adopting a library, after a major-version bump, or when generated
code repeatedly calls methods that do not exist.

Do NOT build a RAG index over library source for this. The question is "does this
method exist in the installed version" — an exact lookup, answered by type
definitions and grep. Similarity search returns *approximately* right, which is
the failure being eliminated.

## The two failure shapes

**1. Package reorganization.** A major version folds satellite packages into the
core module, or splits them out. The old names still resolve on npm, tutorials
still reference them, and the packages may still install — as stubs shipping no
JavaScript. Anything written from recall imports a package that resolves to
nothing.

**2. Interface merging without registration.** `declare module` / `declare global`
merges members onto types the package does not own. TypeScript applies those
merges globally. If the augmentation ships inside a package that gets imported
anyway, the merged members type-resolve unconditionally — but only *work* after a
separate runtime step (`graph.use(new Plugin())`, a setup file, a middleware
wrapper). TypeScript cannot see that step. **This shape compiles clean and throws
`TypeError` at runtime**, and it is the one that reaches production.

Shape 2 is the reason a passing build is not evidence of correctness here.

## Locating the script

A global install puts it beside the other expert scripts; a project-mode install
does not ship `scripts/` at all. Resolve it once, then use `$EXPERTS` below:

```bash
EXPERTS=$(for d in ~/.config/opencode/scripts ~/.claude/scripts; do
  [ -f "$d/api-surface.mjs" ] && echo "$d" && break
done)
```

If that comes back empty you are on a project-mode install: copy
`api-surface.mjs` into the target repo (`scripts/` or `frontend/scripts/`), commit
it, and set `EXPERTS` to that directory. A vendored copy is the intended fallback
— the script has no dependencies beyond `node:fs` and `node:path`, and living in
the repo means CI can run it without the expert system installed.

## Workflow

### 1. Rank the project's dependencies by risk

```bash
node "$EXPERTS/api-surface.mjs" --scan
```

Ranks every dependency by structural risk: interface merges, packages shipping no
JavaScript, and whether merged members are already being called. Run from the
directory holding `package.json`, or pass `--root=<dir> --src=<dir>`.

Read the output, don't just take the top row. High `augs` with low `calls` is
latent exposure; `NO — LIVE BUG` in the registered column is an active defect.

Frameworks rank on structure alone — Next.js merges a dozen members onto `Window`
and `HTMLAttributes` with no registration step behind any of them. That is not
actionable. The rows worth acting on are feature libraries whose merged members
the project actually calls.

### 2. Generate a reference for the libraries that matter

```bash
node "$EXPERTS/api-surface.mjs" --package=@antv/x6
```

Writes `docs/development/<PKG>_API.md`: installed version, exported classes with
inherited members resolved, every interface merge with the feature that must be
registered, and which merged members this codebase actually calls.

Generate for libraries the project builds *on*, not every flagged dependency. A
framework the whole app already imports correctly is lower value than the one
feature library nobody understands.

### 3. Add what the generator cannot know

The generated file is mechanical and must stay that way — never hand-edit it.
Put judgment in a sibling doc or a `CLAUDE.md` / `AGENTS.md` rule:

- Which in-repo file is the **canonical example** to copy from.
- Directories that look canonical but are not (spikes, labs, legacy).
- Version-specific traps confirmed by reading the installed types.

Derive every trap from the installed package. If you cannot show the grep or the
type definition that proves it, do not write it down — a confabulated trap list is
worse than none.

### 4. Gate it

```bash
node "$EXPERTS/api-surface.mjs" --check
```

Exits non-zero on: a declared dependency shipping no JavaScript that nothing
references, and augmented members called with no import of the package declaring
them. Wire into the project's CI standards script and expose as an npm script.

Guard the CI invocation on the whole source tree, not one feature directory — a
new module elsewhere is exactly the case that regresses.

### 5. Point the agent at it

One line in `CLAUDE.md` / `AGENTS.md`. A reference nothing links to is dead
weight — the pointer is what gets loaded every session.

## Rules

- **Regenerate after every upgrade.** A stale reference is worse than none — it
  reads as authoritative. The header records the version it was generated from.
- **Never hand-edit generated output.** Fix the generator instead.
- **Usage-driven beats surface-driven.** A library with 800 exported symbols and
  30 in use needs the 30 listed, with the rest reachable. Dumping the surface
  recreates the noise problem.
- **Don't claim a method is missing without checking inheritance.** Base-class and
  merged members are real API; the generator resolves both.
- **Report counts honestly.** Call counts are textual matches and over-count
  common names. Rank with them; do not present them as a census.

## Related

- `references/library-api-grounding.md` — the trap taxonomy and detection method.
- `references/context7-mcp.md` — live upstream docs. Complementary: Context7 gives
  current *published* docs, this gives the *installed* truth. When they disagree,
  the installed package wins.
