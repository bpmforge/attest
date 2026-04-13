---
name: explore
description: 'Codebase archaeology — trace a feature end-to-end before modifying it. Maps entry points, call chains, data flow, and every file that needs to change. Use before /sdlc feature or any time you need to understand how something works.'
---

# Explore — Codebase Archaeology

Trace a specific feature, function, or concept through the entire codebase.
Produces a file:line map of everything involved — so you know the blast radius
before you touch anything.

**Usage:**
- `/explore "user authentication"` — Trace the auth flow end-to-end
- `/explore src/api/payments.ts` — Trace everything this file touches
- `/explore "what happens when a user clicks Save"` — Trace a user action

## How to Explore

### Phase 1: Find entry points
```
▶ Phase 1: Finding entry points for [topic]...
```
- Grep for the feature name, function name, route path, or component name
- Identify ALL entry points: HTTP routes, UI event handlers, CLI commands, cron triggers
- List each with file:line

### Phase 2: Trace call chains
```
▶ Phase 2: Tracing call chains...
```
For EACH entry point (one at a time):
1. Read the handler/component file
2. Follow every function call outward: handler → service → repository → database
3. Record the chain as: `file:line → file:line → file:line`
4. Note what data transforms at each step

### Phase 3: Map data flow
```
▶ Phase 3: Mapping data flow...
```
- What data enters the system? (request body, form input, event payload)
- How does it transform? (validation, enrichment, normalization)
- Where is it stored? (which table, which column, which cache key)
- What reads it downstream? (other services, UI components, reports)

### Phase 4: Identify blast radius
```
▶ Phase 4: Identifying blast radius...
```
- Every file that would need to change if this feature is modified
- Every test that exercises this feature
- Every other feature that depends on the same data or service

### Phase 5: Produce the map
```
▶ Phase 5: Writing exploration report...
```

Write `docs/explore/EXPLORE_[topic].md`:

```markdown
# Exploration: [topic]

## Entry Points
- `src/api/auth.ts:45` — POST /api/auth/login (HTTP route)
- `src/components/LoginForm.tsx:12` — form submit handler (UI)

## Call Chains
### Chain 1: POST /api/auth/login
  src/api/auth.ts:45 (route handler)
  → src/services/auth-service.ts:23 (validateCredentials)
  → src/repositories/user-repo.ts:67 (findByEmail)
  → prisma.user.findUnique (DB query)
  → src/services/auth-service.ts:34 (generateToken)
  → src/utils/jwt.ts:12 (sign)

## Data Flow
  Input: { email, password } from request body
  → bcrypt.compare(password, user.passwordHash)
  → JWT signed with { userId, email, role }
  → Set-Cookie: session-token (httpOnly, secure, sameSite=lax)

## Blast Radius
Files that would change: 8
  - src/api/auth.ts (route handler)
  - src/services/auth-service.ts (business logic)
  - src/repositories/user-repo.ts (data access)
  - src/utils/jwt.ts (token generation)
  - src/middleware/auth-guard.ts (token verification)
  - src/components/LoginForm.tsx (UI)
  - src/stores/auth-store.ts (client state)
  - e2e/use-cases/02-login.spec.ts (test)

## Dependencies (other features using the same code)
  - Password reset (shares auth-service.ts)
  - Session refresh (shares jwt.ts)
  - Admin user management (shares user-repo.ts)
```

**Rules:**
- ONE call chain at a time — don't trace two before writing the first
- Include file:line references (not just file names)
- Flag circular dependencies if found
- Note untested paths (no corresponding test file)
- If Context7 MCP or documentation tools are available, verify any framework APIs you reference
