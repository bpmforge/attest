# Integration contract — till app ↔ tool-library service

The till app is already written and cannot change. Your service MUST export
exactly this interface from `src/library.mjs` (ESM). Everything behind it is
your design — storage, structure, validation, all of it.

All money is in **pence, as integers**. Never floats.
All dates are ISO `YYYY-MM-DD` strings. "Today" is always passed in explicitly
so the service is deterministic — never read the system clock.

```js
export function createLibrary(seed)
```

`seed` is `{ members, tools, loans, reservations, fees, stocktakeDate }`, each an
array (or string, for `stocktakeDate`) of the shapes below. It returns an object
exposing the methods below.

### Seed shapes

```js
member      = { id, name, tier: 'basic'|'patron', staff: boolean }
tool        = { id, name, status: 'available'|'maintenance', replacementValuePence }
loan        = { id, memberId, toolId, startDate, dueDate, returnedDate|null, renewed: boolean }
reservation = { id, memberId, toolId, createdDate }
fee         = { id, memberId, amountPence, paid: boolean }
```

### Methods

Every method returns either `{ ok: true, ...data }` or
`{ ok: false, reason: '<STABLE_CODE>', message: '<human sentence>' }`.

`reason` codes are part of the contract. `message` is free text for volunteers —
it must be a plain sentence, not a status code.

| Method | Signature | Returns on success |
|---|---|---|
| `borrow` | `(memberId, toolId, today)` | `{ ok:true, loanId, dueDate }` |
| `renew` | `(loanId, today)` | `{ ok:true, dueDate }` |
| `returnTool` | `(loanId, today)` | `{ ok:true, feePence }` |
| `reserve` | `(memberId, toolId, today)` | `{ ok:true, reservationId }` |
| `setMaintenance` | `(actorId, toolId, inMaintenance, today)` | `{ ok:true }` |
| `waiveFee` | `(actorId, feeId, today)` | `{ ok:true }` |
| `memberStatus` | `(memberId, today)` | `{ ok:true, heldCount, outstandingPence, canBorrow, renewalBlockedUntil\|null }` |

### Required `reason` codes

`AT_HOLD_LIMIT`, `TOOL_UNAVAILABLE`, `TOOL_IN_MAINTENANCE`, `FEES_OUTSTANDING`,
`ALREADY_RENEWED`, `RESERVED_BY_OTHER`, `RENEWAL_SUSPENDED`, `STOCKTAKE_CLOSED`,
`NOT_STAFF`, `NOT_FOUND`

### Non-negotiables

- `setMaintenance` and `waiveFee` MUST reject a non-staff `actorId` with
  `NOT_STAFF`. This is the trustees' hard requirement.
- Fee arithmetic is integer pence only. No floating point anywhere in a money path.
- Deterministic: same inputs and same `today` always give the same result.
