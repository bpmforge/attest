# ADR-001: PostgreSQL as datastore

**Status:** Accepted — 2026-07-09
**Deciders:** architecture-designer

## Context
Need a relational datastore with strong JSON support.

## Decision
Use PostgreSQL as the primary datastore.

## Alternatives considered
- **MySQL:** rejected — weaker native JSON support at the time of decision.

## Deciding factors
- **Internal — rigorous:** JSON column support benchmarked against MySQL 8's
  JSON type — Postgres's GIN-indexed jsonb outperformed on our query shape.

## Consequences
- (+) Mature ecosystem, one datastore for relational + JSON needs.
