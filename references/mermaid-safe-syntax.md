# Mermaid Safe-Syntax Rules

Read this before generating any Mermaid diagram. These are the rules that
prevent the parse errors LLM generation reliably introduces. Validated by
`scripts/validators/validate-mermaid.sh`; mechanical issues auto-repairable
with `node scripts/mermaid-fix.mjs <file> --write`.

## The seven rules

1. **Quote any node label that contains a special character.** If a label has
   `(` `)` `/` `:` `|` `,` `#` `{` `}` or punctuation, wrap the whole label in
   double quotes:
   - ✗ `B[Process (async)]`  ✗ `C[GET /api/users]`  ✗ `D[Step: validate]`
   - ✓ `B["Process (async)"]`  ✓ `C["GET /api/users"]`  ✓ `D["Step: validate"]`
   When unsure, quote it — quoting a simple label never hurts.

2. **ASCII only inside diagrams.** No smart quotes (`“ ” ‘ ’`), no em/en-dashes
   (`— –`), no Unicode arrows (`→ ⇒`), no non-breaking spaces. Use `"` `'` `-`
   `-->`. LLM "prettification" is the #1 cause of broken diagrams.

3. **Never use `end` (lowercase) as a node id** in flowchart/graph — it closes
   `subgraph`/loop blocks and breaks parsing. Use `End`, `Done`, or `endNode`.

4. **No Markdown inside labels.** `[**Bold**]` and `` [`code`] `` render
   literally or break. Put the plain text only; use quotes if it has specials.

5. **Comments are `%%`, not `//`.** `//` is not a Mermaid comment.

6. **Balance your brackets.** Every `[` needs a `]`, every `(` a `)`, every `{`
   a `}`. Multi-line labels use `<br/>` (self-closed), never a raw newline.

7. **Match arrow syntax to the diagram type.** `flowchart`/`graph`: `-->`,
   `---`, `-.->`. `sequenceDiagram`: `->>`, `-->>`, `-)`. Don't mix.

## Diagram-type quick reference

| Type | Header | Edge | Label gotcha |
|---|---|---|---|
| Flowchart | `flowchart TD` / `graph LR` | `A --> B` | quote labels with specials; no `end` id |
| Sequence | `sequenceDiagram` | `A->>B: msg` | no `;` in `Note over`; `,` separates participants |
| ER | `erDiagram` | `A ||--o{ B : has` | attribute types are bare words, relationship cardinality exact |
| State | `stateDiagram-v2` | `A --> B` | `[*]` is start/end; quote composite-state labels |
| Class | `classDiagram` | `A <|-- B` | generics use `~T~` not `<T>`; method parens are fine |

## Self-check before emitting

After writing a diagram, before marking the deliverable done:

```
node scripts/mermaid-fix.mjs <file> --write          # auto-repair mechanical issues
bash scripts/validators/validate-mermaid.sh . <dir>  # gate (uses mmdc to truly render if installed)
```

If `@mermaid-js/mermaid-cli` (`mmdc`) is installed, the validator renders every
block headlessly and catches *any* parse error, not just the static patterns —
install it (`npm i -g @mermaid-js/mermaid-cli`) for authoritative validation on
diagram-heavy work.
