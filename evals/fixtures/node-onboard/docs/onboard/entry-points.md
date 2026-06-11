# Entry Points

Fixture: `evals/fixtures/node-onboard`

Known entry points: 3

## `GET /birdhouses`
- Entry file: `server.js:6-13`
- Exposed by: `package.json:5-10` via `main: "server.js"` and `scripts.start: "node server.js"`
- Call chain: `http.createServer()` → request dispatch in `server.js` → `listBirdhouses()` in `registry.js:7-9`
- Behavior: returns the in-memory birdhouse list as JSON with status `200`

## `POST /sightings`
- Entry file: `server.js:16-25`
- Exposed by: `package.json:5-10` via `main: "server.js"` and `scripts.start: "node server.js"`
- Call chain: `http.createServer()` → request dispatch in `server.js` → `registerSighting()` in `registry.js:11-15`
- Behavior: parses the JSON request body, marks the matching birdhouse occupied, and returns the recorded sighting as JSON with status `201`

## `birdhouse audit`
- Entry file: `cli.js:1-15`
- Exposed by: `package.json:6-8` via `bin.birdhouse: "./cli.js"`
- Call chain: CLI argv parsing in `cli.js` → `listBirdhouses()` in `registry.js:7-9`
- Behavior: prints one tab-separated line per birdhouse; any command other than `audit` exits with usage text and status `1`

No other HTTP routes or CLI commands are defined in this fixture.
