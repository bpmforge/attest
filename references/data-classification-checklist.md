# Data Classification Quick-Reference Checklist

Use during `data-steward` runs. Classify every field; attach obligations per class.

## Classification levels

| Level | Definition | Examples | Default handling |
|---|---|---|---|
| public | Safe to publish | product names, public docs, published prices | No restriction |
| internal | Business data, no person attached | feature flags, job queues, aggregate metrics | Authn required |
| confidential | Business-sensitive, non-personal | API keys, contracts, pricing models, source code | Role-gated, encrypted at rest |
| PII | Identifies or relates to a person | email, name, phone, address, IP, device ID, user ID + behavior | Lawful basis + retention + erasure path + access list |
| special-category | GDPR Art. 9 / heightened classes | health, biometrics, race/ethnicity, religion, sexual orientation, union membership, precise geolocation, children's data | Explicit consent or narrow basis; column/application-level encryption; minimal access |

**Re-identification rule:** classify the JOIN, not the column. `zip + birthdate + gender` re-identifies ~87% of the US population. Pseudonymous IDs joined to behavior tables are PII.

## The "sneaky PII" list

Fields and stores that hold PII but rarely appear in the schema review:

- [ ] **IP addresses** — PII under GDPR (Breyer ruling); access logs, rate-limit tables, audit trails
- [ ] **Device / advertising IDs** — IDFA, GAID, browser fingerprints, push tokens
- [ ] **Free-text fields** — comments, support tickets, "notes" columns; users type other people's PII into them
- [ ] **Logs** — request logs with emails in URLs, stack traces with payloads, debug dumps
- [ ] **Analytics events** — user properties replicate the user table into a third-party processor
- [ ] **Backups & snapshots** — copies of every class above, often with longer lifetimes than the source
- [ ] **LLM prompts & completions** — user data sent to a model API is a processor transfer; prompt logs are a PII store
- [ ] **Email/notification queues** — rendered messages containing names, addresses, order details
- [ ] **Cache layers** — Redis/CDN entries holding rendered personal pages
- [ ] **Dev/staging copies of prod data** — same obligations, usually zero controls

## Per-regime quick table

| | GDPR (EU/EEA) | CCPA/CPRA (California) | PIPEDA (Canada) |
|---|---|---|---|
| Scope trigger | Offering goods/services to EU residents or monitoring them — no revenue floor | Business with CA consumers + revenue/volume thresholds ($25M+ rev, or 100k+ consumers, or 50%+ rev from selling data) | Commercial activity involving Canadians' personal info |
| Key rights | Access, rectification, erasure, portability, restriction, objection | Know, delete, correct, opt-out of sale/share, limit sensitive-PI use | Access, correction, withdrawal of consent |
| Breach clock | 72h to supervisory authority | "Expedient" notice to AG + consumers (no fixed hours) | "As soon as feasible" to OPC + individuals |
| Penalty scale | Up to €20M or 4% global revenue | $2,500–$7,500 per violation (per consumer per incident) | Up to CAD $100k per violation (CPPA reform pending — verify current) |

**When in doubt:** design to GDPR — it is the strictest superset; satisfying it satisfies most of the rest. Verify current penalty/clock facts via research tools; regimes change.

## Lawful-basis quick reference (GDPR Art. 6)

Every PII class names ONE primary basis — "we need it" is not a basis.

| Basis | Use when | Caution |
|---|---|---|
| Contract | Data required to deliver what the user signed up for | Scope-limited — marketing is NOT contract |
| Legal obligation | Tax records, KYC, statutory retention | Document the statute |
| Legitimate interest | Fraud prevention, security logs, basic analytics | Requires a balancing test; user can object |
| Consent | Marketing, optional features, cookies/tracking | Must be granular, withdrawable, logged with timestamp |
| Vital interest / public task | Rare outside health/government | Almost never applies to a SaaS |

Special-category data needs an Art. 9 condition ON TOP of an Art. 6 basis — usually explicit consent.

## Access-control mapping per class

For each class, name WHO reads it — roles and services, not "the team."

| Class | Access pattern |
|---|---|
| public | Anyone |
| internal | Any authenticated staff/service |
| confidential | Named roles; secrets via vault, never env-file in repo |
| PII | Role + purpose (support reads email for tickets; analytics gets pseudonymized IDs only) |
| special-category | Named individuals/services, audited reads, break-glass procedure |

Service accounts count: a batch job that reads the users table is on the access list.

## Retention-schedule patterns

Every retention period has a TRIGGER + DURATION — never "indefinite."

| Pattern | Example | Use when |
|---|---|---|
| Event + grace | "account deletion + 30d" | User-controlled data |
| Purpose-bound | "until order fulfilled + statutory warranty period" | Transactional data |
| Statutory floor | "7y from transaction (tax law)" | Financial/audit records — statute OVERRIDES erasure requests; document the law |
| Rolling window | "90d rolling" | Logs, analytics events, rate-limit counters |
| Consent-bound | "until consent withdrawn" | Marketing data |

Backups inherit the schedule: backup retention ≤ source retention + backup cycle, or erasure must propagate.

## Erasure-design patterns

| Pattern | What it does | Trade-off |
|---|---|---|
| Hard delete | `DELETE` the rows | Clean, but breaks FKs and loses aggregate history |
| Anonymize | Null/scramble PII columns, keep the row | Preserves referential integrity + analytics; must cover ALL PII columns including free text |
| Crypto-shredding | Per-user encryption key; erasure = destroy the key | Handles backups elegantly; key management complexity |
| Tombstone | Replace user row with a sentinel ("deleted user") | FK targets survive; sentinel must carry zero PII |

**FK strategies:** `ON DELETE CASCADE` for owned data (sessions, preferences); `ON DELETE SET NULL` or tombstone for shared artifacts (comments, orders); anonymize-in-place where business records must survive. Decide per table at design time — an erasure path that throws an FK violation does not exist.

## Processor inventory template

| Processor | Purpose | Data sent | PII classes | DPA status | Region |
|---|---|---|---|---|---|
| e.g. Stripe | Payments | name, email, card token | PII | Signed (standard) | US (SCCs) |
| e.g. OpenAI/Anthropic API | LLM features | prompt content | PII if prompts carry user data | Verify | US |
| e.g. Sentry | Error tracking | stack traces, IPs | PII (IP, payload leakage) | Signed | EU/US |

Every external API that receives user data is a processor — analytics, email, error tracking, LLM APIs, CDNs with logs.

## Common failures

- **PII in logs** — emails in request URLs, payloads in error traces; retention "forever" by default
- **Analytics replicating the user table** — `identify()` calls shipping name/email/plan to a third party with no DPA
- **Backups outliving retention** — 1y backup cycle on data with a 30d erasure promise
- **Dev databases cloned from prod** — full PII set, no encryption, no access list, shared credentials
- **Erasure that breaks FKs** — delete endpoint shipped, throws 500 on the first user with orders
- **"Indefinite" retention** — any field without a trigger + duration is a gap
- **Soft-delete masquerading as erasure** — `deleted_at` set, PII still queryable; that is not erasure
