#!/usr/bin/env node
// Birdhouse registry CLI — eval fixture entry point 3.
// Usage: birdhouse audit   — prints occupancy report
const { listBirdhouses } = require("./registry");

const command = process.argv[2];

if (command === "audit") {
  for (const b of listBirdhouses()) {
    console.log(`${b.id}\t${b.location}\toccupied=${b.occupied}`);
  }
} else {
  console.error("usage: birdhouse audit");
  process.exit(1);
}
