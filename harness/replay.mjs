import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createGame } from "../src/engine.js";

const path = process.argv[2];
if (!path) {
  console.error("usage: node harness/replay.mjs <fixture.json>");
  process.exit(2);
}

const fix = JSON.parse(readFileSync(path, "utf8"));
const game = createGame({ arm: fix.arm || "spine" });
game.reset({ fresh: true });

for (const a of fix.actions) {
  const res = game.act(a);
  if (res.pendingGen) await game.genStep(res.pendingGen);
  if (!res.ok) console.warn("reject", a, res.text);
}

const st = game.exportState();
const exp = fix.expect || {};

if ("ending" in exp) assert.equal(game.ending(), exp.ending);
if (exp.flags) {
  for (const [k, v] of Object.entries(exp.flags)) {
    assert.equal(st.S.flags[k], v, k);
  }
}
if (exp.inventory) {
  for (const item of exp.inventory) {
    assert.ok(st.S.inv.includes(item), `inventory missing ${item}`);
  }
}
if (exp.clockMin != null) {
  assert.ok(game.metrics().clock >= exp.clockMin, "clock did not advance");
}

console.log("replay ok:", fix.name);
