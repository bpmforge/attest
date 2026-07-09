# Threat Model

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Internet ↔ API | Public internet to the application's API surface |

## Threats

| ID | STRIDE | Component | Severity | Description |
|----|--------|-----------|----------|--------------|
| T-01 | Elevation of Privilege | Auth Service | HIGH | An attacker with a low-privilege account could attempt to self-grant the admin role via a crafted request. |

## Standing Threat Archetypes

- **bootstrap-authority:** assessed — see SECURITY_CONTROLS.md § Bootstrap & Empty-State. First admin is created automatically by the signup flow when zero users exist; no manual SQL.
- **self-referential-permission-gate:** assessed — the admin-grants-admin rule is broken by the same zero-user bootstrap exception; see SECURITY_CONTROLS.md.
- **rbac-highest-role-wins:** assessed — enforcement computes the union of grants across all roles a user holds; see SECURITY_CONTROLS.md.

## Mitigations

| Threat ID | Mitigation |
|-----------|------------|
| T-01 | Role-grant endpoint requires the caller to already hold the admin role, except during the zero-user bootstrap window (see SECURITY_CONTROLS.md). |
