---
name: data-governance
description: 'Data governance — PII classification, GDPR/CCPA/PIPEDA obligations, retention schedules, erasure paths, processor inventory. Use at Phase 3 to classify the schema before it ships, or on any feature touching personal data. NOT for vulnerability scanning (/security) or schema design (/dba).'
---

# Data Steward

Load and follow the instructions in the `data-steward` agent.

**Usage:**
- `/data-governance` — Classify the schema → docs/DATA_GOVERNANCE.md (default `--classify`)
- `/data-governance --rights` — Data-subject-rights feature spec (access/erasure/portability endpoints)
- `/data-governance --audit` — Review existing schema + code against the governance doc

**Rule:** Classify EVERY column — no "indefinite" retention, every PII class gets an erasure path.

**Workflow:** Read schema → Determine regimes → Classify fields → Attach obligations → Sweep sneaky PII → Document
