// Tests for lore JSON salvage + WORLD mutation persistence.
// Run: node scripts/test-world-memory.mjs

import {
  salvageLoreJSON,
  isJsonDump,
  captureWorldDelta,
  applyWorldDelta,
  placeCatalogMentions,
} from "./lib/world-memory.mjs";

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name); }
}

// --- truncated lore JSON (the driftwood transcript failure) -----------------
{
  const raw = `{"answer":"You spot a bleached, arm-length piece of driftwood tangled in the shingle and hoist it onto your shoulder.","facts":["Driftwood accumulates here after each high tide."],"entities":[{"id":"driftwood","name":"Driftwood","portable":true,"`;
  const j = salvageLoreJSON(raw);
  ok(!!j && /driftwood/i.test(j.answer), "salvage answer from truncated JSON");
  ok(j && j.entities.some(e => e.id === "driftwood" && e.portable !== false),
    "salvage driftwood entity from truncated JSON");
  ok(isJsonDump(raw), "truncated lore blob detected as JSON dump");
  ok(!isJsonDump("You spot bleached driftwood on the shingle."), "prose is not JSON dump");
}

// --- intact JSON still works ------------------------------------------------
{
  const raw = JSON.stringify({
    answer: "A crab scuttles.",
    facts: ["Tide pools hold crabs."],
    entities: [{ id: "crab", name: "crab", portable: true, desc: "food" }],
  });
  const j = salvageLoreJSON(raw);
  ok(j && j.answer === "A crab scuttles." && j.entities[0].id === "crab",
    "intact lore JSON parses");
}

// --- catalog mentions place portable items ----------------------------------
{
  const catalog = {
    driftwood: { name: "driftwood" },
    tools: { name: "tools" },
    radio: { name: "waterproof radio", portable: false },
  };
  const placed = placeCatalogMentions(
    catalog, [], [],
    "You spot a bleached piece of driftwood on the beach."
  );
  ok(placed.includes("driftwood") && !placed.includes("tools"),
    "placeCatalogMentions adds mentioned portable only");
}

// --- world delta round-trip -------------------------------------------------
{
  const seed = {
    items: { crab: { name: "crab" } },
    nodes: {
      beach: { name: "Beach", exits: { north: "jungle" }, items: [] },
      jungle: { name: "Jungle", exits: { south: "beach" }, items: ["fig"] },
    },
  };
  const live = {
    items: {
      crab: { name: "crab" },
      driftwood: { name: "driftwood", tags: ["generated"] },
    },
    nodes: {
      beach: { name: "Beach", exits: { north: "jungle", discover_cove: "hidden_cove" }, items: ["driftwood"] },
      jungle: { name: "Jungle", exits: { south: "beach" }, items: ["fig"] },
      hidden_cove: { name: "Hidden Cove", desc: "secret", exits: { back: "beach" } },
    },
  };
  const delta = captureWorldDelta(seed, live);
  ok(!!delta.items.driftwood, "delta captures generated item def");
  ok(delta.nodeItems.beach && delta.nodeItems.beach.includes("driftwood"),
    "delta captures beach item placement");
  ok(!!delta.extraNodes.hidden_cove, "delta captures generated place");
  ok(delta.exits.beach && delta.exits.beach.discover_cove === "hidden_cove",
    "delta captures new exit");

  const restored = {
    items: { crab: { name: "crab" } },
    nodes: {
      beach: { name: "Beach", exits: { north: "jungle" }, items: [] },
      jungle: { name: "Jungle", exits: { south: "beach" }, items: ["fig"] },
    },
  };
  applyWorldDelta(restored, delta);
  ok(!!restored.items.driftwood, "restore item def");
  ok(restored.nodes.beach.items.includes("driftwood"), "restore beach items");
  ok(!!restored.nodes.hidden_cove, "restore generated place");
  ok(restored.nodes.beach.exits.discover_cove === "hidden_cove", "restore exit");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
