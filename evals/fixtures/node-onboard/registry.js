// In-memory store shared by server.js and cli.js.
const birdhouses = [
  { id: "bh-01", location: "north fence", occupied: true },
  { id: "bh-02", location: "oak tree", occupied: false },
];

function listBirdhouses() {
  return birdhouses;
}

function registerSighting(sighting) {
  const house = birdhouses.find((b) => b.id === sighting.birdhouseId);
  if (house) house.occupied = true;
  return { ...sighting, recordedAt: "now" };
}

module.exports = { listBirdhouses, registerSighting };
