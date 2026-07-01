# Eval comparison — gap / cost (agent checks only)

Pass-rate is over **decided agent checks** (PASS/FAIL); `⧗` = incomplete (TIMEOUT/ERROR), excluded from the rate.

| Scope | frontier | local-bare | local | lift | gap |
|---|---|---|---|---|---|
| overall | 100% (1/1) | 100% (1/1) | 100% (1/1) | 0% | 0% |
| horizon: long | 100% (1/1) | 100% (1/1) | 100% (1/1) | 0% | 0% |

## Cost per cell (agent wall-time + est. output tokens)

| Label | duration | tokens out |
|---|---|---|
| frontier | 67s | 137 |
| local-bare | 62s | 119 |
| local | 58s | 256 |

> Cost includes any time spent on TIMEOUT checks (the full budget). If a cell shows `⧗`, its cost is inflated by abandoned work — read it next to the incomplete count, not on its own.

## Fixture health (deterministic checks — model-independent)

| Label | planted defects found |
|---|---|
| frontier | 1/1 |
| local-bare | 1/1 |
| local | 1/1 |

> **gap** = frontier − local-scaffolded over decided agent checks (what is left to frontier). **lift** = local-scaffolded − bare (what the scaffold buys; needs a `--bare` cell). A `⧗` next to a cell means that scope is under-measured — get a clean result before trusting its gap. See book ch. 06.
