# node-onboard — eval fixture

Tiny birdhouse registry with a KNOWN architecture: exactly 3 entry points
(GET /birdhouses, POST /sightings, `birdhouse audit` CLI) over one in-memory
module. The eval suite asserts onboarding finds all 3.
Expected findings: `evals/expectations/node-onboard.json`.
