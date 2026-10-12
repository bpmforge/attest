# Component Sourcing — source before you build

**Verified:** 2026-10-12. Tool/registry status in `references/ui-ecosystem-map.md` §4.
**Readers:** frontend-design, interaction-engineer, agent-ui-engineer, design-system-lead (inventory "existing-library reuse vs new" column).

Agents without a catalog reinvent the same flat cards, forms, and navbars. Agents with an *unvetted* catalog paste in components that break the design system, the license, or accessibility. This protocol is the middle path: search in a fixed order, score what you find, vendor with provenance.

## 1. Search order (stop at the first source that satisfies the need)

1. **The project itself** — `components/ui/`, `src/components/`, an existing private registry (`components.json` → `registries`). Grep before you search the web (R-18).
2. **The project's design-system registry** — if the project/org publishes a shadcn registry (a GitHub repo can be one), use it.
3. **Official shadcn registry** — via shadcn MCP if registered, otherwise the CLI: `npx shadcn@latest search <registry> -q "<term>"`, `npx shadcn@latest view <item>`, `npx shadcn@latest docs <component>` (API + usage for the installed version). Flags drift between CLI versions — run `npx shadcn@latest --help` first.
4. **Third-party shadcn-compatible registries** (Magic UI, AI Elements, assistant-ui registry, etc.) — through the same CLI/MCP so files and dependencies are tracked.
5. **21st.dev** — via the 21st MCP if the user has configured it (needs their API key; never configure it yourself), otherwise browse/search the site with `playwright-search`.
6. **Copy-in galleries** (React Bits, Aceternity, Motion Primitives) — inspiration and last-resort source; highest scrutiny.
7. **Build it** — only when 1–6 found nothing that passes §2, and record why.

Search with the *job*, not the look: "sortable card with drag handle and keyboard support", not "cool card".

## 2. Scorecard (any ✗ in the first four rows = reject)

| Check | Pass condition | How |
|---|---|---|
| License | Compatible with the project; recorded | repo LICENSE / `npm view <pkg> license`; NOASSERTION = ask the user |
| Maintenance | Upstream pushed within ~12 months, not archived/deprecated | `gh api repos/<o>/<r>`, `npm view <pkg> deprecated` |
| Accessibility | Keyboard operable, focus visible, correct roles; drag/animation pass `references/interaction-patterns.md` | Read the source + run axe on a rendered instance |
| Design-system fit | Uses the project's tokens/primitives or can be re-skinned to them without a rewrite | Read the source for hard-coded colors/fonts/durations |
| Dependencies | Adds no new heavy dependency without justification; no duplicate of an existing one (two animation libs, two DnD libs) | diff `package.json` before/after |
| Reduced motion | Honors `prefers-reduced-motion` | Read source / emulate in Playwright |
| Bundle | Size impact noted for anything > ~20 KB gz | `bundle-analyzer` if the project already measures |

## 3. Vendoring with provenance (R-30)

- Pull files with the real CLI/registry (`npx shadcn@latest add <registry-item>`), never retype a component "from memory".
- Record provenance in `docs/design/COMPONENT_SOURCES.md`: component, source URL/registry item, version or commit, license, date, local modifications.
- After vendoring: replace hard-coded values with tokens, run the scorecard's a11y row on the rendered result, screenshot it.

## 4. Publishing a project registry (when the same components recur across projects)

A shadcn registry is a `registry.json` + item JSON files that a CLI/MCP can install from; it can carry components, hooks, themes/tokens, and docs. Read the current registry docs (Context7 `shadcn`, or `ui.shadcn.com/docs/registry`) before authoring — the schema has changed across CLI majors. Each item states its dependencies and target paths; CI should install every item into a blank app to prove it builds.

## 5. Output

Every sourcing decision lands in `docs/design/COMPONENT_SOURCES.md` (one row per component, including "built in-house — searched X, Y, Z, rejected because…"). A component with no row is unaudited.
