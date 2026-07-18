// Regression checks for offlineParse / singularize / normalizeDir.
// Run: node scripts/test-parse.mjs

import { offlineParse, createGame } from "../src/engine.js";
import { isImproviseIntent } from "./lib/world-memory.mjs";

const game = createGame({ arm: "spine", llm: null, storage: {
  _m: new Map(),
  getItem(k){ return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k,v){ this._m.set(k, String(v)); },
  removeItem(k){ this._m.delete(k); },
}});
game.reset({ fresh: true });

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name); }
}

const act = (t) => offlineParse(t);

ok(act("where is the cat?").action === "ask", "question → ask");
ok(act("look around").action === "look", "look around → look");
ok(act("go to the wreck").action === "go" && /wreck/.test(act("go to the wreck").target), "go to wreck");
ok(act("swim to the wreck").action === "go", "swim to wreck → go");
ok(act("throw pebbles at the jaguar").action === "use", "throw X at Y → use");
ok(act("give fig to the cat").action === "tame", "give to cat → tame");
ok(act("collect pebbles").action === "take", "collect → take");
ok(act("xyzzy foobar").action === "ask", "unknown → ask not look");

ok(act("make a club with the driftwood and a rock").action === "improvise", "make club → improvise");
ok(act("use the strip of cloth to tie a rock to the driftwood").action === "improvise", "use to tie → improvise");
ok(act("build raft").action === "build", "build raft stays build");
ok(act("i rip cloth then tie a rock to driftwood").action === "improvise", "then-craft stays one improvise");
ok(isImproviseIntent("make a club with driftwood"), "helper agrees");

const compound = act("go north then swim to the wreck");
ok(compound.actions && compound.actions.length === 2, "then → actions[]");
ok(compound.actions[0].action === "go" && compound.actions[1].action === "go", "then steps are go/go");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
