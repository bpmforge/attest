# UX Spec

## Component Inventory
| Component | Purpose |
|---|---|
| Table | data grid |
| DetailCard | detail |
| Button | button |
| Input | text input |

### Data Display
- Table, DetailCard

## State Matrix
| Component | Loading | Loaded | Error | Empty |
|---|---|---|---|---|
| Table | shimmer skeleton rows | data rendered in rows | inline error banner with retry | "No results" empty-state illustration |
| DetailCard | skeleton card | populated fields | error card with retry | "Nothing here yet" placeholder |
