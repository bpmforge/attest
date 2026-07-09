# Exemplar: Architecture Decision Record (ADR)

> Copy the STRUCTURE, not the content. Domain here is a fictional community
> tool-lending library. Format notes: status + date always present; Context
> states the forces, not the solution; at least two real alternatives with
> the reason each lost; Consequences include the negative ones.

# ADR-003: Session cookies over JWT for member auth

**Status:** Accepted — 2026-06-11
**Deciders:** architecture-designer, security-auditor
**Supersedes:** none

## Context
The lending app is a single server-rendered web app, one Postgres instance, no
mobile client and none planned (SCOPE.md). Sessions must be revocable the
moment a member is suspended (SRS NFR-SEC-2). The team is two part-time
volunteers; operational simplicity outweighs horizontal-scale readiness
(CONSTRAINTS.md C-4).

## Decision
Server-side sessions in Postgres (`sessions` table, httpOnly secure cookie,
14-day idle expiry), via the framework's stock session middleware.

## Alternatives considered
- **JWT (stateless):** rejected — revocation requires a denylist, which
  reintroduces the DB lookup JWT exists to avoid; suspension latency (NFR-SEC-2)
  becomes token-lifetime-bounded.
- **Redis-backed sessions:** rejected — adds an infrastructure component to a
  one-database deployment for a load level (≤200 concurrent members) Postgres
  handles trivially. Revisit only if session reads show up in pg profiling.

## Deciding factors
- **Internal — rigorous:** revocation must complete within one request
  (NFR-SEC-2); a session-row delete satisfies this, a JWT denylist only
  approximates it and re-adds the DB lookup JWT was chosen to avoid.
- **Internal — soft:** both volunteers already know Postgres and the
  framework's stock session middleware — not a rigorous factor, but real:
  it lowers the chance of a security bug in hand-rolled token code.
- **External rationale (needs verification):** none for this decision — no
  outside compliance/vendor/supply-chain mandate was asserted. (When one IS
  asserted — e.g. "required for PCI-DSS" — tag it with this exact label and
  route it through the Challenger gate per `references/adr-template.md`
  before the ADR is final; do not assert it as settled fact.)

## Consequences
- (+) Instant revocation: suspend = delete session rows.
- (+) No token-refresh code path to test or get wrong.
- (−) Every authenticated request costs a session lookup — acceptable at this
  scale, measured at <1ms on the loans hot path.
- (−) Horizontal scaling later requires sticky sessions or moving the table —
  documented as the trigger condition for revisiting this ADR.
