# Bash-version divergence regression (T32.4)

Historical bug class: `[^...]`-style bracket idioms written inline (a bare
`"` or a backslash-escaped bracket member directly in `[[ =~ ]]`) behave
differently across bash versions. M001 was silently dead on macOS bash 3.2
(0 findings) while matching correctly on GNU bash 5.x; M004 was dead on
both engines identically (a different bug, same bracket-idiom family).
This fixture proves both now fire.

```mermaid
flowchart TD
  A[/sdlc] --> B[Done]
```

```mermaid
flowchart TD
  C[a | b] --> D[Done]
```
