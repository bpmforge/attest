# AntV X6 v3 — what training data and npm both get wrong

**Verified:** 2026-07-27 against the npm registry and an installed `@antv/x6@3.1.7` tree.
**Applies to:** any project whose design calls for AntV X6. Re-verify on adoption —
`npm view @antv/x6 version` and the table below are the only claims here with a shelf life.

Read this before writing X6 code. Generate a project-specific companion with
`/api-ground` (`api-surface.mjs --package=@antv/x6`), which reads the installed tree and
cannot drift; this file covers what is true of v3 generally and is not derivable from any
single repo.

## Verify before trusting this file

```bash
node "$EXPERTS/api-surface.mjs" --family=@antv/x6
```

That prints the live registry state. The table below is a snapshot; the command is
authoritative. Context7 answers "what do the docs say" — this answers "what will npm
actually install", which is where AntV's satellites diverge.

## The install line

```bash
npm i @antv/x6                    # everything: core + all plugins
npm i @antv/x6-react-shape        # ONLY if rendering React components as nodes
npm i @antv/x6-vue-shape          # ONLY if rendering Vue components as nodes
```

**Never install any `@antv/x6-plugin-*` package on v3.** Not one of them is needed.

## Why that line is not the obvious one

X6 v3 folded every plugin back into core. The satellite packages still exist on npm, and
**most of their `latest` tags still point at v2**, so the ordinary "install the latest
version" instinct actively lands on the wrong thing:

| Package | `latest` (2026-07-27) | What you get |
|---|---|---|
| `@antv/x6` | **3.1.7** | correct — core, plugins included |
| `@antv/x6-react-shape` | **3.0.1** | correct, v3-compatible |
| `@antv/x6-vue-shape` | **3.0.2** | correct, v3-compatible |
| `@antv/x6-plugin-selection` | 2.2.2 | **a real, working v2 plugin** |
| `@antv/x6-plugin-history` | 2.2.4 | v2 |
| `@antv/x6-plugin-keyboard` | 2.2.3 | v2 |
| `@antv/x6-plugin-snapline` | 2.1.7 | v2 |
| `@antv/x6-plugin-transform` | 2.1.8 | v2 |
| `@antv/x6-plugin-export` | 2.1.6 | v2 |
| `@antv/x6-plugin-stencil` | 2.1.5 | v2 |
| `@antv/x6-plugin-dnd` | 2.1.1 | v2 |
| `@antv/x6-plugin-scroller` | 2.0.10 | v2 |
| `@antv/x6-plugin-minimap` | 2.0.7 | v2 |
| `@antv/x6-plugin-clipboard` | 3.0.0 | a **CSS-only stub** — no JavaScript at all |

Two different failure shapes, and the first is the dangerous one:

- **Pinning `latest`** (or no range) gets a genuine v2 plugin. `new Selection()` from a v2
  package handed to a v3 `graph.use()` is real code doing the wrong thing — no import
  error, no type error, just behaviour that is subtly wrong or breaks under load.
- **Pinning `^3.0.0`** gets the CSS-only stub where one was published. Inert: the import
  resolves to nothing.

Neither is caught by `tsc`. Every v2 tutorial, blog post, and StackOverflow answer says
`npm i @antv/x6-plugin-selection`, and npm's `latest` tag appears to confirm it.

Core self-injects plugin styles at runtime (`CssLoader.ensure` in `graph/css.js` and each
`plugin/*/index.js`), so the stub packages' stylesheets are dead weight too — there is no
CSS you need from them.

## Correct v3 usage

```ts
import { Graph, Selection, History, Keyboard, Clipboard, Snapline, MiniMap } from "@antv/x6";
```

Everything exported from core: `Clipboard`, `Dnd`, `Export`, `History`, `Keyboard`,
`MiniMap`, `Scroller`, `Selection`, `Snapline`, `Stencil`, `Transform`.

```ts
// Client-only: @antv/x6 touches `document` at import time. Construct inside an effect;
// keep it out of any server component or SSR path.
const graph = new Graph({ container, autoResize: true, panning: true });

graph.use(new Selection({ enabled: true, rubberband: true }));
graph.use(new History({ enabled: true }));
graph.use(new Keyboard({ enabled: true, global: false }));
// ...then graph.dispose() on teardown.
```

## The trap that survives a green build

Each in-core plugin merges its methods onto `Graph` via
`declare module '../../graph/graph' { interface Graph { ... } }`. TypeScript applies those
merges **globally** as soon as `@antv/x6` is installed — which it always is.

So `graph.getSelectedCells()` **typechecks whether or not `graph.use(new Selection())` ever
ran.** The core `Graph` class has 129 own members and none of these are among them:

| Plugin | Methods it merges onto `Graph` (partial) |
|---|---|
| `Selection` | `select`, `unselect`, `getSelectedCells`, `isSelected`, `cleanSelection`, `resetSelection` … (31) |
| `History` | `undo`, `redo`, `canUndo`, `canRedo`, `getUndoStackSize` … (14) |
| `Keyboard` | `bindKey`, `unbindKey`, `clearKeys`, `triggerKey` … (8) |
| `Clipboard` | `copy`, `cut`, `paste`, `isClipboardEmpty` … (10) |
| `Snapline` | `enableSnapline`, `hideSnapline` … (16) |
| `Export` | `toSVG`, `toPNG`, `toJPEG` … (9) |

Forget the `use()` call and the failure is a runtime `TypeError` on a clean build. There is
no compiler diagnostic for it — `api-surface.mjs --check` exists precisely because nothing
in the normal toolchain covers this.

`on`/`off`/`once` are different: they are inherited from `Basecoat extends Events`, real
core API, no registration needed.

## Review checklist

- [ ] No `@antv/x6-plugin-*` in `package.json` or any import
- [ ] Every plugin method called has a matching `graph.use(new Plugin())` on that graph
- [ ] Graph constructed client-side only; `dispose()` on teardown
- [ ] `api-surface.mjs --check` wired into CI
- [ ] `docs/development/X6_API.md` generated and regenerated after every X6 upgrade

## Related

- `/api-ground` — generate the installed-tree reference for your project
- `references/library-api-grounding.md` — why this failure class exists generally
