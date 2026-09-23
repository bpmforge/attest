# attest documentation

## Start here

| Doc | What it's for |
|-----|---------------|
| [SETUP.md](SETUP.md) | Install, prerequisites, embedding models, env vars, troubleshooting |
| [USERGUIDE.md](USERGUIDE.md) | How to invoke each expert, with typical workflows |
| [flows/](flows/README.md) | **Process-flow diagrams**: routing, new project, onboarding, feature/improve, security, code health and perf, the conductor, HANDOFF and gate protocols |

## Guides

| Doc | What it's for |
|-----|---------------|
| [SDLC_GUIDE.md](SDLC_GUIDE.md) | The four `/sdlc` modes, phases, git branching model, gates |
| [EXPERT_GUIDE.md](EXPERT_GUIDE.md) | How each slash-command expert thinks and what it produces |
| [AGENT_REFERENCE.md](AGENT_REFERENCE.md) | One paragraph per agent, every agent |
| [UNATTENDED_EXECUTION.md](UNATTENDED_EXECUTION.md) | Running Phase 4 unattended with the conductor |
| [LOCAL_LLM_GUIDE.md](LOCAL_LLM_GUIDE.md) | Running on local models: tiers, compact variants |
| [MCP_GUIDE.md](MCP_GUIDE.md) | Configuring the MCP servers the experts use |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Adding agents or skills; the single-source build for attest-claude |

## Reference

| Doc | What it's for |
|-----|---------------|
| [FEATURES.md](FEATURES.md) | Full catalog of agents, skills, validators, shared protocols, scripts (checked by `validate-doc-catalog.sh`) |
| [TICKET_SCHEMA.md](TICKET_SCHEMA.md) | The `plan.json` module-contract ticket schema |
| [TRACKER_DATA_MODEL_SCHEMA.md](TRACKER_DATA_MODEL_SCHEMA.md) | External tracker data model |
| [DESIGN_JIRA_ADAPTER.md](DESIGN_JIRA_ADAPTER.md) | Jira mirroring design |
| [DESIGN_FIGMA_ADAPTER.md](DESIGN_FIGMA_ADAPTER.md) | Figma token-sync design |
| [RELEASE_TRACKER.md](RELEASE_TRACKER.md) | Release history and what's in flight |
| [PROOF_LEDGER.md](PROOF_LEDGER.md) | Each guardrail, its red fixture, and when it was last proven to fire |

## Research and design notes

| Doc | What it's for |
|-----|---------------|
| [bridging-the-frontier-gap/](bridging-the-frontier-gap/README.md) | Making cheaper and local models operate closer to frontier (book) |
| [LOOP_ENGINEERING_PLAYBOOK.md](LOOP_ENGINEERING_PLAYBOOK.md) | Loop-engineering discipline applied to the HANDOFF pattern |
| [CODE_MICRO_LOOP_AND_ANTI_DRIFT.md](CODE_MICRO_LOOP_AND_ANTI_DRIFT.md) | Code micro-loop and anti-drift design |
| [AUTONOMY_AND_LOOP_UPGRADE_PLAN.md](AUTONOMY_AND_LOOP_UPGRADE_PLAN.md) | Autonomy upgrade plan (O0–O3 shipped; O3 live measurements pending) |
| [O3_PROVE_RUNBOOK.md](O3_PROVE_RUNBOOK.md) | Runbook for the O3 measurement pass |
| [BENCH_LOCAL_MODEL_COMPARISON.md](BENCH_LOCAL_MODEL_COMPARISON.md) | Local model head-to-head: design and results |

## Archive

[archive/](archive/README.md) holds finished plans, dated reviews and superseded snapshots. They're kept for history and aren't maintained.

## Not documentation

- `docs/work/` holds this repo's own run output: benchmarks, eval results, lessons, approvals. Scripts write to it; most of it is gitignored.
- `docs/security/` and `docs/reviews/` are gitignored scratch output from running the experts on this repo.
