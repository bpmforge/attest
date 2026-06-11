# Exemplar: Sequence Diagram (entry point with error path)

> Copy the STRUCTURE, not the content. Domain here is a fictional community
> tool-lending library. Format notes: one diagram per entry point; participants
> are real components (route, middleware, service, store), not abstractions;
> the happy path AND at least one error path appear in the same diagram via
> `alt`; every arrow names the actual function or query, not "processes data".

## POST /loans — check out a tool

```mermaid
sequenceDiagram
    participant C as Client
    participant R as "loans.router (POST /loans)"
    participant A as "authMiddleware"
    participant S as "LoanService.checkout"
    participant D as "Postgres (loans, tools)"

    C->>R: "POST /loans {toolId, days}"
    R->>A: "verify session cookie"
    alt no valid session
        A-->>C: "401 {error: AUTH_REQUIRED}"
    else session ok
        A->>S: "checkout(memberId, toolId, days)"
        S->>D: "SELECT ... FROM loans WHERE tool_id = $1 AND returned_at IS NULL"
        alt tool already out
            S-->>R: "ConflictError(TOOL_UNAVAILABLE)"
            R-->>C: "409 {error: TOOL_UNAVAILABLE}"
        else tool free
            S->>D: "INSERT INTO loans (member_id, tool_id, due_at) VALUES ..."
            D-->>S: "loan row"
            S-->>R: "loan"
            R-->>C: "201 {loan}"
        end
    end
```

**Error paths covered:** unauthenticated (401), tool already on loan (409).
**Not shown, handled upstream:** body validation (zod schema at router, 400) — noted here so the reader knows it exists without a third branch.
**Side effects:** none beyond the INSERT; no events emitted.
