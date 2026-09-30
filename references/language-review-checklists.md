# Language Review Checklists (Rust · TypeScript · Python · Go)

Reference for `code-reviewer`, `type-safety-checker`, `error-handling-auditor` and `coding-agent`. Read ONLY the section for
the language(s) in the diff. Mined from ECC's language reviewers (MIT, affaan-m/ECC) after a full-file read: ECC's own
files are thin, so what is kept here is only the language-specific checks attest did not already have, each with a
machine-checkable form. Generic style (PEP 8, docstrings, function length) is deliberately absent — `complexity-analyzer`
and the formatters own it.

**Shared exclude set.** Every grep form below ends with `$EX .` — define it once (bash) so vendored trees and build output do
not swamp the hits (a bare `.` grep on one Python repo returned 8,916 hits from `.venv`; Cargo workspaces keep code under
`crates/*/src`, so a literal `src/` silently returns 0):
`EX="--exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=venv --exclude-dir=target --exclude-dir=dist --exclude-dir=vendor --exclude-dir=.git"`.
Lints marked *(type-aware)* need typescript-eslint's `parserOptions.projectService` (or `project`); without it they do not run.

**How to use a line:** the grep/lint is a *candidate finder*, never a verdict. Read every hit; a finding is a hit that is
wrong in context. Lints are preferred over greps — if the project has no lint config for a rule, recommending the config is
itself a finding (LOW). Bash forms assume GNU/BSD `grep -E`; adjust the path/glob to the project. In the tables `\|` is a markdown-escaped `|` — in the shell it is plain `|` (regex alternation).

## Rust

| # | Check | Machine form |
|---|-------|--------------|
| R1 | `unsafe` needs a `// SAFETY:` comment naming the invariant | clippy `undocumented_unsafe_blocks`; `grep -rnE 'unsafe[[:space:]]*\{' --include=*.rs $EX .` then check the preceding line |
| R2 | No `unwrap()`/`expect()`/`panic!`/`todo!`/`unimplemented!` outside tests | clippy `unwrap_used`, `expect_used`, `panic`, `todo` with `allow-unwrap-in-tests = true` in `clippy.toml` (PREFER the lint: a raw grep on vulnforge gave 225 hits, nearly all inside `#[cfg(test)]` modules); grep fallback `grep -rnE '\.unwrap\(\)\|panic!\(\|todo!\(' --include=*.rs $EX .` — discard hits in test modules |
| R3 | Libraries return typed errors (`thiserror`); binaries use `anyhow` with `.context()`; no `Box<dyn Error>` in a library API | `grep -rnE 'Box<dyn (std::error::)?Error' $EX .`; `return Err\(e\)` with no context is a finding |
| R4 | No `let _ = <Result>` (a swallowed error); `#[must_use]` results handled | clippy `let_underscore_must_use`; `grep -rnE 'let _ = ' --include=*.rs $EX .` — graded: `let _ = tx.send(..)` to a possibly-closed channel is an accepted idiom; a discarded handler/IO/parse result (`let _ = handler.on_request(..).await`) is the finding |
| R5 | No blocking calls in `async fn` (`std::thread::sleep`, `std::fs::`, `std::net::`); unbounded channels are justified | clippy `await_holding_lock` (a lock guard held across `.await` ONLY — it does not see blocking calls; for `std::thread::sleep`/`std::fs` in `async fn` use clippy `disallowed_methods` or the grep); `grep -rnE 'unbounded_channel\|std::thread::sleep' --include=*.rs $EX .` |
| R6 | Every `#[allow(...)]` carries a justification; CI runs `cargo clippy -- -D warnings` | `grep -rnE '#\[allow\(' --include=*.rs $EX .` — a hit with no comment on the line or the line above is a finding |
| R7 | `_ =>` arms on business enums hide newly added variants | clippy `wildcard_enum_match_arm` |
| R8 | Dependencies audited in CI | `cargo audit`; `cargo deny check` (needs `deny.toml`) |

Wiring: `code-reviewer` and `concurrency-checker` read this file; `type-safety-checker` uses T3/T6/P6, `error-handling-auditor` uses R2–R4/G1–G2/P4, `coding-agent` uses the compile-fix note below.

