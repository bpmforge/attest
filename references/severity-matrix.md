# Severity & Priority Matrix

Shared decision framework for all expert agents. Use this to assess findings consistently.

## Severity Levels

| Severity | Criteria | Response Time |
|----------|----------|---------------|
| **CRITICAL** | Actively exploitable + data breach/financial loss + no workaround | Fix immediately |
| **HIGH** | Exploitable + significant impact + workaround exists | Fix this sprint |
| **MEDIUM** | Not immediately exploitable + should fix + can schedule | Next sprint |
| **LOW** | Best practice improvement + no immediate risk | Backlog |
| **INFO** | Observation + document for awareness | No action needed |

## Impact x Likelihood Grid

```
              LIKELIHOOD
              Low        Medium      High
IMPACT
High    |  MEDIUM    |  HIGH      |  CRITICAL  |
Medium  |  LOW       |  MEDIUM    |  HIGH      |
Low     |  INFO      |  LOW       |  MEDIUM    |
```

## How to Assess Impact

- **High Impact**: Data breach, financial loss, service outage, compliance violation
- **Medium Impact**: Degraded performance, limited data exposure, user inconvenience
- **Low Impact**: Cosmetic issue, minor inefficiency, documentation gap

## How to Assess Likelihood

- **High Likelihood**: Easy to exploit/trigger, no special access needed, common attack vector
- **Medium Likelihood**: Requires some knowledge/access, moderate complexity
- **Low Likelihood**: Requires privileged access, complex attack chain, theoretical

## Priority Assignment

After severity, assign priority for scheduling:

| Priority | When | Action |
|----------|------|--------|
| **P0** | Blocks users or causes data loss | Drop everything, fix now |
| **P1** | Degrades quality or security | Fix this sprint |
| **P2** | Should improve but not urgent | Schedule in backlog |
| **P3** | Nice to have | Document, fix opportunistically |

## Domain-Specific Guidance

### Security Findings
- SQL injection with user input → CRITICAL (high impact + high likelihood)
- Missing rate limiting on login → HIGH (medium impact + high likelihood)
- Verbose error messages in production → MEDIUM (low impact + high likelihood)
- Missing CSP header on internal tool → LOW (low impact + low likelihood)

### Code Quality Findings
- God object with 2000 lines → HIGH (blocks maintainability)
- Inconsistent naming in one module → MEDIUM (confusing but functional)
- Missing docstring on internal helper → LOW (nice to have)
- Unused import → INFO (cleanup)

### Performance Findings
- O(n^2) on hot path with 10K+ items → CRITICAL (user-facing latency)
- Missing index on frequent query → HIGH (degrades over time)
- Unoptimized image assets → MEDIUM (affects load time)
- Console.log in production → LOW (minor overhead)

### API Design Findings
- Breaking change without version bump → CRITICAL (breaks clients)
- Missing pagination on unbounded list → HIGH (will fail at scale)
- Inconsistent error format → MEDIUM (confusing for developers)
- Missing example in docs → LOW (developer inconvenience)
