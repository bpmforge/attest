# Use Cases

| ID | Persona | Trigger | Main flow | Success criteria | Priority |
|----|---------|---------|-----------|-------------------|----------|
| UC-01 | Registered user | User clicks "Checkout" | Cart totals recomputed, payment form shown, order submitted | Order confirmation page renders with an order id | P0 |
| UC-02 | Guest visitor | User opens the homepage | Product grid loads from the catalog API | Grid renders within 2s with at least one product | P1 |

## UC-03 Password reset

Persona: Registered user

Trigger: User clicks "Forgot password"

Main flow: user submits email, reset link sent, user sets new password

Success criteria: user can log in with the new password

Priority: P1

Source: FR-12
