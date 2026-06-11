# ts-dead-dup — eval fixture

Tiny seedling-nursery tracker with PLANTED defects: a copy-paste duplicate pair
(report.ts), a never-imported module with an unimplemented stub (legacy.ts),
and an N+1 query loop (index.ts). Do not fix them — the eval suite asserts the
pipeline finds them. Expected findings: `evals/expectations/ts-dead-dup.json`.
