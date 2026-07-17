// Regression checks for offlineParse / singularize / normalizeDir.
// Pulls function bodies from index.html (one source of truth).
// Run: node scripts/test-parse.mjs

import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function extractFn(name) {
  const start = html.search(new RegExp(`function ${name}\\(`));
  if (start < 0) throw new Error("missing function " + name);
  const brace = html.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < html.length; i++) {
    const c = html[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

const stubs = `
const WORLD = { nodes: {
  beach: { name: "Shingle Beach", exits: { east: "wreck_shore", north: "jungle" }, items: ["fig","bamboo","pebbles"] },
  wreck_shore: { name: "Wreck Shore", exits: { west: "beach" }, items: [] },
  jungle: { name: "Jungle Edge", exits: { south: "beach" }, items: ["goat_meat"] },
}, items: {
  fig:{name:"fig"}, bamboo:{name:"bamboo"}, pebbles:{name:"pebbles"}, goat_meat:{name:"goat meat"}
}};
let S = { loc: "beach", inv: [] };
function node(){ return WORLD.nodes[S.loc]; }
function hasItem(i){ return S.inv.includes(i); }
function itemName(i){ return (WORLD.items[i]&&WORLD.items[i].name)||i; }
`;

const code = stubs + "\n" +
  extractFn("singularize") + "\n" +
  extractFn("normalizeDir") + "\n" +
  extractFn("offlineParse") + "\n" +
  `return { offlineParse, singularize, normalizeDir, setLoc(id){ S.loc=id; }, exits(){ return Object.keys(node().exits||{}); } };`;

const api = new Function(code)();
const { offlineParse, singularize, normalizeDir, setLoc, exits } = api;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name); }
}

ok(singularize("pebbles") === "pebble", "singularize pebbles");
ok(singularize("figs") === "fig", "singularize figs");

setLoc("beach");
ok(normalizeDir("wreck", exits()) === "east", "normalizeDir wreck→east");
ok(normalizeDir("jungle", exits()) === "north", "normalizeDir jungle→north");

const act = (t) => offlineParse(t);

ok(act("where is the cat?").action === "ask", "question → ask");
ok(act("look around").action === "look", "look around → look");
ok(act("go to the wreck").action === "go" && /wreck/.test(act("go to the wreck").target), "go to wreck");
ok(act("swim to the wreck").action === "go", "swim to wreck → go");
ok(act("throw pebbles at the jaguar").action === "use", "throw X at Y → use");
ok(act("give fig to the cat").action === "tame", "give to cat → tame");
ok(act("pick up fig and bamboo").action === "take", "multi take stays take");
ok(act("collect pebbles").action === "take", "collect → take");
ok(act("xyzzy foobar").action === "ask", "unknown → ask not look");

const compound = act("go north then swim to the wreck");
ok(compound.actions && compound.actions.length === 2, "then → actions[]");
ok(compound.actions[0].action === "go" && compound.actions[1].action === "go", "then steps are go/go");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
