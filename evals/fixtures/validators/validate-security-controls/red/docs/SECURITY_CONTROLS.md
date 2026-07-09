# Security Controls

## Threat Coverage

| Threat ID | Control |
|-----------|---------|
| T-01 | Role-grant endpoint requires the caller to already hold the admin role. |

## Role-Based Access Control

Users may hold multiple roles (many-to-many user↔role relationship, stored in
a `user_roles` junction table). Effective permissions are computed by
selecting the highest-priority role a user holds; permissions granted by any
other role the user also holds are ignored.

Only an admin may grant the admin role to another user.

## Bootstrap & Empty-State

- **First privileged user:** There is no defined process — the admin role can only be granted by an existing admin.
- **Zero-seed usable:** No, the application requires at least one admin account to exist before any workflow functions.
- **State-gated capabilities:** None — every privileged action requires the admin role, and nothing is gated on system state alone.
- **Zero-role user view:** A user with zero roles sees a generic 403 error page.
- **Bootstrap mechanism:** None — the system ships with zero admins and no mechanism to create the first one without direct database access.
