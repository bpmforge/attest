# REST API Design Checklist

Reference for API design reviews and new endpoint creation.

## HTTP Method Semantics

| Method | Purpose | Idempotent | Request Body | Response |
|--------|---------|------------|-------------|----------|
| GET | Read resource(s) | Yes | No | 200 + resource |
| POST | Create resource | No | Yes | 201 + resource + Location header |
| PUT | Replace resource | Yes | Yes | 200 + resource |
| PATCH | Partial update | No | Yes | 200 + resource |
| DELETE | Remove resource | Yes | No | 204 (no body) |

## Status Code Catalog

### Success (2xx)
- **200 OK** — Standard success (GET, PUT, PATCH)
- **201 Created** — Resource created (POST), include Location header
- **204 No Content** — Success with no body (DELETE)

### Client Error (4xx)
- **400 Bad Request** — Malformed request syntax, invalid parameters
- **401 Unauthorized** — Missing or invalid authentication
- **403 Forbidden** — Authenticated but not authorized
- **404 Not Found** — Resource doesn't exist
- **409 Conflict** — State conflict (duplicate, version mismatch)
- **422 Unprocessable Entity** — Valid syntax but semantic errors (validation)
- **429 Too Many Requests** — Rate limit exceeded, include Retry-After header

### Server Error (5xx)
- **500 Internal Server Error** — Unexpected server failure
- **502 Bad Gateway** — Upstream service failed
- **503 Service Unavailable** — Server overloaded or maintenance

## Error Response Format (RFC 7807)

```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "Email address is already in use",
  "instance": "/api/v1/users",
  "errors": [
    { "field": "email", "message": "Already registered" }
  ]
}
```

## Pagination Patterns

### Cursor-Based (Recommended)
```
GET /api/v1/users?limit=20&cursor=eyJpZCI6MTAwfQ
→ { "data": [...], "next_cursor": "eyJpZCI6MTIwfQ", "has_more": true }
```
- Stable under inserts/deletes
- Efficient for large datasets
- Cannot jump to arbitrary page

### Offset-Based
```
GET /api/v1/users?limit=20&offset=40
→ { "data": [...], "total": 500, "limit": 20, "offset": 40 }
```
- Simple to implement
- Allows jumping to any page
- Unstable under concurrent modifications

## Filtering & Sorting

```
GET /api/v1/users?status=active&role=admin&sort=-created_at&fields=id,name,email
```

- Filter by field: `?status=active`
- Multiple values: `?status=active,pending`
- Sort: `?sort=name` (asc), `?sort=-name` (desc)
- Field selection: `?fields=id,name,email`

## Authentication Patterns

### Bearer Token (JWT)
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```
- Stateless, self-contained
- Include expiration, issuer, audience
- Validate algorithm, signature, expiration

### API Key
```
X-API-Key: sk_live_abc123
```
- Simple, good for server-to-server
- Always transmit over HTTPS
- Support key rotation

## Rate Limiting Headers

```
X-RateLimit-Limit: 100       # Max requests per window
X-RateLimit-Remaining: 42    # Remaining in current window
X-RateLimit-Reset: 1620000000 # Unix timestamp when window resets
Retry-After: 30              # Seconds to wait (on 429)
```

## Versioning

### URL Path (Recommended for major versions)
```
/api/v1/users
/api/v2/users
```

### Header (For minor versions)
```
Accept: application/vnd.api.v1+json
```

### Deprecation Policy
1. Announce deprecation with `Sunset` header and docs update
2. Minimum 6-month warning period
3. Provide migration guide
4. Remove old version only after migration window

## Resource Naming

- Use plural nouns: `/users`, `/orders`, `/products`
- Use kebab-case: `/order-items`, not `/orderItems`
- Nest for relationships: `/users/{id}/orders`
- Max 2 levels deep: `/users/{id}/orders` (not `/users/{id}/orders/{id}/items`)
- Use query params for filtering, not URL segments
