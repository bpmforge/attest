# MANIFEST — M-T1-test-impact-map (WP-T1)

Branch `feat/test-impact-map-select`, commit 878e801 (chapter lands in b5bed19). Spec: `docs/work/TEST_IMPACT_PLAN.md` §2, §5 T1.

## What changed

- `scripts/test/common.mjs` (git/file listing, glob, sha, `.sdlc/sdlc.json` `test.*` reader, argv), `scripts/test/resolve.mjs` (per-language import extraction + resolvers), `scripts/test/map.mjs`, `scripts/test/ledger.mjs`. `.gitignore`: `docs/work/test/`.
- `map.mjs build|refresh [--root] [--full] [--out] [--index auto|off]` (same operation, incremental), `declare <test> <src...>`, `show <test>`. Output `docs/work/test/map.json`: `{version, meta{tests,files,stacks,index,uc_priority}, tests{<file>:{runner,project,kind,uc,covers,sha,declared?,last_run?,flaky?}}, graph{<file>:{sha,mt,p}}}`. Deviation from the plan sketch: tests live under `tests` (top level also carries `meta`/`graph`, the parse cache that makes refresh incremental).
- Resolution: TS/JS (relative, `.js`->`.ts`, index, tsconfig `paths`/`baseUrl`/`extends`, package.json packages by name incl. workspaces -> `source|module|main|types|exports` with dist->src mapping, `require`/dynamic import/`jest|vi.mock`), Python (absolute + relative + package `__init__`, `from pkg import submodule`, conftest.py ancestors), Go (go.mod module path -> package dir; every file depends on its non-test siblings), Rust (`mod`, `use` with brace expansion, `crate::/self::/super::`, crate deps from Cargo.toml path deps, integration tests of the own crate). node_modules/vendor/target/dist/build etc. excluded.
- kind: smoke (path matches smoke|contract) > e2e (playwright / e2e dir) > integration (path `integration` or imports a db/server/http module or `.listen(` etc.) > unit. uc[] = UC-ID in the file name or on a `describe(/it(/test(/context(/`def test_`/`func Test`/`#[test]` line; P0/P1/P2 per UC from `docs/testing/USE_CASES.md` or `docs/USE_CASES.md` into `meta.uc_priority`.
- `ledger.mjs`: `{version, full:{tree,sha,date,runners}, chain, files:{<test>:{result,last_run,ms,sha,flaky?}}, dirty_files}`; `readLedger`, `isAncestor`, `recordRun(root, scope, results, opts)` (green full = new baseline + chain 0; red full only updates files; impact = chain+1; mirrors `last_run`/`flaky` into map.json), `rolling`, `failing`; CLI `show` / `record --scope full|impact --results r.json`.

## Limits (for reviewers)

- Code-search index: the index is only specified as an MCP surface (no schema in this repo). `map.mjs` reads `.code-search/index.db` with `node:sqlite` when present and adds edges from any table named like `import|depend|edge` with a recognizable (file, target) column pair; otherwise it records `meta.index = "present: no recognizable import table (regex only)"`. Verified only against a synthetic `imports(file,target)` table, not a real code-search index. Regex resolution always runs.
- Static resolution does not see runtime-read fixtures, env-driven behaviour, jest `__mocks__` auto-mocks or Go `embed`/testdata; that residual risk is what the always/rolling/full policy (T2) covers. Rust `mod` children are edges only when the parent references them (`child::` / `use ... child`) or the parent is not a crate root, to keep lib.rs from covering every module.
- `flaky` in the ledger is sticky until a result carries `flaky:false`.

## Acceptance checklist (evidence: Pass 56 in `npm test`)

| Acceptance line | Evidence |
|---|---|
| map.mjs builds map.json: covers[] (TS/JS aliases, Python, Go, Rust), kind, uc[]; code-search index when present, regex otherwise | "map build discovers every test file", "covers[] of a shared util lists every transitive importer (relative, .js->.ts, tsconfig alias, re-export index)", "workspace import", kind/runner/uc tests, python / go / rust / jest-layout covers tests, "code-search index import edges are added…" and "without an index the regex resolution alone is used" |
| incremental refresh by sha; --full rebuilds | "second refresh re-parses nothing", "touching one test file re-parses exactly that file", "a new import in the util reaches every importer's covers[] without re-parsing the importers", "--full re-parses everything" |
| ledger.mjs + git-ignored docs/work/test/ | "green full run recorded", "tree hash stored; last_run mirrored into map.json", chain/baseline tests, "docs/work/test/ … is git-ignored in the repo" (`git check-ignore -v` -> `.gitignore:91`) |
| fixture repos node (vitest+jest), python, go, rust; registered; npm test green | `scripts/test-test-impact.ts`, Pass 56 in `scripts/test.ts`; `npm test` 1385 passed / 0 failed (baseline 1313) |

Unmet / partial: the "uses the code-search index" line is met only through the schema-probing adapter above (no real index available to verify). Real vitest 2 and Playwright 1.49 were also probed by hand on a scratch repo (`vitest list --filesOnly --changed <ref>` returns the file list; Playwright `--only-changed` does NOT follow transitive imports on first run, which is why the map union matters); the test chapter itself uses stubs.
