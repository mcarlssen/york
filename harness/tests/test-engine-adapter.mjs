import assert from "node:assert/strict";
import { createGame, AGENT_API_VERSION, getActionSchema } from "../../src/engine.js";

const mem = new Map();
const storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const game = createGame({ storage, arm: "spine" });
game.reset({ fresh: true });
const obs = game.observe("privileged");
assert.equal(obs.place, "Shingle Beach"); // or whatever node().name is at start
assert.ok(Array.isArray(obs.exits));

const look = game.act({ action: "look" });
assert.equal(look.ok, true);

const disc = game.act({ action: "discover", target: "north ridge" });
assert.equal(disc.pendingGen?.type, "place");
const gen = await game.genStep(disc.pendingGen);
assert.equal(gen.verdict, "skipped"); // spine

const placePayload = JSON.stringify({
  id: "test_grove", name: "Test Grove",
  desc: "A palm grove near the shore.", dirBack: "south"
});

const game2 = createGame({
  storage,
  arm: "full",
  llm: async () => placePayload,
});
game2.reset({ fresh: true });
const seedLoreIds = new Set(Object.keys(game2.exportState().LORE.nodes));
const d2 = game2.act({ action: "discover" });
const g2 = await game2.genStep(d2.pendingGen);
assert.equal(g2.type, "place");
assert.ok(g2.verdict === "accepted" || g2.verdict === "rejected");

assert.equal(game.apiVersion, 1);
assert.equal(AGENT_API_VERSION, 1);
assert.ok(getActionSchema().includes("discover"));

// isolation: accepted place must not leak across fresh reset
assert.equal(g2.verdict, "accepted");
const placeId = g2.place.id;
assert.ok(game2.exportState().WORLD.nodes[placeId], "place present after accept");
assert.ok(
  Object.keys(game2.exportState().LORE.nodes).some((id) => id === "place_" + placeId || id.includes(placeId)),
  "generated place lore present before reset"
);

game2.reset({ fresh: true });
const after = game2.exportState();
assert.equal(after.WORLD.nodes[placeId], undefined, "place id gone from WORLD after fresh reset");
const afterLoreIds = Object.keys(after.LORE.nodes);
assert.ok(!afterLoreIds.includes("place_" + placeId), "generated place lore absent after reset");
for (const id of afterLoreIds) {
  assert.ok(seedLoreIds.has(id), "lore node " + id + " should be seed-only baseline");
}
assert.equal(afterLoreIds.length, seedLoreIds.size, "lore node count back to seed baseline");

const d3 = game2.act({ action: "discover" });
assert.equal(d3.pendingGen?.type, "place");
const g3 = await game2.genStep(d3.pendingGen);
assert.equal(g3.verdict, "accepted");
assert.ok(game2.exportState().WORLD.nodes[g3.place.id], "discover can recreate place after reset");

console.log("test-engine-adapter: ok");
