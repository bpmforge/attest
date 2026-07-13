# Worked example: requirement reconciliation against a real project (T29.2)

T29.2's acceptance criterion asks for a reconciliation matrix "generated on a real project
(RepoPulse plan.json is the live fixture)" — this is that live run, not a synthetic fixture.
`~/Code/repopulse` is a separate, independently-owned product repo; nothing here was written into
it, and none of its files were modified to produce this.

**Schema caveat, disclosed up front:** RepoPulse's `plan.json` predates this ticket — it's a flat
`tickets[]` array (`id: "W0-01"`, a `module: "infra"` string tag, no `stories[]` linkage at all),
not the `ModuleTicket` `modules[]` shape `scripts/lib/tickets.mjs` validates. Running
`validate-requirement-closure.sh` against it as-is correctly reports "no module declares
`stories[]` — requirement layer not adopted, nothing to check" (an honest skip, not a false
pass). To still produce a genuine matrix from RepoPulse's real, unmodified data, this run derives
**epic-level** (not per-story) verdicts: every `## Epic EN — ... (module, module, ...)` heading in
`docs/USER_STORIES.md` already declares its module tags in parens, and RepoPulse's own tickets
carry a matching `.module` field — a real, data-driven linkage, just coarser than an explicit
`stories: []` array on each ticket would give. Every story under an epic inherits that epic's
rollup verdict; this is *not* what `validate-requirement-closure.sh` computes for a project that
has adopted `stories[]` (that gets true per-story precision) — it is what's possible today,
read-only, against a project that hasn't.

Source: `docs/USER_STORIES.md` (51 stories across 10 epics), `plan.json` (62 tickets, all
`status: "todo"` — RepoPulse is a scaffolded plan with no implementation work started yet, so
every story rolling up to `OUTSTANDING (epic-level)` is the *correct* answer, not a tool defect).

