# Load-Test Checklist

Reference used by the `reliability-engineer` agent in every invocation. Read this file at the start of every run — test types, tool selection, NFR→threshold recipe, resilience-pattern catalog, chaos starters, and the failures that ship when this checklist is skipped.

**Not in scope here:** making the hot path faster (→ `performance-engineer`), deploy pipelines and monitoring (→ `sre-engineer`). Reliability finds where it breaks; siblings make it fast and keep it running.

---

## Load-test types

| Type | Purpose | Duration | Target |
|---|---|---|---|
| Smoke | Does the script + system work at all | 1-5 min | 1-5 VUs — minimal load |
| Load | Behavior at expected traffic | 15-60 min | NFR target (req/s or users from SRS.md) |
| Stress | Find the actual breaking point + failure signature | 30-60 min, stepped ramps | target × 2-3, ramp until it breaks |
| Soak | Leaks, drift, exhaustion over time | 2-24 h | 80% of target, held flat |
| Spike | Sudden surge + recovery behavior | 10-20 min | 0 → target × 2 in seconds, then back |

Run smoke first, always — a 4-hour soak on a broken script is a wasted afternoon. Stress and soak are the two most-skipped and the two that find real outages.

## Tool chooser: k6 vs Locust vs vegeta

| Pick | When |
|---|---|
| **k6** | Default. JS scenarios, first-class thresholds (pass/fail in CI), ramping VUs/arrival rates, good protocol coverage. |
| **Locust** | Team is Python-native, or the user behavior is complex stateful flows (login → browse → checkout) easier to model as Python classes. Distributed mode for very high load. |
| **vegeta** | Constant-rate HTTP hammering of one or few endpoints from the CLI — no scripting, instant histograms. Smoke/stress on a single route, CI quick-checks. |

One tool per project — mixed tooling means non-comparable numbers.

## Thresholds from NFRs — recipe

1. Pull the numbers from SRS.md: P95 latency, error-rate ceiling, throughput target. No numbers → BLOCKED, send back for requirements.
2. Convert to tool-native thresholds so the test FAILS in CI, not in a human's judgment.
3. Drive load at the NFR target for `load`, × 2-3 for `stress`.

Example — NFR says "P95 < 400ms, error rate < 1%, 200 req/s sustained" → k6:

```javascript
export const options = {
  scenarios: {
    sustained: {
      executor: 'constant-arrival-rate',
      rate: 200, timeUnit: '1s',          // NFR throughput target
      duration: '30m',
      preAllocatedVUs: 100, maxVUs: 400,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<400'],     // NFR P95
    http_req_failed: ['rate<0.01'],       // NFR error ceiling
  },
};
```

Thresholds are the NFR, restated executably — if you can't write the block, the NFR is not specific enough.

## Resilience-pattern catalog

Every external dependency in ARCHITECTURE.md gets a failure-mode row combining these: timeout + retry policy + breaker + fallback + user-visible behavior.

### 1. Timeout
- **When:** every network call, no exceptions — a dependency without a timeout is an outage waiting.
- **Example:** `connect: 2s, request: 5s` — each timeout sits BELOW the caller's own timeout, or you time out after your caller already gave up and retried.

### 2. Retry + backoff + jitter + budget
- **When:** transient failures on idempotent calls only — never retry non-idempotent writes without an idempotency key.
- **Example:** `max_attempts: 3, base: 200ms, factor: 2, jitter: full, budget: 10% of calls may be retries`.
- No jitter → synchronized retry waves; no budget → a 10s brownout becomes a self-inflicted DDoS.

### 3. Circuit breaker
- **When:** dependencies that fail in bulk — stop hammering a dying service so it can recover and you can fast-fail.
- **States:** closed (normal) → open (fast-fail, no calls) → half-open (probes) → closed on success.
- **Example:** `open when: 50% errors over a 20-call window, stay open: 30s, half-open probes: 3`.

### 4. Bulkhead
- **When:** one dependency must not be able to drain the shared pool and take unrelated features with it.
- **Example:** per-dependency connection/thread pools — `payments: 20 conns, search: 10` — search dying cannot starve payments.

### 5. Load shedding
- **When:** saturated and the choice is "degrade for some" vs "fail for all" — protect the core.
- **Example:** reject lowest-priority traffic first with `429 + Retry-After` when `queue depth > N` or `p95 > 2× NFR`.

### 6. Graceful degradation
- **When:** the full feature is impossible but a partial answer is acceptable.
- **Example:** recommendation service down → serve cached/popular list with `degraded: true` flagged.
- The shed ORDER is designed in RESILIENCE.md before the incident — which features drop first, what the user sees per rung.

## Chaos scenario starters

Each one is a runnable script with an expected behavior — prose scenarios test nothing.

- **Dependency kill** — stop the DB/cache/API container for 30s during peak load. Expect: breaker opens, fallback serves, no request hangs past timeout, recovery on restore.
- **Latency injection** — add 2-5s delay on a dependency (toxiproxy/tc). Expect: timeouts fire, callers don't queue unboundedly, P95 of unaffected routes holds.
- **Disk full** — fill the data volume to 100%. Expect: writes fail loudly, reads keep serving, alert fires, no silent corruption.
- **Clock skew** — shift one node ±5 min. Expect: token/TTL/cert validation behavior is known, not discovered.
- **Connection-pool exhaustion** — hold all pool connections open. Expect: fast-fail with clear error at pool cap, bulkheads keep other dependencies alive.

## Common failures (the ways load testing goes wrong)

- **Testing only happy paths** — peak load with every dependency healthy is the one condition production never grants you. Combine load + chaos.
- **No soak test, so leaks ship** — memory creep, connection leaks, and log-volume drift only appear after hours at load. 30-minute tests certify nothing about day 3.
- **Retry storms untested** — retries pass review, then a 10s dependency brownout triples traffic and finishes the job. Exercise a brownout under peak load with retries enabled.
- **Prod-sized data absent from the test env** — 1k-row tables make every query fast. Load numbers against toy data are fiction; seed to production scale first.
- **Passing at target and stopping** — target says nothing about headroom. The deliverable is the breaking point (X req/s vs target Y) and the failure signature at the limit.