Compile-fix guidance (for `coding-agent`, from ECC `rust-build-resolver`): borrow-checker errors (E0502/E0499/"does not live
long enough"/`async fn is not Send`) are fixed by restructuring ownership — **never** by adding `unsafe`, a blanket
`.unwrap()`, `.clone()` to dodge the borrow without a reason, or an unapproved `#[allow]`.

## TypeScript

| # | Check | Machine form |
|---|-------|--------------|
| T1 | No floating promises | eslint `@typescript-eslint/no-floating-promises`, `no-misused-promises` *(type-aware)* |
| T2 | No `array.forEach(async …)` (the promises are dropped) | `grep -rnE '\.forEach\([[:space:]]*async' --include=*.ts --include=*.tsx --include=*.js --include=*.mjs $EX --exclude=*.test.* --exclude=*.spec.* .` |
| T3 | `tsconfig` sets `strict` (which already implies `useUnknownInCatchVariables`) plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`; a diff that REMOVES a flag is HIGH | `grep -nE '"(strict\|noUncheckedIndexedAccess\|exactOptionalPropertyTypes\|noImplicitOverride)"' tsconfig*.json` |
| T4 | Never `throw "string"` / a non-Error (catch variables are `unknown` under `strict`) | eslint `only-throw-error` *(type-aware)*; `grep -rnE 'throw[[:space:]]+"' --include=*.ts $EX --exclude=*.test.* --exclude=*.spec.* .` |
| T5 | `JSON.parse` on external input is guarded or schema-validated (zod/valibot) | `grep -rn 'JSON\.parse(' --include=*.ts --exclude='*.test.*' $EX --exclude=*.test.* --exclude=*.spec.* .` — graded on repopulse (82 hits, mostly tests): a finding is an external input (request body, file, socket) cast with `as T` instead of parsed by a schema |
| T6 | Exported functions have explicit parameter and return types | eslint `explicit-module-boundary-types` |
| T7 | No bare `require()` in an ESM package (`"type":"module"`): it passes vitest and throws in production | `grep -rnE '\brequire\(' --include=*.ts --include=*.js $EX --exclude=*.test.* --exclude=*.spec.* .` in a package whose `package.json` has `"type": "module"` |
| T8 | `process.env.X` is validated once at startup, not read raw where used | manual: `grep -rn 'process\.env\.' --include=*.ts --exclude='*.test.*' $EX --exclude=*.test.* --exclude=*.spec.* .` is high-volume (166 hits on repopulse, mostly module-top config reads) — flag only reads INSIDE request/handler paths or with no default/validation |

## Python

| # | Check | Machine form |
|---|-------|--------------|
| P1 | No mutable default arguments | ruff `B006`; `grep -rnE 'def [a-z_0-9]+\(.*=[[:space:]]*(\[\]\|\{\})' --include=*.py $EX --exclude=test_*.py --exclude=*_test.py .` |
| P2 | No blocking calls inside `async def` (`requests.`, `time.sleep`, sync DB drivers) | ruff `ASYNC210` (blocking HTTP), `ASYNC251` (`time.sleep`), `ASYNC230` (blocking `open()`); sync DB drivers are NOT covered — read the async handlers |
| P3 | `asyncio.create_task(...)` result is kept (else the task can be garbage-collected mid-flight) | ruff `RUF006` |
| P4 | No `except:` / `except Exception: pass`; re-raise with `raise X from e` | ruff `E722`, `BLE001`, `S110`, `B904` |
| P5 | No `yaml.load` without `SafeLoader`, `pickle.loads` on untrusted data, `subprocess(..., shell=True)` | bandit `B506`, `B301`, `B602`; ruff `S` rules |
| P6 | Public functions annotated; `mypy --strict` (or pyright strict) on new code | ruff `ANN`; `mypy --strict` |
| P7 | `open()` uses a context manager; `is None` not `== None` | ruff `SIM115`, `E711` |
| P8 | FastAPI: `response_model` excludes password/token fields; no wildcard CORS with credentials; no sync client inside an async route | `grep -rnE 'allow_origins=\["\*"\]' --include=*.py $EX --exclude=test_*.py --exclude=*_test.py .` |

## Go

| # | Check | Machine form |
|---|-------|--------------|
| G1 | Errors are wrapped with `%w` when returned up the stack, and matched with `errors.Is/As` (never `err == target`) | golangci-lint `wrapcheck`, `errorlint`; `grep -rnE 'Errorf\(.*%v.*err' --include=*.go $EX --exclude=*_test.go . \| grep -v '%w'` |
| G2 | No ignored errors | `errcheck`; `grep -rnE '^[[:space:]]*_[[:space:]]*(,[[:space:]]*_)?[[:space:]]*:?=' --include=*.go $EX --exclude=*_test.go .` |
| G3 | Every goroutine has a cancel path (`ctx.Done()`, `WaitGroup`, `errgroup`) | `goleak` in tests (`go vet`'s `lostcancel` only checks discarded cancel funcs, not goroutine leaks); `grep -rn 'go func(' --include=*.go $EX --exclude=*_test.go .` then check for a context in scope |
| G4 | `go test -race ./...` is part of CI; no `defer` inside a loop | gocritic `deferInLoop` (not in the default set: `enabled-checks: [deferInLoop]`) |
| G5 | `ctx` is the first parameter; HTTP clients set a timeout; response bodies are closed | `noctx`, `bodyclose`; `InsecureSkipVerify` → gosec `G402` |
| G6 | `govulncheck ./...` and `staticcheck ./...` in CI | — |
| G7 | Interfaces are small and defined at the consumer; no mutable package-level vars | `gochecknoglobals` |
