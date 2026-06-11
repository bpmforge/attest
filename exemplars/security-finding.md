# Exemplar: Security Finding

> Copy the STRUCTURE, not the content. Domain here is a fictional community
> tool-lending library. Format per `agents/security/FINDING_SCHEMA.md`: every
> field present; `preconditions`/`yields` use the shared attack-chain
> vocabulary so the attack-chainer can link findings; evidence is a real
> file:line citation, never "the auth code".

```json
{
  "id": "OWASP-004",
  "severity": "HIGH",
  "category": "owasp-web",
  "title": "IDOR on GET /members/:id/loans — any member can read another member's loan history",
  "file": "src/routes/members.router.ts:62",
  "tool": "manual",
  "preconditions": [
    "authenticated as low-privilege user",
    "can send HTTP requests to /members/:id/loans"
  ],
  "yields": [
    "read access to other users' records",
    "member email addresses via embedded member object"
  ],
  "asset": "loans table, members.email",
  "evidence": "members.router.ts:62 reads req.params.id and passes it to LoanService.history() with no comparison against req.session.memberId; verified by requesting another member's id with a fresh session (200, full history returned)",
  "status": "REAL",
  "remediation": "Compare req.params.id to req.session.memberId (or require staff role) before calling LoanService.history()."
}
```

**Why this is a good finding, structurally:**
- `title` = verb + component + impact in one line.
- `evidence` says how it was *confirmed*, not just where it was suspected — `status: REAL` requires that.
- `preconditions`/`yields` use chainable vocabulary: another finding yielding `"authenticated as low-privilege user"` (e.g. weak signup verification) chains into this one.
- `remediation` is one concrete line at the cited location, not "improve authorization".
