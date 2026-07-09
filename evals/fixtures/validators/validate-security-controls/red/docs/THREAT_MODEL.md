# Threat Model

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Internet ↔ API | Public internet to the application's API surface |

## Threats

| ID | STRIDE | Component | Severity | Description |
|----|--------|-----------|----------|--------------|
| T-01 | Elevation of Privilege | Auth Service | HIGH | An attacker with a low-privilege account could attempt to self-grant the admin role via a crafted request. |

## Mitigations

| Threat ID | Mitigation |
|-----------|------------|
| T-01 | Role-grant endpoint requires the caller to already hold the admin role (see SECURITY_CONTROLS.md). |
