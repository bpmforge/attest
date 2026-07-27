# Library Adoption Protocol — four questions, four authorities

**Verified:** 2026-07-27, walked end-to-end against AntV X6 v3.1.7.
**Applies to:** every third-party library, at adoption and at every major upgrade.

Generated code that uses a third-party library fails in a way ordinary review does not
catch: it looks exactly like every tutorial, passes its own tests, and passes `tsc`. A
reviewer reading the diff sees idiomatic code. This protocol exists because reading the
diff is not sufficient evidence — the evidence has to be produced separately.

## The mistake this prevents

"Verify the API before writing code" sounds like one question. It is four, and **no single
source answers more than one of them.** Treating any one source as sufficient is the defect.

| Question | Only authority | What answers it |
|---|---|---|
| How do I call it? | published docs | **Context7** → fallback: shipped `.d.ts` |
| Which version is that? | the installed tree | `node_modules/<pkg>/package.json` |
| What will `npm install` give me? | the registry | `npm view` · `api-surface.mjs --family=` |
| Does my code satisfy its runtime contract? | my own source | `api-surface.mjs --check` |

Context7 is excellent at question 1 and does not take questions 2–4. That is not a flaw —
it is scope. The failure is asking it question 3 by omission.

## Walked through: AntV X6, 2026-07-27

**Q1 — how do I call it?** Context7 `antvis/x6`, 25k tokens. Result: 20 imports, all
`from '@antv/x6'`, zero references to any `@antv/x6-plugin-*`. **Correct and current.** An
agent stopping here writes the right calls.

**Q2 — which version?** The same 116 KB response contains **no version string at all**. So
Q1's answer is unversioned: correct-looking calls with no way to know if the installed tree
agrees. Answered instead by reading `node_modules/@antv/x6/package.json` → `3.1.7`.

**Q3 — what will install?** `--family=@antv/x6` → **19 family members resolve to a
different major.** `npm i @antv/x6-plugin-selection` installs `2.2.2`, a real working **v2**
plugin, into a **v3** graph. Not a stub, not an error — working code doing the wrong thing.
Nothing in Q1 or Q2 surfaces this, and every v2 tutorial plus npm's own `latest` tag
endorses the bad install line.

**Q4 — does my code satisfy the contract?** X6 plugins merge methods onto `Graph` via
`declare module`, so `graph.getSelectedCells()` typechecks whether or not
`graph.use(new Selection())` ever ran. `--check` catches the missing registration; `tsc`
structurally cannot.

**An agent that answered only Q1 — the question "verify the API via Context7" actually
asks — ships broken code having complied with every instruction.** Its failure mode is
silent success, which is why more instruction does not fix it.

## The protocol

**At adoption** (before the library enters `TECH_STACK.md`):

```bash
npm view <pkg> version                          # Q2 — pin this exact version in the stack doc
node "$EXPERTS/api-surface.mjs" --family=<pkg>  # Q3 — exits 1 on major skew
```

Record both in `TECH_STACK.md`. A stack entry without a registry-verified version is a
recommendation, not a decision — downstream agents resolve it to whatever `latest` is, which
is the version nobody evaluated. If `--family` reports skew, record which members to pin or
avoid **and why**; that is invisible downstream unless the stack doc says it.

**Before writing code:**

```bash
node "$EXPERTS/api-surface.mjs" --package=<pkg>  # Q2+Q4 — generated, version-pinned
```

Then Context7 for Q1 usage patterns. Prefer the generated doc when they disagree: it read
your tree, Context7 read the docs.

**In CI, every build:**

```bash
node "$EXPERTS/api-surface.mjs" --check          # Q3+Q4 regressions
```

**At every major upgrade:** all of the above again. The generated doc carries the version it
was produced from; a stale one reads as authoritative and is worse than none.

## Why this is reviewable, and ordinary review is not

Each step emits an artifact — a pinned version, a `--family` exit code, a generated
reference, a CI result. A reviewer checks four artifacts instead of re-deriving four
judgments from a diff. That is the difference between "I read the code and it looked right"
and evidence, and it is what makes AI-authored library code reviewable by someone who did
not write it.

It does not replace human architectural review. It removes from that review the one class
that human review is worst at — a wrong version or install line, invisible in a diff because
the code is idiomatic and the tests pass.

## Related

- `references/antv-x6-v3.md` — the worked instance
- `references/library-api-grounding.md` — the trap taxonomy
- `references/context7-mcp.md` — Context7 setup and tool surface
- `/api-ground` — the skill that runs this
