# Library API Grounding — Trap Taxonomy

**Last updated:** 2026-07-27
**Tooling:** `scripts/api-surface.mjs` · **Skill:** `/api-ground`

Why generated code calls methods that do not exist, and how to detect each cause
mechanically rather than by reading documentation.

## The core asymmetry

A model writes library code from training data. Training data reflects the
version that was popular when the tutorials were written. The installed version
is whatever `package.json` resolved to this morning. Nothing reconciles the two,
and the model has no signal that it is describing a version you do not have.

Retrieval over the library's source does not fix this. The question is *"does this
method exist in the installed version"* — an exact lookup. Vector similarity
answers approximately, which is the failure mode itself. Read the types.

## Trap 1 — Package reorganization

A major version moves API between packages. The old package names still resolve
on npm and still appear in every tutorial. Sometimes they still install, as stubs
containing no JavaScript.

**Real case (AntV X6, v2 → v3):** every plugin moved back into core `@antv/x6`.
The `@antv/x6-plugin-*` packages at 3.0.0 ship only `index.css` and `index.less`.
Core injects its own styles at runtime, so the CSS is dead too. Every published v2
example says `npm i @antv/x6-plugin-selection` and imports from it. On v3 that
import resolves to nothing.

**Detection:** a declared dependency whose installed directory contains no `.js`
files. Exempt packages that *are* referenced — a CSS-only package pulled in with
`@import` is legitimate, and flagging it would tell someone to delete a working
dependency.

## Trap 2 — Interface merging without registration

`declare module '<target>' { interface X { ... } }` and `declare global` merge
members onto types the package does not own. TypeScript applies these merges
**globally** the moment the declaring file enters the program.

Two sub-shapes, and they behave differently under `tsc`:

**2a — Import missing.** Nothing pulls the declaring file in, so the merged
members leave the type system with it. `tsc` reports them as unknown. Loud, caught
at build.

**2b — Import present, registration absent.** The augmentation ships inside a
package that is imported anyway, so the types load unconditionally. But the
members only *work* after a separate runtime step: `graph.use(new Selection())`,
a vitest setup file, a middleware wrapper, `app.use(...)`. TypeScript has no
representation of that step. **Compiles clean, throws `TypeError` at runtime.**

**Real case (X6 again):** `graph.getSelectedCells()` is not on the core `Graph`
class — 129 own members, and it is not among them. It arrives via
`es/plugin/selection/api.d.ts`. Importing `@antv/x6` at all loads that file, so
the call typechecks whether or not `graph.use(new Selection())` ever ran.

**Contrast (`@testing-library/jest-dom`):** the identical construct, but the
package exists *only* for the augmentation. Delete the `import` from the setup
file and the types vanish with it — `tsc` catches it. Shape 2a, not 2b.

The distinction matters: **2b is the only one a green build does not cover.** Do
not tell people "this typechecks and throws" about a 2a case; verify which shape
you have before writing it down.

**Detection:** glob the package's `.d.ts` for `declare module` / `declare global`
blocks containing an `interface` merge. Resolve members from the block itself, not
by interface name — a package with eight plugins declares `interface Graph` eight
times, and a name lookup collapses them into whichever parsed first. Follow
`extends` into the package's other files for the jest-dom shape, where the
augmentation site is empty and the members are inherited.

Deduplicate across `es/` `lib/` `dist/`: identical merges are one trap, not three.

## Trap 3 — Inherited API mistaken for missing API

`Graph extends Basecoat extends Events` is where `on`/`off`/`once` come from. A
naive "is this method on the class" check reports correct code as drift.

**Detection:** walk the `extends` chain and union the members before concluding
anything is missing. False drift reports train people to ignore the tool.

## Trap 4 — Two parallel implementations

A spike and a production feature both exist. The agent cannot tell which is
canonical, so it invents a third pattern from parts of both. This is not a library
problem, but it produces the same symptom and is worth catching in the same pass.

**Detection:** none, mechanically. Ask, then record the answer in `CLAUDE.md` —
naming the canonical directory and explicitly marking the other as off-limits.

## What generalizes

Portable across every npm package: version pinning, the class/inheritance walk,
augmentation detection, usage counting, and stub-dependency detection.

Not portable: any single library's directory conventions. `es/plugin/*/api.d.ts`
and `declare module '../../graph/graph'` are X6 facts. A generic tool globs all
`.d.ts` and matches the construct, never the path.

## Ordering

1. `--scan` to rank dependencies by structural risk.
2. `--package=` to generate a reference for the ones that matter.
3. Record judgment separately — canonical example file, decoy directories.
4. `--check` in CI, guarded on the whole source tree.
5. One pointer line in `CLAUDE.md` / `AGENTS.md`.

Regenerate after every upgrade. A stale reference reads as authoritative and is
worse than none.
