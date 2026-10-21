# DESIGN.md Interop — import into and export from `docs/design/tokens.json`

**Verified:** 2026-10-12 — spec read from google-labs-code/design.md `docs/spec.md` (header `version: alpha`; repo Apache-2.0, last push 2026-10-08). The CLI is npm `@google/design.md` 0.4.0 (published 2026-07-27; npm `license` field empty — the repo LICENSE is Apache-2.0). Spec version and CLI version are separate numbers.
**Readers:** design-system-lead (Execution steps 2c and 6), design-iterator (`--sync` provenance convention), frontend-design (`--system`, consumes tokens.json only).

`docs/design/tokens.json` stays the **single source of truth** in attest. DESIGN.md is an interop format: read it when a project already has one, write it when other agents/tools want one. Neither direction changes `tokens.json`'s required shape (see `agents/design-system-lead.md` "tokens.json shape").

## Format summary (spec `alpha`)

- Optional YAML front matter between two lines of exactly `---`, then a markdown body.
- Front matter keys: `version` (optional, `"alpha"`), `name`, `description` (opt), `omitted` (opt), `colors`, `typography`, `rounded`, `spacing`, `components`.
- Token references: `{path.to.token}` (e.g. `{colors.primary}`); resolve them before mapping.
- Dimensions: string with `px`, `em`, or `rem`. Colors: any CSS color string (hex recommended).
- Body sections are `##` headings in this order, any may be omitted: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts. A **duplicate section heading is an error** — the file is rejected.
- No motion tokens and no shadow tokens: "Elevation & Depth" is prose only.

## Key mapping (import direction: DESIGN.md → tokens.json)

| tokens.json required key | DESIGN.md source | Rule |
|---|---|---|
| `color.primary` | `colors.primary` | Direct |
| `color.surface` | `colors.surface`, else `colors.neutral` | `surface` wins when both exist |
| `color.text` | `colors.on-surface` | Absent → author |
| `color.muted` | `colors.secondary` only if the Colors prose says it is the muted/meta color | Otherwise author — do not guess from the name |
| `color.border` | none (no recommended name in the spec) | Always author, unless a token is literally named `border`/`outline` |
| `color.semantic.error` | `colors.error` | Direct |
| `color.semantic.success/warning/info` | same-named tokens if present | Absent → derive from the scale (design-system-lead Hard rule 1) |
| `typography.fontFamily` | `fontFamily` of `body-md`, else of the most-used family across typography tokens | Display family (e.g. `headline-*`) recorded as a note, not as the primary |
| `typography.scale` | distinct `fontSize` values across all typography tokens, sorted ascending | Keep units |
| `typography.weights` | distinct `fontWeight` values, sorted | Numbers |
| `spacing` | values of `spacing.*` that are Dimensions, sorted ascending | Unitless entries (column counts, ratios) are preserved under an extra key `spacingMeta`, not in the scale |
| `motion.duration`, `motion.easing` | none | Always author |
| `shadow` | none (Elevation prose only) | Always author; quote the Elevation prose in the rationale |
| — (extra key) `radius` | `rounded.*` | No required tokens.json key; preserve as an extra `radius` object rather than dropping it |
| — | `components.*` | Not tokens; carry into `docs/design/components.md` notes for the matching component |

Unknown token names in the source are accepted (spec "Consumer Behavior"); keep them under the matching extra key rather than discarding.

## Precedence when several sources exist

Figma snapshot (`docs/design/figma-snapshot.json`, Execution step 2b) **>** project `DESIGN.md` (step 2c) **>** prose-authored values. A lower source fills only keys the higher one left empty. Conflicts between sources are recorded in `components.md` "Gaps" — never silently resolved.

Mark the result with `"provenance": "design-md-import"` (or `"figma+design-md"` when both contributed), the same convention design-iterator `--sync` uses for `"extracted-baseline"`.

## Export direction (tokens.json → `docs/design/DESIGN.md`, optional)

- Front matter: `version: alpha`, `name` (project name), `colors` (`primary`, `surface`, `on-surface` ← `color.text`, `secondary` ← `color.muted`, `outline` ← `color.border`, `error`/`success`/`warning`/`info` ← semantic), `typography` (one `body-md` token from fontFamily + base size; one token per remaining scale step), `spacing` (`xs…xl` from the scale), `rounded` (from `radius` if present).
- Motion and shadow have no front-matter home: put them in the Elevation & Depth / Overview prose with their exact values.
- Body: the spec's section order, one heading each, rationale taken from `DESIGN_PRINCIPLES.md` / `STYLE_GUIDE.md` — no new design decisions are made during export.
- Header line in the body: `Generated from docs/design/tokens.json on <date> — edit tokens.json, not this file.`
- Optional lint: `npx @google/design.md lint docs/design/DESIGN.md` (subcommands `lint`, `diff`, `export`, `spec` per the repo README / `packages/cli/src/commands/`; if `npx` mis-resolves the dotted name, the README documents `npx -p @google/design.md designmd lint`). Pin the version.

## Validator note

`scripts/validators/validate-design-tokens.sh` only activates when `figma-snapshot.json` exists; a DESIGN.md import does not change what it checks.
