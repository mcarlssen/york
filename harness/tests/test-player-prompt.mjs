import assert from "node:assert/strict";
import { buildSystemPrompt, hashPromptVersion } from "../player.mjs";

const p = buildSystemPrompt({
  arm: "full",
  observeMode: "privileged",
  constraints: ["no magic"],
  title: "York",
});
assert.match(p, /discover/);
assert.doesNotMatch(p, /Jungle Interior[\s\S]*Tide Pools[\s\S]*Cliff/); // no god-map of all nodes
const v = hashPromptVersion(p, "privileged-v1");
assert.equal(typeof v, "string");
assert.ok(v.length >= 8);
console.log("test-player-prompt: ok");
