[🏠 Index](README.md)  |  [← Improvement Recommendations](13-recommendations.md)

---

# Appendix A: Agent File Sizes

| Agent | Lines | Notes |
|-------|-------|-------|
| sdlc-init-phases-3-4.md | 1,661 | Largest — consider splitting |
| sdlc-improve-mode.md | 1,020 | Complex Mode 4 workflow |
| sdlc-onboard-mode.md | 1,087 | Deep onboard with Ralph Wiggum loop |
| sdlc-init-phase-3.md | 870 | Design phase detail |
| sdlc-lead.md | 681 | Orchestrator spine |
| git-expert.md | 488 | Full git lifecycle |
| db-architect.md | 482 | Schema + migration workflows |
| api-designer.md | 477 | REST/GraphQL contracts |
| researcher.md | 547 | Multi-phase research protocol |
| test-engineer.md | 774 | Test strategy + Playwright |
| sre-engineer.md | 541 | CI/CD + ops runbooks |
| container-ops.md | 470 | Docker/Podman workflows |
| sdlc-init-phase-4.md | 809 | Implementation wave protocol |
| sdlc-feature-mode.md | 578 | Feature addition workflow |
| coding-agent.md | 314 | Doc-driven implementation |
| architecture-designer.md | 347 | Module + infra design |
| security-auditor.md | 385 | 5-phase security audit |
| frontend-design.md | 372 | Visual implementation |
| ux-engineer.md | 352 | UX + WCAG workflows |
| code-reviewer.md | 215 | Code health audit |
| performance-engineer.md | 237 | Profiling + benchmarks |

## Appendix B: Validator Catalog

| Validator | Phase | What it checks |
|-----------|-------|---------------|
| validate-phase-gate.sh | All | Chains all validators for a phase |
| run-handoff-gates.sh | Handoff | Scope + manifest + coverage |
| run-coverage-loop.sh | All | Iterative coverage enforcement |
| validate-adrs.sh | 3 | Architecture Decision Records |
| validate-api-coverage.sh | 3 | All endpoints in openapi.yaml |
| validate-architecture.sh | 3 | 6 diagram types in ARCHITECTURE.md |
| validate-build.sh | 4 | Build succeeds |
| validate-c3-coverage.sh | 3 | C4 C3 component diagrams |
| validate-code-health.sh | 4 | lint + complexity checks |
| validate-completion-manifest.sh | Handoff | Manifest has all 6 required sections |
| validate-deps.sh | 4 | No pinned-major-version drift |
| validate-design-system.sh | 3.5 | Design tokens, component library |
| validate-e2e-setup.sh | 3.5 | Playwright infrastructure |
| validate-entry-points.sh | 3 | All entry points documented |
| validate-erd-coverage.sh | 3 | All tables in ERD |
| validate-fix-backlog-closed.sh | 5 | No open CRITICAL/HIGH in backlog |
| validate-iac.sh | 3 | Infrastructure as Code artifacts |
| validate-infrastructure.sh | 3 | INFRASTRUCTURE.md topology |
| validate-inventory.sh | Onboard | Full component inventory |
| validate-lint.sh | 4 | Linter passes at zero warnings |
| validate-migrations.sh | 4 | All schema changes in migrations |
| validate-module-boundaries.sh | 3 | No cross-boundary imports |
| validate-module-design.sh | 3 | MODULE_DESIGN.md completeness |
| validate-no-ascii-art.sh | All | No Unicode box-drawing characters |
| validate-owasp.sh | Security | All OWASP Top 10 categories addressed |
| validate-phase-gate.sh | All | Master gate orchestrator |
| validate-release-readiness.sh | 5 | All Phase 5 criteria met |
| validate-requirements-matrix.sh | 2 | Requirements traceability |
| validate-scope.sh | Handoff | Git writes within WRITE-SCOPE |
| validate-security-controls.sh | 3 | SECURITY_CONTROLS.md completeness |
| validate-sequence-coverage.sh | 3 | Sequence diagrams for all flows |
| validate-smoke.sh | 5 | Runtime smoke test passes |
| validate-tech-stack.sh | 3 | TECH_STACK.md present + valid |
| validate-test-design.sh | 3.5 | TEST_DESIGN.md covers P0 use cases |
| validate-tests-mapping.sh | 4 | Tests trace to user stories |
| validate-tests.sh | 4 | Full test suite passes |
| validate-use-cases.sh | 2 | Use cases complete + traceable |
| validate-user-stories.sh | 2 | User stories have acceptance criteria |
| validate-ux-spec.sh | 3 | UX spec completeness |

---

[🏠 Index](README.md)  |  [← Improvement Recommendations](13-recommendations.md)
