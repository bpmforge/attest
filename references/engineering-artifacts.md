# Engineering Artifact Templates

Reference for all agents producing engineering documentation.

## Document Types and When to Produce Them

| Artifact | When Required | Who Produces |
|----------|--------------|-------------|
| SRS (Requirements) | New project Phase 2 | sdlc-lead |
| SAD (Architecture) | New project Phase 3, Onboarding | sdlc-lead + experts |
| C4 Diagrams | Every project | sdlc-lead |
| Sequence Diagrams | Critical user flows | sdlc-lead or any expert |
| ERD | Any project with database | db-architect |
| API Contract | Any project with API | api-designer |
| Threat Model | Phase 3 or security audit | security-auditor |
| Onboarding Guide | Onboard mode | sdlc-lead |
| ADRs | Every significant decision | whoever makes the decision |

## Architecture Decision Record (ADR) Format

```markdown
# ADR-NNN: [Decision Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNN

## Context
What is the issue or situation that motivated this decision?

## Decision
What is the change we are making?

## Consequences
What are the positive and negative outcomes of this decision?

## Alternatives Considered
| Option | Pros | Cons | Why Not |
|--------|------|------|---------|
| [Alternative A] | ... | ... | ... |
| [Alternative B] | ... | ... | ... |
```

## Mermaid Diagram Cheatsheet

### Sequence Diagram
```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant S as Service
    participant D as Database

    C->>A: HTTP Request
    A->>S: processRequest()
    S->>D: query()
    D-->>S: results
    S-->>A: response
    A-->>C: HTTP Response

    Note over A,S: Authentication happens here

    alt Success
        A-->>C: 200 OK
    else Error
        A-->>C: 400/500 Error
    end
```

### C2 Container Diagram
```mermaid
graph TB
    subgraph External
        User[fa:fa-user User]
        ExtAPI[External Service]
    end

    subgraph System [Our System]
        Web[Web App<br/>React]
        API[API Server<br/>Node.js]
        Worker[Background Worker]
        DB[(PostgreSQL)]
        Cache[(Redis)]
        Queue[Message Queue]
    end

    User --> Web
    Web --> API
    API --> DB
    API --> Cache
    API --> Queue
    Queue --> Worker
    Worker --> DB
    API --> ExtAPI
```

### C3 Component Diagram
```mermaid
graph TB
    subgraph API Server
        Router[Router/Middleware]
        AuthMod[Auth Module]
        UserMod[User Module]
        PayMod[Payment Module]

        Router --> AuthMod
        Router --> UserMod
        Router --> PayMod
        UserMod --> AuthMod
        PayMod --> AuthMod
    end

    subgraph Data
        DB[(Database)]
        Cache[(Cache)]
    end

    UserMod --> DB
    PayMod --> DB
    AuthMod --> Cache
```

### Entity-Relationship Diagram
```mermaid
erDiagram
    USERS ||--o{ ORDERS : places
    ORDERS ||--|{ ORDER_ITEMS : contains
    PRODUCTS ||--o{ ORDER_ITEMS : "included in"

    USERS {
        uuid id PK
        string email UK
        string name
        timestamp created_at
    }
    ORDERS {
        uuid id PK
        uuid user_id FK
        decimal total
        string status
        timestamp created_at
    }
```

### State Machine
```mermaid
stateDiagram-v2
    [*] --> Created
    Created --> Processing : submit
    Processing --> Completed : success
    Processing --> Failed : error
    Failed --> Processing : retry
    Completed --> [*]
    Failed --> Cancelled : cancel
    Cancelled --> [*]
```

### Deployment Diagram
```mermaid
graph TB
    subgraph Cloud
        LB[Load Balancer]
        subgraph App Tier
            App1[App Server 1]
            App2[App Server 2]
        end
        subgraph Data Tier
            DB[(Primary DB)]
            DBR[(Read Replica)]
            Cache[(Redis)]
        end
    end

    Internet --> LB
    LB --> App1
    LB --> App2
    App1 --> DB
    App2 --> DB
    App1 --> Cache
    DB --> DBR
```

## Modular Code Structure Template

### Feature-Sliced (Recommended)
```
src/
  auth/                    # Authentication domain
    auth.service.ts        # Business logic
    auth.repository.ts     # Data access
    auth.types.ts          # Interfaces and types
    auth.routes.ts         # HTTP handlers
    auth.test.ts           # Tests
    index.ts               # Public API (exports)

  payments/                # Payment domain
    payment.service.ts
    payment.repository.ts
    payment.types.ts
    payment.routes.ts
    payment.test.ts
    index.ts

  shared/                  # Cross-cutting concerns
    database.ts            # DB connection
    logger.ts              # Logging
    errors.ts              # Error types
    middleware.ts           # Auth, validation, rate limiting
```

### Module Interface Pattern
```typescript
// auth/auth.types.ts — THE CONTRACT
export interface AuthService {
  login(email: string, password: string): Promise<Result<Token>>
  register(input: RegisterInput): Promise<Result<User>>
  verify(token: string): Promise<Result<UserClaims>>
}

// auth/auth.service.ts — THE IMPLEMENTATION
export class AuthServiceImpl implements AuthService {
  constructor(
    private userRepo: UserRepository,  // injected
    private hasher: PasswordHasher,    // injected
    private jwt: JwtSigner,           // injected
  ) {}
  // ...
}

// auth/index.ts — THE PUBLIC API
export type { AuthService } from './auth.types.js'
export { AuthServiceImpl } from './auth.service.js'
```
