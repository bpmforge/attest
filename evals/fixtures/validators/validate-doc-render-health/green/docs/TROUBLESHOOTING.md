# Troubleshooting

A well-formed table, a prose paragraph mentioning a single `|` character,
a code block containing shell pipes, and a second well-formed table using
unusual (but valid) separator-row whitespace and alignment colons.

| Problem | Fix |
|---------|-----|
| Build fails | Run `npm install` |
| Tests hang | Increase the timeout |

Use `cmd | grep foo` to filter output — that's prose, not a table row.

```
cat file.txt | sort | uniq
```

| Left | Right |
|  :-  |  -:   |
| a    | b     |
