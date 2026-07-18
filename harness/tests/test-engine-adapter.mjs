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

const game2 = createGame({
  storage,
  arm: "full",
  llm: async () => JSON.stringify({
    id: "test_grove", name: "Test Grove",
    desc: "A palm grove near the shore.", dirBack: "south"
  }),
});
game2.reset({ fresh: true });
const d2 = game2.act({ action: "discover" });
const g2 = await game2.genStep(d2.pendingGen);
assert.equal(g2.type, "place");
assert.ok(g2.verdict === "accepted" || g2.verdict === "rejected");

assert.equal(game.apiVersion, 1);
assert.equal(AGENT_API_VERSION, 1);
assert.ok(getActionSchema().includes("discover"));

console.log("test-engine-adapter: ok");
