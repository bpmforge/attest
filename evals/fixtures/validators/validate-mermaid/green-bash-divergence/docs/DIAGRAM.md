# Bash-version divergence — clean neighbors (T32.4)

Adjacent-but-safe cases that must NOT be flagged by the M001/M004 fix:
quoted labels, `<br/>` HTML, and the intentional no-space db-shape pipe.

```mermaid
flowchart TD
  A["/sdlc"] --> B["line1<br/>line2"]
  C[a|b] --> D["ok"]
```