| Story | Epic | Title | Verdict | Evidence |
|-------|------|-------|---------|----------|
| E1.1 | E1 | Sign in with GitHub [MVP] — 3 pts — FR-AUTH-1, FR-AUTH-2, FR-AUTH-6 | OUTSTANDING (epic-level) | 0/11 tickets done in module(s) forge,ingest,auth; open: W1-03, W1-04, W1-05, W1-06, W1-07, W2-01, W2-02, W2-03, W2-04, W2-05, W7-02 |
| E1.2 | E1 | Connect an org [MVP] — 5 pts — FR-INGEST-1, FR-FORGE-5, FR-AUTH-4, FR-AUTH-5 | OUTSTANDING (epic-level) | 0/11 tickets done in module(s) forge,ingest,auth; open: W1-03, W1-04, W1-05, W1-06, W1-07, W2-01, W2-02, W2-03, W2-04, W2-05, W7-02 |
| E1.3 | E1 | Watch the 12-month backfill [MVP] — 8 pts — FR-INGEST-2/3/4/8, FR-FORGE-3/4, NFR-1, NFR-2 | OUTSTANDING (epic-level) | 0/11 tickets done in module(s) forge,ingest,auth; open: W1-03, W1-04, W1-05, W1-06, W1-07, W2-01, W2-02, W2-03, W2-04, W2-05, W7-02 |
| E1.4 | E1 | Stay current via webhooks [MVP] — 5 pts — FR-INGEST-5/6, NFR-10 | OUTSTANDING (epic-level) | 0/11 tickets done in module(s) forge,ingest,auth; open: W1-03, W1-04, W1-05, W1-06, W1-07, W2-01, W2-02, W2-03, W2-04, W2-05, W7-02 |
| E1.5 | E1 | Nightly self-repair [MVP] — 3 pts — FR-INGEST-7, FR-FORGE-4 | OUTSTANDING (epic-level) | 0/11 tickets done in module(s) forge,ingest,auth; open: W1-03, W1-04, W1-05, W1-06, W1-07, W2-01, W2-02, W2-03, W2-04, W2-05, W7-02 |
| E1.6 | E1 | Pause or remove a repo — 2 pts — FR-INGEST-9 | OUTSTANDING (epic-level) | 0/11 tickets done in module(s) forge,ingest,auth; open: W1-03, W1-04, W1-05, W1-06, W1-07, W2-01, W2-02, W2-03, W2-04, W2-05, W7-02 |
| E2.1 | E2 | PR cycle-time stages [MVP] — 5 pts — FR-METRICS-4, FR-METRICS-13/14 | OUTSTANDING (epic-level) | 0/10 tickets done in module(s) metrics; open: W3-01 … W3-10 |
| E2.2 | E2 | Review discipline [MVP] — 3 pts — FR-METRICS-5/6 | OUTSTANDING (epic-level) | 0/10 tickets done in module(s) metrics; open: W3-01 … W3-10 |
| E2.3 | E2 | Hotspots & churn [MVP] — 5 pts — FR-METRICS-1/2 | OUTSTANDING (epic-level) | 0/10 tickets done in module(s) metrics; open: W3-01 … W3-10 |
| E2.4 | E2 | Ownership / bus factor [MVP] — 3 pts — FR-METRICS-3 | OUTSTANDING (epic-level) | 0/10 tickets done in module(s) metrics; open: W3-01 … W3-10 |
| E2.5 | E2 | PR size + staleness [MVP] — 3 pts — FR-METRICS-7/8 | OUTSTANDING (epic-level) | 0/10 tickets done in module(s) metrics; open: W3-01 … W3-10 |
| E2.6 | E2 | CI health [MVP] — 3 pts — FR-METRICS-9 | OUTSTANDING (epic-level) | 0/10 tickets done in module(s) metrics; open: W3-01 … W3-10 |
| E2.7 | E2 | Throughput, releases, DORA [MVP] — 5 pts — FR-METRICS-10/11/12 | OUTSTANDING (epic-level) | 0/10 tickets done in module(s) metrics; open: W3-01 … W3-10 |
| E2.8 | E2 | Transparent definitions [MVP] — 2 pts — FR-METRICS-15 | OUTSTANDING (epic-level) | 0/10 tickets done in module(s) metrics; open: W3-01 … W3-10 |
| E3.1 | E3 | Org overview landing [MVP] — 5 pts — FR-WEB-1, FR-INSIGHTS-2/3/4, FR-API-1/2, NFR-3 | OUTSTANDING (epic-level) | 0/16 tickets done in module(s) web,api,insights; open: W3-11, W3-12, W4-01…W4-08, W5-01, W5-02, W6-03, W6-04, W7-04, W8-10 |
| E3.2 | E3 | Drill-down with breadcrumbs [MVP] — 8 pts — FR-WEB-2, FR-API-5 | OUTSTANDING (epic-level) | 0/16 tickets done in module(s) web,api,insights (same set as E3.1) |
| E3.3 | E3 | Sparklines + heatmap visualizations [MVP] — 5 pts — FR-WEB-3, NFR-5 | OUTSTANDING (epic-level) | 0/16 tickets done (same set as E3.1) |
| E3.4 | E3 | Command palette ⌘K [MVP] — 3 pts — FR-WEB-6 | OUTSTANDING (epic-level) | 0/16 tickets done (same set as E3.1) |
| E3.5 | E3 | My PRs / my review load [MVP] — 3 pts — FR-WEB-7, FR-AUTH-6 | OUTSTANDING (epic-level) | 0/16 tickets done (same set as E3.1) |
| E3.6 | E3 | Honest empty/sync states [MVP] — 2 pts — FR-WEB-8, FR-INGEST-8 | OUTSTANDING (epic-level) | 0/16 tickets done (same set as E3.1) |
| E4.1 | E4 | Save a custom view [MVP] — 5 pts — FR-WEB-4, FR-API-6 | OUTSTANDING (epic-level) | 0/14 tickets done in module(s) web,api; open: W3-12, W4-01…W4-08, W5-01, W5-02, W6-04, W7-04, W8-10 |
| E4.2 | E4 | Share a view link [MVP] — 3 pts — FR-WEB-5, FR-API-6 | OUTSTANDING (epic-level) | 0/14 tickets done (same set as E4.1) |
| E5.1 | E5 | Generate + browse reports [MVP] — 5 pts — FR-REPORTS-1/7 | OUTSTANDING (epic-level) | 0/4 tickets done in module(s) reports; open: W5-03, W5-04, W7-03, W8-11 |
| E5.2 | E5 | Repo Health report [MVP] — 3 pts — FR-REPORTS-2 | OUTSTANDING (epic-level) | 0/4 tickets done (same set as E5.1) |
| E5.3 | E5 | Org Exec Summary [MVP] — 3 pts — FR-REPORTS-3 | OUTSTANDING (epic-level) | 0/4 tickets done (same set as E5.1) |
| E5.4 | E5 | Delivery/DORA report [MVP] — 2 pts — FR-REPORTS-5 | OUTSTANDING (epic-level) | 0/4 tickets done (same set as E5.1) |
| E5.5 | E5 | PDF export [MVP] — 5 pts — FR-REPORTS-6 | OUTSTANDING (epic-level) | 0/4 tickets done (same set as E5.1) |
| E5.6 | E5 | Security Posture report — 3 pts — FR-REPORTS-4 | OUTSTANDING (epic-level) | 0/4 tickets done (same set as E5.1) |
| E6.1 | E6 | Auto-review PRs on the LAN — 8 pts — FR-ANALYSIS-1/2/3/8, NFR-8 | OUTSTANDING (epic-level) | 0/5 tickets done in module(s) analysis,insights; open: W3-11, W6-01, W6-02, W6-03, W7-01 |
| E6.2 | E6 | Dimension checklists — 5 pts — FR-ANALYSIS-4/5 | OUTSTANDING (epic-level) | 0/5 tickets done (same set as E6.1) |
| E6.3 | E6 | Dedup + finding lifecycle — 5 pts — FR-ANALYSIS-6, FR-INSIGHTS-1, FR-WEB-9 | OUTSTANDING (epic-level) | 0/5 tickets done (same set as E6.1) |
| E6.4 | E6 | Findings enrich scores + hotspots — 3 pts — FR-INSIGHTS-2/5 | OUTSTANDING (epic-level) | 0/5 tickets done (same set as E6.1) |
| E6.5 | E6 | Degrade gracefully — 3 pts — NFR-7 | OUTSTANDING (epic-level) | 0/5 tickets done (same set as E6.1) |
| E7.1 | E7 | Opt-in Claude deep review — 5 pts — FR-ANALYSIS-7, FR-ANALYSIS-1 | OUTSTANDING (epic-level) | 0/3 tickets done in module(s) analysis; open: W6-01, W6-02, W7-01 |
| E7.2 | E7 | Egress audit log — 3 pts — NFR-9 | OUTSTANDING (epic-level) | 0/3 tickets done (same set as E7.1) |
| E7.3 | E7 | Analysis scheduling controls — 3 pts — FR-ANALYSIS-8 | OUTSTANDING (epic-level) | 0/3 tickets done (same set as E7.1) |
| E8.1 | E8 | GiteaProvider — 8 pts — FR-FORGE-7, FR-FORGE-1 | OUTSTANDING (epic-level) | 0/3 tickets done in module(s) forge; open: W1-05, W1-06, W7-02 |
| E8.2 | E8 | Mixed-forge org views — 3 pts — FR-METRICS-14, FR-API-5 | OUTSTANDING (epic-level) | 0/3 tickets done (same set as E8.1) |
| E9.1 | E9 | Workspace roles [MVP] — 3 pts — FR-AUTH-3/4, NFR-4 | OUTSTANDING (epic-level) | 0/6 tickets done in module(s) auth,api,ops; open: W1-03, W1-04, W1-07, W3-12, W4-01, W5-01 |
| E9.2 | E9 | Credential hygiene [MVP] — 3 pts — FR-AUTH-5, NFR-6 | OUTSTANDING (epic-level) | 0/6 tickets done (same set as E9.1) |
| E9.3 | E9 | Ops visibility [MVP] — 3 pts — NFR-11, NFR-12 | OUTSTANDING (epic-level) | 0/6 tickets done (same set as E9.1) |
| E9.4 | E9 | Accessibility gate [MVP] — 3 pts — NFR-5 | OUTSTANDING (epic-level) | 0/6 tickets done (same set as E9.1) |
| E10.1 | E10 | Enable scanners per repo — 3 pts — FR-SEC-1, FR-SEC-11 | OUTSTANDING (epic-level) | 0/9 tickets done in module(s) security; open: W8-01…W8-09 |
| E10.2 | E10 | Secrets caught on every diff — 5 pts — FR-SEC-3, FR-SEC-9 | OUTSTANDING (epic-level) | 0/9 tickets done (same set as E10.1) |
| E10.3 | E10 | History secrets sweep — 3 pts — FR-SEC-4 | OUTSTANDING (epic-level) | 0/9 tickets done (same set as E10.1) |
| E10.4 | E10 | Dependency posture (SBOM/CVE/KEV/slopsquat) — 8 pts — FR-SEC-5, FR-SEC-9 | OUTSTANDING (epic-level) | 0/9 tickets done (same set as E10.1) |
| E10.5 | E10 | Semgrep SAST over snapshots — 8 pts — FR-SEC-6, FR-SEC-2, NFR-13/14 | OUTSTANDING (epic-level) | 0/9 tickets done (same set as E10.1) |
| E10.6 | E10 | OWASP checklist reviews — 5 pts — FR-SEC-7 | OUTSTANDING (epic-level) | 0/9 tickets done (same set as E10.1) |
| E10.7 | E10 | Attack chains — 5 pts — FR-SEC-8 | OUTSTANDING (epic-level) | 0/9 tickets done (same set as E10.1) |
| E10.8 | E10 | Security tab + org rollup — 5 pts — FR-SEC-10, FR-SEC-12 | OUTSTANDING (epic-level) | 0/9 tickets done (same set as E10.1) |
| E10.9 | E10 | Audit-ready security posture pack — 3 pts — FR-SEC-10, FR-REPORTS-4 | OUTSTANDING (epic-level) | 0/9 tickets done (same set as E10.1) |

## Summary

`{"OUTSTANDING (epic-level)": 51}` — 51/51 stories, matching `plan.json`'s real state (0 of 62
tickets done). `extractStoryIds()` (`scripts/lib/user-stories.mjs`) correctly parsed all 51 `### EN.N`
headings from RepoPulse's real, unmodified `USER_STORIES.md` using a different id scheme (`E1.1`)
than every other fixture in this repo uses (`US-01`) — proof the heading regex generalizes past the
one convention this program's own fixtures happen to use.

**What this does and doesn't prove:** it proves `extractStoryIds()` parses real-world
`USER_STORIES.md` content correctly, and that a reconciliation matrix genuinely renders end-to-end
against a live external project's data. It does *not* exercise `requirementClosure()`'s per-story
precision (that needs the `stories[]` field on real tickets, which RepoPulse doesn't have) — that
half is covered by `evals/fixtures/validators/validate-requirement-closure/` and
`scripts/test-requirement-closure.ts`'s unit coverage instead, both of which use the canonical
schema.
