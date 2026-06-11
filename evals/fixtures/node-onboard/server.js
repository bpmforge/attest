// Birdhouse registry HTTP API — eval fixture.
// Known architecture: 2 HTTP entry points + 1 CLI entry point (cli.js).
const http = require("http");
const { listBirdhouses, registerSighting } = require("./registry");

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  // Entry point 1: GET /birdhouses
  if (req.method === "GET" && url.pathname === "/birdhouses") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(listBirdhouses()));
    return;
  }

  // Entry point 2: POST /sightings
  if (req.method === "POST" && url.pathname === "/sightings") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const sighting = registerSighting(JSON.parse(body));
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(sighting));
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(process.env.PORT || 3000);
