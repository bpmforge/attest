[🏠 Index](README.md)  |  [← Security Findings](11-security.md)  |  [Improvement Recommendations →](13-recommendations.md)

---

# 12. Performance Findings

### CRITICAL

**P-C01: `await Promise.allSettled` in `tool.execute.after` blocks every write/edit for 800ms–3s**

`plugins/expert-hooks.ts:171-176` — The `tool.execute.after` hook is awaited by OpenCode (confirmed via `@opencode-ai/plugin` type signature). This means every write or edit CANNOT return to the LLM until ALL four checks complete:

- `formatFile` — prettier cold-start: ~300-600ms
- `lintFile` — eslint cold-start: ~300-800ms
- `typeCheckFile` — tsc cold-start: **800ms–3s**
- `secretScan` — cat subprocess + 8 regexes: ~30ms

Wall-clock cost per write = `max(tsc, eslint, prettier)` = **800ms–3s per write**. On a code-gen session with 50 file writes, this is 40–150 seconds of pure overhead. The comment "failures inform the LLM but never block the workflow" is wrong — latency blocks regardless.

Note: `tsc --noEmit --pretty false ${filePath}` (line 229) passes a single file to tsc but TypeScript still type-checks the full project (follows all imports), paying the full cold-start cost every time.

- **Fix:** Drop the `await` — make the hook fire-and-forget. Results reported via `console.warn` asynchronously. Alternatively add a debounce gate to only run on the last write in a burst.

**P-C02: No timeout on hook subprocess calls — a hung eslint/tsc hangs the write indefinitely**

`plugins/expert-hooks.ts:181-243` — `formatFile`, `lintFile`, `typeCheckFile`, and `secretScan` have zero timeout wrappers. If eslint hangs on a circular import or tsc deadlocks on a type error in a dependency, the write tool never returns a result.

- **Fix:** Wrap each check in `Promise.race([check, timeout(5000)])`.

### HIGH

**P-H01: `secretScan` spawns `cat` subprocess; no file-size guard; `.json`/`.map` not excluded**

`plugins/expert-hooks.ts:248` — `$\`cat ${filePath}\`` forks a subprocess for file reading (~20-50ms) vs `fs.readFile` (~0.1ms). No file-size guard: a 5MB `package-lock.json` or `.min.js` loads entirely into memory with 8 regexes applied. `.json` and `.map` files are not in `SKIP_EXTENSIONS`.

- **Fix:** Use `fs.readFile(filePath, 'utf8')`. Add `stat.size > 500_000` guard. Add `.json`, `.map`, `.snap` to SKIP_EXTENSIONS.

**P-H02: `validate-phase-gate.sh` runs each sub-validator twice**

`scripts/validators/validate-phase-gate.sh:178-193` — Each sub-validator executes twice: once to let stderr pass through, then again to capture JSON. For a phase-4 gate with 9 validators, this is 18 subprocess launches. Validators like `validate-code-health.sh` are expensive (multi-pass find+grep).

- **Fix:** Capture both stdout and stderr in a single run using a temp file.

**P-H03: `validate-code-health.sh` calls `find_source_files` 9 times**

`scripts/validators/validate-code-health.sh:76,97,120,133,156,166,177,197,216` — Full directory traversal called once per check (9 checks = 9 `find` processes over the same tree).

- **Fix:** Capture file list once: `SRCFILES=$(find_source_files)` and reuse via process substitution.

**P-H04: `validate-module-boundaries.sh` is O(N² × F) — grep per module pair per file**

`scripts/validators/validate-module-boundaries.sh:69-143` — Structure: for each module × for each file × for each other module → 1 grep subprocess. With 10 modules × 50 files × 10 = 5,000 grep calls.

- **Fix:** Pre-build alternation pattern and run one grep per source file against all other-module names simultaneously.

### MEDIUM

**P-M01: bash.ts / run.ts / task.ts accumulate unlimited output in memory**

`tools/bash.ts:34-41`, `tools/run.ts:34-41`, `tools/task.ts:78-79` — Output accumulated via `output += data.toString()` with no max-size limit. A command producing multi-GB output (e.g., `find / -name "*"`) will fill memory until timeout (60s). `task.ts` maintains three concurrent growable buffers.

- **Fix:** Add `MAX_OUTPUT_BYTES = 5 * 1024 * 1024` guard with truncation.

**P-M02: log-parser.ts calls `parseLogLine` twice per line; recompiles regex per line**

`tools/log-parser.ts:28,43,150` — Each line is parsed twice (filter pass + summary pass). The filter pattern regex is re-created via `new RegExp()` inside the filter callback on every line.

- **Fix:** Compile the regex once before the loop; parse each line once into a results array.

### LOW

**P-L01: Plugin startup is clean — all patterns compiled at module load time**

`plugins/expert-hooks.ts:24-117` — `DANGEROUS_BASH`, `BLOCKED_FILE_PATTERNS`, `SECRET_PATTERNS`, `SKIP_EXTENSIONS`, `WRITE_TOOLS` are all initialized once. Set lookup is O(1). No startup cost concern.

**P-L02: 36 validators each source `_lib.sh` separately**

Each validator sources `_lib.sh` at startup. Negligible for individual runs but adds up in CI chains.

---

---

[🏠 Index](README.md)  |  [← Security Findings](11-security.md)  |  [Improvement Recommendations →](13-recommendations.md)
