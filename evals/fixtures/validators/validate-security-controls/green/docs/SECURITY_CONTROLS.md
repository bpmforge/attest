# Security Controls

## Threat Coverage

| Threat ID | Control |
|-----------|---------|
| T-01 | Role-grant endpoint requires the caller to already hold the admin role, except during the zero-user bootstrap window described below. |

## Role-Based Access Control

Users may hold multiple roles (many-to-many user↔role relationship, stored in
a `user_roles` junction table). Effective permissions are the **union of
grants** across all roles a user holds — never a single "highest role wins"
selection, so a permission granted by any held role is always honored.

Only an admin may grant the admin role to another user, with one exception
during system bootstrap (see below).

## Bootstrap & Empty-State

- **First privileged user:** The signup endpoint checks whether zero users exist yet; if so, it automatically grants the admin role to the first registered user within the same database transaction.
- **Zero-seed usable:** Yes — the application is fully usable on an empty database; the first real workflow is account signup itself.
- **State-gated capabilities:** Only the automatic first-admin grant described above is gated purely on system state (zero users); every other admin action requires the admin role explicitly.
- **Zero-role user view:** A signed-in user with zero roles sees a "Request Access" screen listing the roles they can request, not an error page.
- **Bootstrap mechanism:** First-user-is-admin, implemented as an idempotent check in the signup service (safe to re-run on every request). See docs/DATABASE.md migration 0001. No manual SQL is required at any point.
