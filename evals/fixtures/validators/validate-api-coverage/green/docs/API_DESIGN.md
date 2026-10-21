# API Design

GREEN (JSON-Schema contract mode): no HTTP API, so no openapi.yaml. Every
tool in the catalog has a schema file and every schema parses.

## Tool catalog

| # | Tool | Purpose |
|---|------|---------|
| 1 | `get_feedback` | List feedback items |
| 2 | `ack-feedback` | Acknowledge items |
| 3 | `browser_click` | Click an element |

## Error codes

| Code | Meaning |
|------|---------|
| `NOT_FOUND` | Not a tool -- this table has no Tool column, so it is ignored |
