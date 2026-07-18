import {
  salvageLoreJSON, isJsonDump, captureWorldDelta, applyWorldDelta, placeCatalogMentions, extractJSON as extractJSONLib,
  isCraftTakeTarget, splitSimpleTakeTargets, normalizeItemTarget, shouldHoldEntity, collectPlayerFacts,
  isImproviseIntent, isSiteBuild, salvageImproviseJSON
} from "../scripts/lib/world-memory.mjs";

export const AGENT_API_VERSION = 1;

export function getActionSchema() {
  return ["look","examine","go","take","salvage","use","build","signal","tame","launch","ask","eat","wait","discover","improvise"];
}

function defaultStorage() {
  if (typeof localStorage !== "undefined") return localStorage;
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
}

let _storage = defaultStorage();
let _llm = null;
let _onDebug = null;
let _onLoreCommit = null;
let _arm = "full";
let _harvest = [];
let _loreStats = { retrieved: 0, generated: 0, entitiesAdded: 0, placesAdded: 0 };

function debugEvent(msg){
  if(!_onDebug) return;
  try{ _onDebug(String(msg)); }catch(e){}
}

/* ============================================================
   WORLD DOC — the single source of truth for this world.
   Mirrors openspec/world/world.json (the authoring source). A POC
   embeds a copy so it runs from file:// with no fetch/build step.
   The engine derives WORLD + SPEC from this; seedLore reads lore_seed
   + ecology from it. Edit world.json to author the world, then
   re-sync this embed.
   ============================================================ */
const WORLD_DOC = {
  world_id: "meridian",
  identity: { title:"The Gray Light: Wreck of the Meridian", tagline:"A castaway on a hostile shore. Loot the wreck before the sea takes it — then decide how you leave.", engine:"index.html" },
  constraints: [
    "Ecology is self-consistent with an equatorial castaway island: reef, palms, mangroves, feral goats, seabirds, jungle cats, parrots, sharks. No cold/temperate or volcanic life.",
    "SIGNAL vs CONCEAL: a signal (fire/pyre/light) raises rescue chance AND predator/wildlife attention; brighter signal = more of both. Staying dark and quiet is safe but unseen.",
    "Wildlife is the antagonist: sharks in the water, night predators on land, storms at sea. The jungle cat and parrot can be tamed and turned to the player's use.",
    "THE WRECK'S CLOCK: wreck integrity falls every turn (tide and weather). At 0 the wreck breaks up and its un-salvaged items are lost forever.",
    "NIGHT falls on a cycle; warmth falls each night and is restored by fire or shelter. At warmth 0, life falls.",
    "Each meaningful action advances the tide/clock one tick.",
    "A locked connection or container requires its key item in inventory before it opens.",
    "The player cannot leave the open ocean until a craft (raft or balloon) is built and launched, or until a rescue is triggered by signal.",
    "Man Friday is omitted; the companion is a tamed jungle cat (hunting/scouting) and/or a tamed parrot (warning/messenger)."
  ],
  lore_seed: [
    { id:"seed",  subject:"the Meridian", relation:"is", object:"a merchant brig wrecked on a reef off an uninhabited equatorial island", tags:["world","wreck","setting"] },
    { id:"you",   subject:"the player", relation:"is", object:"the sole survivor of the Meridian, washed ashore with nothing", tags:["player","survivor","lore"] },
    { id:"island",subject:"the island", relation:"is", object:"a forested equatorial island with a reef, a jungle, a freshwater spring, and a high cliff", tags:["island","setting","ecology"] },
    { id:"wreckclock", subject:"the wreck", relation:"has", object:"an integrity that falls each turn; at 0 it is gone and its cargo lost", tags:["wreck","rule","clock"] },
    { id:"signal",subject:"a signal", relation:"draws", object:"both rescue (ships/planes) and predators (sharks, night hunters)", tags:["signal","rule","conceal"] },
    { id:"warmth",subject:"night", relation:"drains", object:"warmth; fire or shelter restores it; at 0 warmth, life falls", tags:["night","warmth","rule"] },
    { id:"cat",   subject:"a jungle cat", relation:"is", object:"a wild predator that can be tamed with food; once tamed it hunts and scouts", tags:["cat","companion","wildlife"] },
    { id:"parrot",subject:"a parrot", relation:"is", object:"a wild bird that can be tamed; once tamed it warns of ships and predators", tags:["parrot","companion","wildlife"] },
    { id:"paths", subject:"escape", relation:"may_be", object:"by raft, by hot-air balloon, by signal rescue, or by enduring on the island", tags:["escape","ending","rule"] }
  ],
  ecology: {
    climate:"hot, humid, trade-wind, violent squalls",
    terrain:["reef","shingle beach","mangrove flat","jungle interior","freshwater spring","basalt cliff"],
    flora:["coconut palm","mangrove","breadfruit","wild fig","bamboo"],
    fauna:["feral goat","jungle cat","parrot","crab","reef fish","seabird","shark"]
  },
  companions: {
    cat:    { name:"the jungle cat", home:"jungle", tame_item:"goat_meat" },
    parrot: { name:"the parrot", home:"cliff", tame_item:"fig" }
  },
  map: {
    start:"beach", max_clock:16,
    nodes: {
      beach:      { name:"Shingle Beach", desc:"Where the sea spat you out. The Meridian lies broken on the reef, a hundred yards out. The jungle waits inland; the cove and your camp sit along the shore.", exits:{ west:"tide_pools", north:"jungle", east:"wreck_shore", up:"cliff", south:"cove", south_east:"camp" }, items:["driftwood","debris","pebbles"] },
      wreck_shore:{ name:"Wreck Shore", desc:"At low light you can wade toward the Meridian's hull. She is breaking up fast.", exits:{ west:"beach" }, salvage:true },
      tide_pools: { name:"Tide Pools", desc:"Rock pools thick with crabs and shellfish; a seep of fresh water filters down.", exits:{ east:"beach" }, items:["crab","fresh_water"], forage:"food" },
      jungle:     { name:"Jungle Interior", desc:"Close, green, loud with birds. Feral goats browse; something with yellow eyes watches from the figs.", exits:{ south:"beach", east:"spring", north:"cliff" }, items:["goat_meat","fig","bamboo"], cat_home:true },
      spring:     { name:"Freshwater Spring", desc:"Cold sweet water wells from the rock. Life, here.", exits:{ west:"jungle" }, items:["fresh_water"], forage:"water" },
      cliff:      { name:"The Cliff", desc:"A high bare promontory. From here you can see the whole reef — and be seen. A dead tree waits for a pyre.", exits:{ south:"jungle", down:"beach" }, build:"pyre", parrot_home:true },
      cove:       { name:"Sheltered Cove", desc:"Calm water between two headlands. The place to build and launch a craft.", exits:{ south:"beach" }, build:"raft" },
      camp:       { name:"Your Camp", desc:"A lean-to of palms and sailcloth you raised. Safe at night if the fire holds.", exits:{ south:"beach" }, build:"shelter" }
    },
    containers: {
      wreck: { name:"The Meridian (wreck)", holds:{ tools:"a hatchet, a knife, rope", sailcloth:"canvas from the fallen sail", provisions:"hardtack, a jar of rum", rifle:"a sodden musket and shot", radio:"a waterproof wireless set" } }
    },
    items: {
      tools:{name:"tools", desc:"hatchet, knife, rope — the means to build."},
      sailcloth:{name:"sailcloth", desc:"canvas; shelters, sails, balloon envelope."},
      provisions:{name:"provisions", desc:"hardtack and a jar of rum; staves off starvation, briefly."},
      rifle:{name:"musket", desc:"sodden but serviceable; a noise that scares predators, a tool to hunt."},
      radio:{name:"waterproof radio", desc:"a wireless set — if you can power and tune it, someone may answer."},
      crab:{name:"crab", desc:"a tide-pool crab; food."},
      goat_meat:{name:"goat meat", desc:"feral goat; real sustenance."},
      fig:{name:"fig", desc:"wild fig; food and water."},
      bamboo:{name:"bamboo", desc:"strong, light; raft and frame material."},
      fresh_water:{name:"fresh water", desc:"the difference between life and the sun."},
      driftwood:{name:"driftwood", desc:"sun-bleached wood washed ashore; useful for fire and building."},
      pebbles:{name:"pebbles", desc:"smooth shingle stones; can be used as sling ammunition."},
      shingle:{name:"shingle", desc:"beach pebbles; the shore is paved with them."},
      debris:{name:"debris", desc:"wreckage fragments from the Meridian; scraps of wood and rope."},
      shellfish:{name:"shellfish", desc:"mussels and clams from the tide pools; edible."}
    }
  }
};

/* Derive the engine's WORLD + SPEC from the world doc. */
function buildWorld(doc){
  // deep clone so play mutations never dirty the embedded WORLD_DOC
  return {
    start: doc.map.start,
    maxClock: doc.map.max_clock,
    nodes: JSON.parse(JSON.stringify(doc.map.nodes)),
    containers: JSON.parse(JSON.stringify(doc.map.containers)),
    items: JSON.parse(JSON.stringify(doc.map.items)),
    companions: JSON.parse(JSON.stringify(doc.companions || {}))
  };
}
const WORLD = buildWorld(WORLD_DOC);
const WORLD_SEED = buildWorld(WORLD_DOC); // pristine snapshot for delta persist
const SPEC = {
  seed: (WORLD_DOC.identity.title+": "+WORLD_DOC.identity.tagline),
  constraints: WORLD_DOC.constraints
};
function resetWorldFromSeed(){
  const fresh = buildWorld(WORLD_DOC);
  WORLD.nodes = fresh.nodes;
  WORLD.items = fresh.items;
  WORLD.containers = fresh.containers;
  WORLD.companions = fresh.companions;
}

/* ============================================================
   DETERMINISTIC ENGINE — the spine (derived from WORLD_DOC).
   Map graph, inventory, life/storm/beam meters, locks, journals,
   puzzles, win/lose. The LLM never changes this directly.
   ============================================================ */

const ENDINGS = {
  rescue_ship: ["A SAIL ON THE HORIZON", "good",
    "Smoke and mirror-flame do their work. A sail heaves up over the reef, and a boat comes for you. The Meridian took everything; the island gave you just enough. You leave the gray behind."],
  raft_escape: ["THE OPEN OCEAN", "good",
    "The raft slides off the cove into the blue. You ship the bamboo outrigger and point her west, away from the reef. Whether anyone finds you, you have chosen the sea over the island."],
  balloon: ["INTO THE CLOUDS", "bittersweet",
    "The envelope fills; the world tilts and shrinks beneath you. You rise above the squalls, free and alone, a castaway of the sky now. The island becomes a green speck and is gone."],
  endure: ["THE ISLAND IS HOME", "bittersweet",
    "The clock runs out and still you stand — shelter roofed, fire banked, the cat at your feet, the parrot on your shoulder. You came ashore with nothing. You are a person of this place now."],
  perish: ["THE SEA KEEPS YOU", "bad",
    "Your strength gives out on the sand. The wreck is gone, the fire is cold, and the island does not miss you. The tide comes, as it always does."]
};

let S = null;
let LORE = null;          // persistent LoreGraph, loaded from storage or seeded

/* ============================================================
   LORE GRAPH — bounded, queryable world memory.
   Facts are nodes {id,subject,relation,object,text,source,tags,turn};
   related facts are linked by edges. Retrieval returns only the
   top-K most relevant nodes for the current context, so the LLM
   prompt never bloats. Persisted per world id across sessions.
   ============================================================ */
const LORE_STORE_KEY = "york_lore_v1";
const GAME_STATE_KEY = "york_state_v1";
const WORLD_ID = "meridian";

function saveState(){
  try{
    if(S){
      S.worldDelta = captureWorldDelta(
        { items: WORLD_SEED.items, nodes: WORLD_SEED.nodes },
        { items: WORLD.items, nodes: WORLD.nodes }
      );
    }
    _storage.setItem(GAME_STATE_KEY, JSON.stringify(S));
  }catch(e){}
}
function loadState(){
  try{ return JSON.parse(_storage.getItem(GAME_STATE_KEY) || "null"); }catch(e){ return null; }
}

function LoreGraph(){
  this.nodes = {};        // id -> node
  this.edges = [];        // {from,to,rel}
  this.seq = 0;
}
LoreGraph.prototype.commit = function(subject, relation, object, opts){
  opts = opts || {};
  const id = opts.id || ("L"+(++this.seq));
  const text = opts.text || [subject,relation,object].filter(Boolean).join(" ");
  const node = { id, subject, relation, object, text,
    source: opts.source||"system", tags: opts.tags||[], turn: opts.turn||0 };
  this.nodes[id] = node;
  if(opts.link) for(const t of [].concat(opts.link)) this.edges.push({from:id,to:t,rel:"related"});
  return id;
};
// relevance = tag overlap + token overlap with the query
LoreGraph.prototype.retrieve = function(query, k){
  k = k||6;
  const q = String(query||"").toLowerCase();
  const qt = q.split(/[^a-z0-9]+/).filter(w=>w.length>2);
  const scored = Object.values(this.nodes).map(n=>{
    let score = 0;
    const blob = (n.text+" "+n.tags.join(" ")+" "+(n.subject||"")+" "+(n.object||"")).toLowerCase();
    for(const t of qt){ if(blob.includes(t)) score += 1; }
    for(const tag of (n.tags||[])){ if(q.includes(tag.toLowerCase())) score += 2; }
    return { n, score };
  }).filter(x=>x.score>0);
  scored.sort((a,b)=>b.score-a.score);
  return scored.slice(0,k).map(x=>x.n);
};
LoreGraph.prototype.toJSON = function(){ return { nodes:this.nodes, edges:this.edges, seq:this.seq }; };
LoreGraph.prototype.load = function(obj){
  if(obj&&obj.nodes){ this.nodes=obj.nodes; this.edges=obj.edges||[]; this.seq=obj.seq||0; return true; } return false;
};
function persistLore(){ try{ _storage.setItem(LORE_STORE_KEY+":"+WORLD_ID, JSON.stringify(LORE.toJSON())); }catch(e){} }
function loadLore(){
  try{
    const raw = _storage.getItem(LORE_STORE_KEY+":"+WORLD_ID);
    if(raw){ const g=new LoreGraph(); if(g.load(JSON.parse(raw))) return g; }
  }catch(e){}
  return null;
}

function seedLore(g, doc){
  doc = doc || WORLD_DOC;
  // baseline lore_seed facts (idempotent by id)
  for(const e of (doc.lore_seed||[])){
    if(!g.nodes[e.id]) g.commit(e.subject, e.relation, e.object, { id:e.id, source:"spec", tags:e.tags||[], link:e.link });
  }
  // ecology becomes retrievable lore so the LLM answers environment questions consistently
  const eco = doc.ecology || {};
  if(eco.climate && !g.nodes["eco_climate"]) g.commit("the climate","is",eco.climate,{id:"eco_climate",source:"spec",tags:["ecology","climate"]});
  for(const t of (eco.terrain||[])) if(!g.nodes["eco_terr_"+t]) g.commit("terrain includes", t, "", {id:"eco_terr_"+t,source:"spec",tags:["ecology","terrain",t.toLowerCase().replace(/[^a-z]/g,"")]});
  for(const f of (eco.flora||[]))    if(!g.nodes["eco_flora_"+f]) g.commit("flora includes", f, "", {id:"eco_flora_"+f,source:"spec",tags:["ecology","flora",f.toLowerCase().replace(/[^a-z]/g,"")]});
  for(const fa of (eco.fauna||[]))   if(!g.nodes["eco_fauna_"+fa]) g.commit("fauna includes", fa, "", {id:"eco_fauna_"+fa,source:"spec",tags:["ecology","fauna",fa.toLowerCase().replace(/[^a-z]/g,"")]});
}


function validateFactClient(text){
  const t = String(text||"").toLowerCase();
  // ponytail: equatorial world — block cold/magic only (was wrongly rejecting jungle/tropical)
  if(/volcanic|glacier|polar|tundra|permafrost|ice sheet|magic portal|dragon|unicorn|wizard|fairy/.test(t))
    return "contradicts the world's ecology/identity constraints";
  return null;
}

function pushLog(t,cls){ S.log.push({t:String(t),c:cls||""}); saveState(); }

/* ---- deterministic spatial + state helpers (used by engine AND LLM validation) ---- */
function node(){ return WORLD.nodes[S.loc]; }
function dirToNode(dir){
  const e = node().exits || {};
  return e[dir] || null;
}
function canTravel(dir){
  const n = node();
  if(n.lock && n.lock.dir===dir){
    return { ok: S.inv.includes(n.lock.key), need:n.lock.key, text:n.lock.lockedText };
  }
  return { ok: !!dirToNode(dir) };
}
function hasItem(id){ return S.inv.includes(id); }
function itemName(id){ return (WORLD.items[id]&&WORLD.items[id].name)||id; }

// Register a new item dynamically in WORLD.items (for organic discovery)
function registerItem(id, name, desc, tags, opts){
  opts = opts || {};
  if(!WORLD.items[id]){
    WORLD.items[id] = { name, desc, tags: tags||[], portable: opts.portable!==false };
    debugEvent("item: register "+id);
  }
  return WORLD.items[id];
}

// Apply structured lore entities (portable → location or inventory). Rejects meta strings.
function applyEntities(entities, playerQuery){
  const n = node();
  if(!n.items) n.items = [];
  for(const e of (entities||[])){
    if(!e || !e.id || !e.name) continue;
    const id = String(e.id).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
    if(!id || id.length>40) continue;
    if(/constraint|concise|factual|magic|volcanic|should mention|need to keep/i.test(e.name+" "+(e.desc||""))) continue;
    const portable = e.portable!==false;
    registerItem(id, e.name, e.desc||("You notice "+e.name+" here."), ["generated","lore"], {portable});
    if(!portable) continue;
    if(shouldHoldEntity(e, playerQuery)){
      if(!hasItem(id)){ S.inv.push(id); debugEvent("inv: +"+id); }
      const ix = n.items.indexOf(id); if(ix>=0) n.items.splice(ix,1);
    } else if(!n.items.includes(id) && !hasItem(id)){
      n.items.push(id);
      debugEvent("place-item: +"+id+" @ "+S.loc);
    }
  }
}
// Bridge: prose/facts that name catalog items make them takeable here.
function bridgeLoreToItems(texts){
  const n = node();
  n.items = placeCatalogMentions(WORLD.items, n.items||[], S.inv, (texts||[]).filter(Boolean).join(" "));
}
function commitPlayerFacts(lore){
  for(const f of collectPlayerFacts(lore)){
    if(validateFactClient(f)) continue;
    const id = "player_"+f.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,48);
    commitLore("player:"+id, f, { id, tags:["player","state","generated"], text:f });
  }
}

/* ---- resolve a natural-language direction/target to an exit key ---- */
function normalizeDir(t, exitKeys){
  if(!t) return null;
  let s = String(t).toLowerCase().trim();
  s = s.replace(/^(to |the |a |an |into |towards |toward |through |up |down |in |out |at )+/g,"").trim();
  const dirs = ["north_east","south_east","south_west","north_west","north","south","east","west","up","down","in","out",
                "northeast","southeast","southwest","northwest"];
  for(const d of dirs){
    const plain = d.replace("_"," ");
    if(s===d || s===plain || s.startsWith(d+" ") || s.startsWith(plain+" ") ||
       new RegExp("\\b"+plain.replace(/ /g,"\\s*")+"\\b").test(s))
      return d==="northeast"?"north_east":d==="southeast"?"south_east":d==="southwest"?"south_west":d==="northwest"?"north_west":d;
  }
  // destination name / alias match against current exits
  for(const ek of exitKeys){
    const destId = node().exits[ek];
    const dest = WORLD.nodes[destId];
    if(!dest) continue;
    const name = dest.name.toLowerCase();
    const id = destId.toLowerCase().replace(/_/g," ");
    const blob = name+" "+id;
    if(blob.includes(s) || s.includes(name.split(" ")[0]) || s.includes(id.split(" ")[0])) return ek;
  }
  // place-aware aliases (current exits only)
  const alias = {wreck:"east", meridian:"east", jungle:"north", cliff:"up", cove:"south", camp:"south_east",
                 tide:"west", pool:"west", pools:"west", spring:"east", beach:"south"};
  for(const k in alias){ if(s.includes(k)){ const d=alias[k]; if(exitKeys.includes(d)) return d; } }
  return null;
}

/* ---- the only ways state changes: apply an already-validated action ---- */
function applyAction(a){
  switch(a.action){
    case "look": return describe();
    case "examine": return doExamine(a.target);
    case "go": return doGo(a.target);
    case "take": return doTake(a.target);
    case "salvage": return doSalvage(a.target);
    case "use": return doUse(a.target, a.item);
    case "build": return doBuild(a.target);
    case "signal": return doSignal(a.target);
    case "tame": return doTame(a.target);
    case "launch": return doLaunch();
    case "ask": return doAsk(a.target, a.say);
    case "discover": return doDiscover(a.target || a.say);
    case "improvise": return doImprovise(a.say || a.target);
    case "eat": return doEat(a.target);
    case "wait": return doWait();
    default: return {ok:false, text:"The island does not record that action."};
  }
}

function tick(){ S.clock = Math.min(WORLD.maxClock, S.clock+1); }
function lifeDelta(d){ S.life = Math.max(0, Math.min(100, S.life+d)); }
function warmthDelta(d){ S.warmth = Math.max(0, Math.min(100, S.warmth+d)); }
function signalDelta(d){ S.signal = Math.max(0, Math.min(10, S.signal+d)); }
function tameDelta(which,d){ S.tame[which]=Math.max(0,Math.min(10,S.tame[which]+d)); }

function singularize(s){
  const t=String(s||"").toLowerCase().trim();
  if(t.endsWith("ies") && t.length>4) return t.slice(0,-3)+"y";
  if(t.endsWith("ses")||t.endsWith("xes")||t.endsWith("zes")) return t.slice(0,-2);
  if(t.endsWith("s") && !t.endsWith("ss") && t.length>3) return t.slice(0,-1);
  return t;
}

function describe(){
  const n = node();
  let txt = `— ${n.name} —\n${n.desc}`;
  const exits = Object.keys(n.exits||{});
  if(exits.length) txt += `\n\nPaths: ${exits.join(", ")}.`;
  const here = (n.items||[]).filter(i=>!hasItem(i));
  if(here.length) txt += `\nYou can see: ${here.map(itemName).join(", ")}.`;
  if(n.salvage) txt += `\nThe Meridian groans on the reef (integrity ${S.wreck}). Salvage a cargo: tools, sailcloth, provisions, rifle, radio.`;
  if(n.build) txt += `\nYou could build here (${n.build}).`;
  if(n.cat_home && !S.tame.cat) txt += `\nA jungle cat watches from the green. (tame it with goat meat)`;
  if(n.parrot_home && !S.tame.parrot) txt += `\nA parrot cocks its head. (tame it with a fig)`;
  return {ok:true, text:txt, cls:"good"};
}

function doExamine(t){
  if(!t) return {ok:false,text:"Examine what?"};
  const tgt = String(t).toLowerCase();
  const n = node();
  const itemHere = matchItem((n.items||[]), tgt);
  if(itemHere) return {ok:true, text:WORLD.items[itemHere].desc, cls:"good"};
  const itemInv = S.inv.find(i=>i===tgt.replace(/_/g," ")||itemName(i).toLowerCase()===tgt.replace(/_/g," ")||itemName(i).toLowerCase().includes(tgt));
  if(itemInv) return {ok:true, text:WORLD.items[itemInv].desc, cls:"good"};
  if(tgt.length>2 && !/here|room|place|around|surroundings/.test(tgt)){
    return {ok:true, text:`You study ${t}.`, cls:"good", pendingGen:{type:"lore", query:"Describe "+t+" on the Meridian's island, an equatorial castaway isle with reef, jungle, goats, cats, parrots, sharks."}};
  }
  return {ok:true, text:`You study ${t}. ${n.desc}`, cls:"good"};
}

function doGo(t){
  if(!t) return {ok:false, text:"Go where?"};
  const dir = normalizeDir(t, Object.keys(node().exits||{}));
  if(!dir) return {ok:false, text:"There is no such way from here.", cls:"warn"};
  const chk = canTravel(dir);
  if(!chk.ok){
    return {ok:false, text:(chk.text||"That way is blocked."), cls:"warn"};
  }
  const dest = dirToNode(dir);
  S.loc = dest; S.visited[dest]=true; tick();
  // wreck salvage adjacency: being at wreck_shore ages the wreck faster
  if(dest==="wreck_shore") ageWreck(4); else ageWreck(2);
  const r = describe();
  checkEnd();
  return r;
}

function matchItem(here, tgt){
  const t=normalizeItemTarget(tgt);
  const tSing=singularize(t);
  return here.find(i=>{
    if(hasItem(i)) return false;
    const n=itemName(i).toLowerCase();
    const id=i.replace(/_/g," ");
    return i===t || i===tSing || id===t || id===tSing || singularize(n)===tSing || n.includes(tSing) || t.includes(singularize(n)) ||
      i.includes(t.replace(/ /g,"_")) || singularize(id)===tSing;
  });
}
function doTake(t){
  if(!t) return {ok:false, text:"Take what?"};
  const raw = String(t).trim();
  // craft / compound body acts → improvise (LLM pass/fail with materials brief)
  if(isCraftTakeTarget(raw) || splitSimpleTakeTargets(raw)===null){
    return {ok:true, text:"You set to work.", cls:"fog", pendingGen:{type:"improvise", query: raw}};
  }
  const parts = splitSimpleTakeTargets(raw);
  if(parts && parts.length>1){
    const got=[], miss=[];
    for(const p of parts){
      const r=doTake(p);
      if(r.ok) got.push(p); else miss.push(p);
    }
    if(got.length) return {ok:true, text:`You take: ${got.join(", ")}.${miss.length?(" Missing: "+miss.join(", ")+"."):""}`, cls:"good"};
    return {ok:false, text:`There is none of that here to take.`, cls:"warn"};
  }
  const n=node();
  // alias: flail / sock weapon → already-held or ground pebble sock
  const alias = normalizeItemTarget(raw);
  if(/\b(flail|sock)\b/.test(alias)){
    const held = S.inv.find(i=>/sock|flail|pebble/i.test(i+" "+itemName(i)));
    if(held) return {ok:true, text:`You already have the ${itemName(held)}.`, cls:"good"};
  }
  const it=matchItem((n.items||[]), raw);
  if(!it) return {ok:false, text:`There is no ${normalizeItemTarget(raw)||raw} here to take.`, cls:"warn"};
  S.inv.push(it); tick(); ageWreck(1);
  debugEvent("inv: +"+it);
  return {ok:true, text:`You take the ${itemName(it)}.`, cls:"good"};
}

// The Wreck's Clock: salvage pulls one cargo category; wreck integrity falls each turn.
function doSalvage(t){
  if(S.loc!=="wreck_shore") return {ok:false, text:"You must be at the Wreck Shore to salvage the Meridian.", cls:"warn"};
  if(S.wreck<=0) return {ok:false, text:"The Meridian has broken up and sunk. Her cargo is lost to the reef.", cls:"warn"};
  const cat = (t||"").toLowerCase();
  const holds = WORLD.containers.wreck.holds;
  const key = Object.keys(holds).find(k=> k===cat || holds[k].toLowerCase().includes(cat) || cat.includes(k));
  if(!key) return {ok:false, text:"Salvage what? (tools, sailcloth, provisions, rifle, radio)", cls:"warn"};
  if(S.salvaged[key]) return {ok:false, text:`You already stripped the ${key} from the wreck.`, cls:"warn"};
  S.inv.push(key); S.salvaged[key]=true; tick(); ageWreck(3);
  debugEvent("inv: +"+key);
  let txt = `You wrest ${holds[key]} from the dying hull.`;
  if(key==="radio") txt += " The wireless is sealed in oilskin — it might still work.";
  if(S.wreck<=0) txt += " Even as you climb clear, the Meridian comes apart behind you.";
  return {ok:true, text:txt, cls:"good"};
}

function ageWreck(d){
  if(S.wreck<=0) return;
  S.wreck = Math.max(0, S.wreck - d);
  if(S.wreck===0){ pushLog("The Meridian breaks her back on the reef and is gone. Anything not yet salvaged is lost.","bad"); }
}

function doUse(t, item){
  const tgt=String(t||"").toLowerCase();
  const it=String(item||t||"").toLowerCase();
  if((tgt.includes("rifle")||it.includes("rifle")||it.includes("musket")) && hasItem("rifle")){
    return {ok:true, text:"You level the musket. The report sends the wildlife bolting — and warns the sharks you are here. (useful to hunt or scare, but loud)", cls:"warn", lore:"The musket's report scares predators but draws the sea's attention."};
  }
  if((tgt.includes("radio")||it.includes("radio")||it.includes("wireless")) && hasItem("radio")){
    return {ok:true, text:"You key the wireless. Static, then a voice through the storm: \"...any survivor, this is the trading schooner *Avis*... we hold offshore at the reef...\" — if you raise a signal, they will come.", cls:"fog", lore:"The wireless reaches the schooner Avis, holding offshore; a signal will bring rescue."};
  }
  // emergent: let the LLM propose a validated outcome
  return {ok:true, text:"You act.", cls:"fog", pendingGen:{type:"emerge", query: (item?item+" ":"")+(t||"") || "that action"}};
}

function doAsk(t, say){
  const q = String(say||t||"").toLowerCase();
  // ponytail: only exact tutorial phrasing gets canned text; everything else → genLore
  if(/^(how (do i|can i) (tame|befriend)|how to tame)\b/.test(q) || q==="tame?" || q==="companions?"){
    return {ok:true, text:`The cat, if tamed, hunts and scouts. The parrot, if tamed, warns of ships and predators. Feed them (goat meat / fig) where they live to win them.`, cls:"fog"};
  }
  if(/^(how (do i|can i) (signal|escape|get rescued)|what is signal)\b/.test(q)){
    return {ok:true, text:`A signal fire on the cliff draws rescue — and predators. Bright signal, more of both. Build a pyre there, or tune the radio if you salvaged it.`, cls:"fog"};
  }
  if(/^(what (can i|do i) salvage|how (do i|can i) salvage)\b/.test(q)){
    return {ok:true, text:`The Meridian is breaking up on the reef. Her cargo — tools, sailcloth, provisions, a musket, a wireless — is yours if you take it before the sea does.`, cls:"fog"};
  }
  return {ok:true, text:`You put the question to the island.`, cls:"fog", pendingGen:{type:"lore", query:say||t||"?"}};
}

function doDiscover(t){
  const q = String(t||"").trim();
  return {
    ok:true,
    text:"You search for a way onward…",
    cls:"fog",
    pendingGen:{ type:"place", query: q || "What lies near here?" }
  };
}

function doImprovise(say){
  const q = String(say||"").trim() || "improvise";
  return {
    ok:true,
    text:"You set to work with what you have.",
    cls:"fog",
    pendingGen:{ type:"improvise", query: q }
  };
}

function doBuild(t){
  const what = (t||"").toLowerCase();
  const n = node();
  if(!n.build) return {ok:false, text:"There is nothing to build here.", cls:"warn"};
  if(n.build!==what && !["raft","pyre","shelter","balloon"].includes(what)) 
    return {ok:false, text:`Here you can build: ${n.build}.`, cls:"warn"};
  if(what==="raft"){
    if(S.flags.raftBuilt) return {ok:true, text:"The raft is already built. Launch it.", cls:"good"};
    if(!hasItem("tools")||!hasItem("sailcloth")||!hasItem("bamboo"))
      return {ok:false, text:"A raft needs tools, sailcloth, and bamboo.", cls:"warn"};
    S.flags.raftBuilt=true; tick();
    return {ok:true, text:"You lash bamboo into an outrigger and rig the sailcloth. A sea-worthy raft. (launch it to leave)", cls:"good"};
  }
  if(what==="pyre"){
    if(S.flags.pyreBuilt) return {ok:true, text:"The pyre stands ready on the cliff. Feed it to signal.", cls:"good"};
    if(!hasItem("tools")&&!hasItem("bamboo")) return {ok:false, text:"You need tools or bamboo to raise a pyre.", cls:"warn"};
    S.flags.pyreBuilt=true; tick();
    return {ok:true, text:"You stack bamboo and driftwood into a pyre on the cliff, ready to light.", cls:"good"};
  }
  if(what==="shelter"){
    if(S.flags.shelterBuilt) return {ok:true, text:"Your camp is already standing.", cls:"good"};
    if(!hasItem("tools")&&!hasItem("sailcloth")) return {ok:false, text:"A shelter needs tools or sailcloth.", cls:"warn"};
    S.flags.shelterBuilt=true; tick();
    return {ok:true, text:"You raise a lean-to of palms and sailcloth. A roof against the squall, a hearth within.", cls:"good"};
  }
  if(what==="balloon"){
    if(S.flags.balloonBuilt) return {ok:true, text:"The balloon envelope is already sewn. Launch it.", cls:"good"};
    if(!hasItem("sailcloth")||!hasItem("tools")) return {ok:false, text:"A balloon needs sailcloth and tools.", cls:"warn"};
    S.flags.balloonBuilt=true; tick();
    return {ok:true, text:"You sew the sailcloth into an envelope and cage it with bamboo. Mad, but it might fly. (launch it to leave)", cls:"bittersweet"};
  }
  return {ok:false, text:"You can't build that here.", cls:"warn"};
}

function doSignal(t){
  if(!S.flags.pyreBuilt) return {ok:false, text:"You need a pyre on the cliff before you can signal. (build pyre)", cls:"warn"};
  if(S.loc!=="cliff") return {ok:false, text:"The pyre is on the cliff. Go there to feed it.", cls:"warn"};
  signalDelta(3); warmthDelta(2); tick();
  let txt="You feed the pyre; smoke and flame climb into the blue. Signal +3 — rescue may see it. So may the sharks and the things that hunt at night.";
  // a high signal with a way to be heard/seen can trigger rescue
  if(S.signal>=8 && (hasItem("radio")||S.tame.parrot>=5)){
    pushLog("Smoke on the horizon resolves into a sail — the schooner *Avis* answers your signal.","good");
    endGame("rescue_ship");
  }
  return {ok:true, text:txt, cls:"warn"};
}

function doTame(t){
  const which = (t||"").toLowerCase().includes("parrot") ? "parrot" : (t||"").toLowerCase().includes("cat") ? "cat" : null;
  if(!which) return {ok:false, text:"Tame what? (the cat, the parrot)", cls:"warn"};
  const c = WORLD.companions[which];
  if(S.loc!==c.home) return {ok:false, text:`The ${which} is not here. It lives at the ${c.home}.`, cls:"warn"};
  if(S.tame[which]>=10) return {ok:true, text:`The ${which} is already yours.`, cls:"good"};
  if(!hasItem(c.tame_item)) return {ok:false, text:`You need ${c.tame_item} to tame the ${which}.`, cls:"warn"};
  // consume one unit of the tame item
  const i=S.inv.indexOf(c.tame_item); if(i>=0) S.inv.splice(i,1);
  tameDelta(which, 10); tick();
  const name = which==="cat" ? "The jungle cat" : "The parrot";
  return {ok:true, text:`You offer the ${c.tame_item}. ${name} settles, decides you are not prey. It is yours now — and useful.`, cls:"good"};
}

function doLaunch(){
  if(S.flags.raftBuilt){ endGame("raft_escape"); return {ok:true,text:""}; }
  if(S.flags.balloonBuilt){ endGame("balloon"); return {ok:true,text:""}; }
  return {ok:false, text:"You have no craft to launch. (build raft / balloon)", cls:"warn"};
}

function doEat(t){
  const tgt=String(t||"").toLowerCase();
  const food = ["crab","goat_meat","fig","provisions","fresh_water"].find(f=> tgt.includes(f) || (WORLD.items[f]&&WORLD.items[f].name.toLowerCase().includes(tgt)));
  if(!food) return {ok:false, text:"You have nothing like that to eat or drink.", cls:"warn"};
  const i=S.inv.indexOf(food); if(i<0 && !["fresh_water"].includes(food)) return {ok:false, text:`You don't have ${food}.`, cls:"warn"};
  if(i>=0) S.inv.splice(i,1);
  lifeDelta(food==="fresh_water"?8:14); tick(); ageWreck(0);
  return {ok:true, text:`You eat/drink the ${WORLD.items[food].name}. Life restored.`, cls:"good"};
}

function doWait(){
  tick(); ageWreck(2);
  // night cycle: warmth falls, mitigated by shelter/fire
  S.night = !S.night;
  if(S.night){
    const mit = (S.flags.shelterBuilt?30:0) + (S.flags.pyreBuilt&&S.signal>0?20:0);
    const drop = Math.max(0, 25 - mit);
    warmthDelta(-drop); lifeDelta(-3);
    let txt=`Night falls. Warmth -${drop}, life -3.`;
    if(S.warmth<=0) txt += " The cold bites deep.";
    checkEnd();
    return {ok:true, text:txt, cls:"warn"};
  }
  return {ok:true, text:"You rest through the heat of the day. The clock advances; the wreck ages.", cls:"warn"};
}

/* ---- win / lose ---- */
function checkEnd(){
  if(S.ended) return;
  if(S.life<=0){ endGame("perish"); return; }
  if(S.warmth<=0){ lifeDelta(-8); if(S.life<=0){ endGame("perish"); return; } }
  if(S.clock>=WORLD.maxClock){
    // survived to the end of the clock
    if(S.flags.shelterBuilt && S.life>0) endGame("endure");
    else if(S.signal>=8 && (hasItem("radio")||S.tame.parrot>=5)) endGame("rescue_ship");
    else endGame("perish");
  }
}

// commit a lore fact discovered this turn into the persistent graph
// opts: {tags:[], id: stableId} — pass a stable id (e.g. journal id) to avoid duplicates
function commitLore(key, fact, opts){
  if(!fact) return;
  opts = opts || {};
  // Use the key as the stable ID to prevent duplicates and overwrites
  const stableId = opts.id || key || ("T"+(LORE.seq+1));
  const text = opts.text || fact;
  LORE.commit(key, "is", fact, { source:"play", tags: opts.tags||["discovered"], turn: S.clock,
    id: stableId, text });
  persistLore();
  debugEvent("lore: commit "+stableId+" — "+String(text).slice(0,120));
  if(_onLoreCommit) try{ _onLoreCommit(); }catch(e){}
}

function endGame(kind){
  S.ended=true; S.endKind=kind;
  const e=ENDINGS[kind];
  pushLog(e[2], e[1]);
}

/* ============================================================
   LLM LAYER — interpret plain language into an action JSON,
   then validate against the deterministic engine. Offline
   regex fallback when no key / call fails (the spine always works).
   ============================================================ */
// ponytail: ACTION_VERB map deleted — offlineParse regex is the offline spine
function offlineParse(text){
  const t = text.toLowerCase().trim();
  const one = (action, target, item, say)=> ({action, target:target||null, item:item||null, say:say||text});

  // compound: "go down, then swim to the wreck" — but one craft sequence stays improvise
  if(/\bthen\b/.test(t)){
    if(isImproviseIntent(t)) return one("improvise", null, null, text);
    const parts = t.split(/\s+then\s+/).map(x=>x.trim()).filter(Boolean);
    if(parts.length>1) return {actions: parts.map(p=>offlineParse(p))};
  }

  // questions
  if(t.endsWith("?") || /^(what|where|how|why|who|is there|can i|do i|did i|should i|would i|could i)\b/.test(t)){
    if(/\b(look around|describe|where am i|survey|scan)\b/.test(t)) return one("look");
    if(/\bwhat can i see\b/.test(t) && !/\bon\b/.test(t)) return one("look");
    const topicMatch = t.match(/^(what|where|how|why|who|is there|can i|do i|did i|should i|would i|could i)\b\s*(.+)/i);
    let topic = topicMatch ? topicMatch[2].replace(/\?$/,"").trim() : t.replace(/\?$/,"").trim();
    const locationMatch = topic.match(/\b(on|at|in|near|around|about)\s+(\w+(?:\s+\w+)?)\b/i);
    if(locationMatch) topic = locationMatch[2];
    return one("ask", topic||"general", null, text);
  }

  if(/\bsalvage\s+(everything|all|it all)\b/.test(t))
    return one("ask", null, null, "What do you want to salvage from the wreck? Categories: tools, sailcloth, provisions, rifle, radio.");

  if(/\b(make|build)\s+signal\b/.test(t) || /\b(signal|light signal|build signal)\b/.test(t))
    return one("signal");

  if(isSiteBuild(t)){
    const m = t.match(/\b(build|craft)\s+(?:a\s+|the\s+)?(raft|pyre|shelter|balloon)\b/);
    return one("build", m ? m[2] : null);
  }
  if(isImproviseIntent(t)) return one("improvise", null, null, text);

  const give = t.match(/\b(?:give|offer|feed)\s+(.+?)\s+to\s+(?:the\s+)?(.+)$/);
  if(give && /cat|parrot|jaguar/.test(give[2])) return one("tame", give[2]);

  const throwAt = t.match(/\b(?:throw|toss|hurl|use)\s+(.+?)\s+(?:at|on|toward|towards)\s+(.+)$/);
  if(throwAt) return one("use", throwAt[2], throwAt[1]);

  const goTo = t.match(/^(?:go|walk|head|run|move)(?:\s+to)?\s+(.+)$/);
  if(goTo) return one("go", goTo[1].replace(/^(the|a|an)\s+/,"").trim());

  const swim = t.match(/\b(?:swim|wade|cross)\s+(?:to|out to|toward|towards)\s+(?:the\s+)?(.+)$/);
  if(swim) return one("go", swim[1].trim());

  for(const d of ["north","south","east","west","up","down","in","out","northwest","northeast","southwest","southeast"]){
    if(new RegExp("^"+d+"$").test(t)) return one("go", d);
  }

  if(/\b(look around|describe|where am i|what can i see|survey|scan|look$)\b/.test(t))
    return one("look");

  const examineMatch = t.match(/\b(examine|look at|inspect|read|check)\s+(.+)$/);
  if(examineMatch) return one("examine", examineMatch[2].trim());

  if(/\b(discover|explore beyond|find a new place|scout for a path|scout ahead)\b/.test(t)){
    const m = t.match(/\b(?:discover|explore beyond|find a new place|scout for a path|scout ahead)\s*(.*)$/);
    return one("discover", (m && m[1] || "").trim() || null, null, text);
  }

  const takeMatch = t.match(/\b(take|pick up|pick|collect|get|grab|scavenge|find|gather|fetch)\s+(.+)$/);
  if(takeMatch){
    let target = takeMatch[2].trim().replace(/^(the|a|an|some)\s+/,"");
    if(/\beverything\b|\ball\b/.test(target)){
      const here=(node().items||[]).filter(i=>!hasItem(i));
      if(here.length) return {actions: here.map(i=>one("take", itemName(i)))};
      return one("look");
    }
    return one("take", target);
  }

  const salvageMatch = t.match(/\bsalvage\s+(tools|sailcloth|provisions|rifle|radio)\b/);
  if(salvageMatch) return one("salvage", salvageMatch[1]);

  const useMatch = t.match(/\buse\s+(.+?)(?:\s+on\s+(.+))?$/);
  if(useMatch) return one("use", useMatch[2]||null, useMatch[1].trim());

  const buildMatch = t.match(/\b(build|craft)\s+(.+)$/);
  if(buildMatch) return one("build", buildMatch[2].trim());

  const tameMatch = t.match(/\b(tame|befriend)\s+(.+)$/);
  if(tameMatch) return one("tame", tameMatch[2].trim());

  const launchMatch = t.match(/\blaunch\s+(?:the\s+)?(.+)$/);
  if(launchMatch) return one("launch", launchMatch[1].trim());

  const eatMatch = t.match(/\b(eat|drink|consume)\s+(.+)$/);
  if(eatMatch) return one("eat", eatMatch[2].trim());

  if(/\b(wait|rest|sleep|pass time|hold)\b/.test(t)) return one("wait");

  const putInv = t.match(/\b(?:put|place|stow)\s+(.+?)\s+in\s+(?:my\s+)?(?:inventory|pack|bag|pocket)\b/);
  if(putInv) return one("take", putInv[1].replace(/^(the|a|an|my)\s+/,"").trim());

  return one("ask", "intent", null, text);
}

function cleanGeneration(raw){
  if(!raw) return "";
  if(isJsonDump(raw)) return "";
  let s = raw.replace(/```[a-z]*|```/gi,"").replace(/\s*\n\s*/g," ").trim();
  const marker = s.match(/\b(however,?|so,?|in short,?|in brief,?|answer:?|the answer is:?|in conclusion,?)\s+(.+)$/i);
  if(marker && marker[2].length > 10) s = marker[2];
  const meta = /^(the user|the player|i (need|should|must|will|think|am|would)|you (are|need|should|must|can|will)|given (the|these|this)|this (seems|is|appears)|here('?s| is)|let me|based on|to answer|it seems|my (task|goal|response)|but need|should mention|need to keep|consistent with|no magic|maybe the|according to the rules)/i;
  const leak = /need to keep|concise|factual|consistent with constraints|should mention|no magic|no cold|according to the rules|entity wasn'?t|entities should/i;
  const sentences = s.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
  const kept = sentences.filter(x=>!meta.test(x) && !leak.test(x));
  let out = (kept.length ? kept : sentences.filter(x=>!leak.test(x))).join(" ");
  out = out.replace(/^(answer:?|response:?|sure,?|certainly,?|ok,?|well,?)\s*/i,"").trim();
  if(leak.test(out) || isJsonDump(out)) return "";
  if(out.length > 400) out = out.slice(0,397).replace(/\s+\S*$/,"") + "…";
  return out;
}

function extractJSON(raw){
  return extractJSONLib(raw);
}

async function llmText(system, user, maxTokens){
  if(!_llm) return null;
  try{
    return await _llm(system, user, maxTokens);
  }catch(e){
    return null;
  }
}

/* ============================================================
   PROCEDURAL LAYER — the LLM generates world content, the engine
   validates it against the ruleset before committing. This is the
   "rules by which the world is governed" in action: the model may
   PROPOSE, but only the engine may ESTABLISH.
   ============================================================ */

// Structured lore answer. Returns {answer, facts, entities} or null.
async function genLore(text){
  const ctx = text + " " + node().name;
  const relevant = LORE.retrieve(ctx, 6).map(n=>"- "+n.text).join("\n");
  const recent = S.log.filter(e=>e.c==="you"||e.c==="llm").slice(-6).map(e=>e.t).join("\n");
  const here = (node().items||[]).filter(i=>!hasItem(i)).map(itemName).join(", ")||"none listed";
  const sys = `World-builder for an equatorial castaway island (reef, palms, mangroves, goats, seabirds, jungle cats, parrots, sharks).
Reply ONLY with JSON (no markdown, no reasoning):
{"answer":"one vivid factual sentence","facts":["optional short world lore"],"playerFacts":["optional durable facts about the player's body/clothing/held state"],"entities":[{"id":"snake_case","name":"display name","portable":true|false,"held":true|false,"desc":"one short line"}]}
Rules: no cold/volcanic life, no magic. Entities only if visible/usable now. portable=true for pickups. held:true when the player is making, wearing, wielding, or already holding it (goes to inventory, not the ground). playerFacts for clothing/body/held state the game must remember (e.g. "you are wearing one sock"). Keep JSON complete and short.
CONSTRAINTS: ${SPEC.constraints.join(" ")}
PLACE: ${node().name}
VISIBLE: ${here}
INVENTORY: ${S.inv.map(itemName).join(", ")||"empty"}
LORE:\n${relevant||"(none)"}
RECENT:\n${recent||"(none)"}`;
  const c = await llmText(sys, text, 450);
  if(!c) return null;
  const j = salvageLoreJSON(c);
  if(j && j.answer){
    if(isJsonDump(j.answer)) j.answer = "";
    else j.answer = cleanGeneration(j.answer) || j.answer;
    if(/need to keep|consistent with constraints|should mention|according to the rules|entity wasn/i.test(j.answer)) j.answer = "";
    return j;
  }
  if(isJsonDump(c)) return null;
  const cleaned = cleanGeneration(c);
  return cleaned ? {answer:cleaned, facts:[], playerFacts:[], entities:[]} : null;
}

async function genEmergent(query){
  const sys = `Narrate one short outcome for a castaway on an equatorial island.
Return ONLY JSON: {"text":"1-2 sentences","lifeDelta":0,"consumeItem":null|"item_id","lore":null|"short fact"}
Allowed lifeDelta: -15..+5. consumeItem only if item is in inventory. No magic. No inventing new inventory except consume.
Place: ${node().name}. Inventory: ${S.inv.map(itemName).join(", ")||"empty"}.`;
  const c = await llmText(sys, "Player attempts: "+query, 160);
  const j = extractJSON(c||"");
  if(!j || !j.text) return {ok:false, text:"Nothing comes of it.", cls:"warn"};
  const text = cleanGeneration(j.text) || j.text;
  if(typeof j.lifeDelta==="number" && j.lifeDelta>=-15 && j.lifeDelta<=5) lifeDelta(j.lifeDelta);
  if(j.consumeItem && hasItem(j.consumeItem)){
    const i=S.inv.indexOf(j.consumeItem); if(i>=0) S.inv.splice(i,1);
  }
  tick(); ageWreck(1);
  return {ok:true, text, cls:"fog", lore: j.lore||null};
}

// LLM validates improvise pass/fail given materials brief. Engine commits on pass only.
async function genImprovise(query){
  const here = (node().items||[]).filter(i=>!hasItem(i)).map(itemName).join(", ")||"none listed";
  const inv = S.inv.map(itemName).join(", ")||"empty";
  const playerLore = LORE.retrieve("player wearing holding carrying "+query, 6)
    .filter(n => (n.tags||[]).includes("player") || (n.tags||[]).includes("state") || /you (are|were|have)|wearing|holding/i.test(n.text))
    .map(n=>"- "+n.text).join("\n");
  const relevant = LORE.retrieve(query+" "+node().name, 4).map(n=>"- "+n.text).join("\n");
  const sys = `You are the DM validator for improvised crafting on an equatorial castaway island.
The player proposes an assembly. Pass ONLY if every needed material is in INVENTORY, VISIBLE at the place, OR clearly explained in their words (e.g. tear cloth from shirt, find vines as cord, pick a beach rock).
Fail if a material is missing and unexplained. No magic. Do not invent wreck cargo they did not salvage. Do not grant leave-island shortcuts.
Reply ONLY with JSON:
{"ok":true|false,"answer":"one vivid in-world sentence (pass narrates success; fail names what is missing or unexplained)","result":{"id":"snake_case","name":"display","desc":"one line"}|null,"consume":["optional inventory id to spend"],"playerFacts":["optional durable player-state fact"],"why":null|"short reason"}
On pass, result is the finished held item. consume only real inventory ids. On fail, result null and consume [].
CONSTRAINTS: ${SPEC.constraints.join(" ")}
PLACE: ${node().name}
VISIBLE: ${here}
INVENTORY: ${inv}
PLAYER STATE:\n${playerLore||"(none)"}
LORE:\n${relevant||"(none)"}`;
  const c = await llmText(sys, "Player attempts: "+query, 400);
  if(!c) return { ok:false, answer:"Nothing comes of it — the voice will not judge the work.", why:"unavailable" };
  const j = salvageImproviseJSON(c);
  if(!j) return { ok:false, answer:"Nothing comes of it.", why:"parse" };
  if(j.answer) j.answer = cleanGeneration(j.answer) || j.answer;
  if(j.ok && (!j.result || !j.result.id)){
    return { ok:false, answer: j.answer || "The work does not hold together.", why: j.why || "no result" };
  }
  return j;
}

function applyImproviseResult(out){
  if(!out || !out.ok || !out.result) return false;
  const id = String(out.result.id).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
  if(!id) return false;
  registerItem(id, out.result.name||id, out.result.desc||("You fashioned "+(out.result.name||id)+"."), ["generated","improvised"], {portable:true});
  if(!hasItem(id)){ S.inv.push(id); debugEvent("inv: +"+id); }
  const n = node();
  if(n.items){ const ix = n.items.indexOf(id); if(ix>=0) n.items.splice(ix,1); }
  for(const cid of (out.consume||[])){
    const key = String(cid).toLowerCase().replace(/[^a-z0-9]+/g,"_");
    const idx = S.inv.findIndex(i => i===key || i===cid || itemName(i).toLowerCase()===String(cid).toLowerCase());
    if(idx>=0) S.inv.splice(idx,1);
  }
  tick(); ageWreck(1);
  return true;
}

// The engine's validator: a proposed new place must respect the rules before it is added.
function validateNewPlace(prop){
  // prop: {id, name, desc, dirBack} — dirBack is the exit key from the new node back to current
  if(!prop || !prop.id || !prop.name) return { ok:false, why:"incomplete proposal" };
  if(WORLD.nodes[prop.id]) return { ok:false, why:"a place by that name already exists" };
  // rule: no leaving the island until the craft is built/launched
  const low = (prop.desc||"").toLowerCase() + " " + (prop.name||"").toLowerCase();
  if(/mainland|another island|open ocean|escape the island|distant shore|continent/.test(low)
     && !S.flags.craftBuilt){
    return { ok:false, why:"the rules forbid leaving the island until the craft is built and launched" };
  }
  // rule: ecology self-consistency — reject obviously cold/volcanic/impossible descriptors
  if(/volcanic|glacier|polar|tundra|permafrost|ice sheet|snow/.test(low)){
    return { ok:false, why:"that contradicts the equatorial island ecology" };
  }
  return { ok:true };
}

// Generate a new place adjacent to the current node, validated before adding.
async function genPlace(query){
  const sys = `You are expanding the map of York: The Wreck of the Meridian, a castaway on an equatorial island (reef, palms, mangroves). `+
    `The player is at "${node().name}". Propose ONE new place the player could discover here, consistent with the rules. `+
    `Return ONLY JSON: {"id":"snake_case_id","name":"Short Name","desc":"one sentence, equatorial island, no cold/volcanic life or magic","dirBack":"the exit key from the new place back to the current node (e.g. south)"}. `+
    `Rules: ${SPEC.constraints.join(" ")} Do not propose leaving the island (no mainland/ocean escape) unless the craft is already built.`;
  try{
    const raw = await llmText(sys, query||"What is there to discover here?", 200);
    if(!raw) return { ok:false, why:"LLM unavailable" };
    const prop = extractJSON(raw) || extractJSON(cleanGeneration(raw));
    if(!prop) return { ok:false, why:"could not parse the proposed place" };
    // engine validates against the ruleset
    const v = validateNewPlace(prop);
    if(!v.ok) return v;
    // add the node, linked back to current location
    const dirBack = prop.dirBack || "back";
    const exitKey = "discover_"+prop.id;
    WORLD.nodes[prop.id] = { name:prop.name, desc:prop.desc||"", exits:{ [dirBack]: S.loc } };
    WORLD.nodes[S.loc].exits[exitKey] = prop.id;
    commitLore("place:"+prop.id, `${prop.name}: ${prop.desc||""}`, { id:"place_"+prop.id, tags:["place","generated"] });
    return { ok:true, prop, exitKey };
  }catch(e){ return { ok:false, why:"error" }; }
}

function flattenActions(parsed){
  if(!parsed) return [];
  if(Array.isArray(parsed.actions)){
    const out=[];
    for(const a of parsed.actions){
      if(a && a.actions) out.push(...flattenActions(a));
      else if(a) out.push(a);
    }
    return out;
  }
  return [parsed];
}

function normalizeParsed(a, fallbackSay){
  let action = String(a.action||"look").toLowerCase();
  let target = a.target||null;
  const say = a.say||fallbackSay||"";
  // engine guard: salvage is wreck-cargo only; scavenging beach junk is take
  if(action==="salvage" && target && !/^(tools|sailcloth|provisions|rifle|radio)$/i.test(String(target).trim())){
    action = "take";
  }
  // floor: craft/assemble misrouted as use/ask/build → improvise
  if(say && isImproviseIntent(say) && !isSiteBuild(say) && ["use","ask","build"].includes(action)){
    action = "improvise";
  }
  return {
    action,
    target,
    item: a.item||null,
    say: say||null
  };
}


export { WORLD_DOC, offlineParse, buildWorld, ENDINGS };

export function createGame(opts = {}) {
  _storage = opts.storage || defaultStorage();
  _arm = opts.arm || "full";
  _llm = opts.llm || null;
  _onDebug = typeof opts.onDebug === "function" ? opts.onDebug : null;
  _onLoreCommit = typeof opts.onLoreCommit === "function" ? opts.onLoreCommit : null;
  _harvest = [];
  _loreStats = { retrieved: 0, generated: 0, entitiesAdded: 0, placesAdded: 0 };

  function reset(resetOpts = {}) {
    const fresh = !!resetOpts.fresh;
    // rebuild WORLD from WORLD_DOC so map growth cannot leak
    const rebuilt = buildWorld(WORLD_DOC);
    WORLD.nodes = rebuilt.nodes;
    WORLD.items = rebuilt.items;
    WORLD.containers = rebuilt.containers;
    WORLD.companions = rebuilt.companions;
    WORLD.start = rebuilt.start;
    WORLD.maxClock = rebuilt.maxClock;
    // refresh seed snapshot
    const seed = buildWorld(WORLD_DOC);
    WORLD_SEED.nodes = seed.nodes;
    WORLD_SEED.items = seed.items;
    WORLD_SEED.containers = seed.containers;
    WORLD_SEED.companions = seed.companions;

    S = {
      loc: WORLD.start,
      life: 100, warmth: 100, signal: 0, clock: 0,
      wreck: 100,
      night: false,
      inv: [], flags: {}, tame: { cat:0, parrot:0 },
      salvaged: {},
      visited: {},
      ended: false, endKind: null,
      log: [],
      worldDelta: null
    };
    if (fresh) {
      try { _storage.removeItem(GAME_STATE_KEY); } catch (e) {}
    } else {
      const saved = loadState();
      if (saved) {
        Object.assign(S, saved);
        S.inv = S.inv || [];
        S.flags = S.flags || {};
        S.tame = S.tame || { cat:0, parrot:0 };
        S.salvaged = S.salvaged || {};
        S.visited = S.visited || {};
        S.log = S.log || [];
        if (S.worldDelta) applyWorldDelta(WORLD, S.worldDelta);
      }
    }
    // skip pullLore — browser owns shared-tier network
    if (fresh) {
      try { _storage.removeItem(LORE_STORE_KEY + ":" + WORLD_ID); } catch (e) {}
      LORE = new LoreGraph();
      if (resetOpts.seedLoreGraph && typeof resetOpts.seedLoreGraph === "object") {
        LORE.load(resetOpts.seedLoreGraph);
      }
      seedLore(LORE, WORLD_DOC);
    } else {
      LORE = loadLore() || new LoreGraph();
      if (resetOpts.seedLoreGraph && typeof resetOpts.seedLoreGraph === "object") {
        LORE.load(resetOpts.seedLoreGraph);
      }
      seedLore(LORE, WORLD_DOC);
    }
    S.visited[S.loc] = true;
    pushLog("The Meridian is kindling on the reef. You crawl ashore on the Shingle Beach, the only soul left of her.", "sys");
    pushLog("The wreck will not last the day. Salvage what you can — then decide how you leave this place.", "sys");
    _harvest = [];
    _loreStats = { retrieved: 0, generated: 0, entitiesAdded: 0, placesAdded: 0 };
  }

  function observe(mode = "privileged") {
    const n = node();
    const log = (S.log || []).slice(-12).map(e => ({ t: e.t, c: e.c }));
    const meters = {
      life: S.life, wreck: S.wreck, signal: S.signal,
      warmth: S.warmth, clock: S.clock, maxClock: WORLD.maxClock
    };
    if (mode === "blind") {
      return { text: describe().text, log, meters };
    }
    return {
      place: n.name,
      desc: n.desc,
      exits: Object.keys(n.exits || {}),
      itemsHere: (n.items || []).filter(i => !hasItem(i)).map(itemName),
      inventory: S.inv.map(itemName),
      meters,
      flags: { ...S.flags },
      tame: { ...S.tame },
      log
    };
  }

  function act(action) {
    if (!S || S.ended) return { ok: false, text: "The watch is over.", ended: true };
    const step = normalizeParsed(action, action && action.say);
    debugEvent("act: " + step.action + (step.target ? (" " + step.target) : ""));
    const res = applyAction(step);
    if (res.lore) commitLore("turn:" + (S.log.length), res.lore);
    if (S.ended) res.ended = true;
    return res;
  }

  async function genStep(pending) {
    if (!pending) return null;
    if (_arm === "spine") {
      return { kind: "gen", type: pending.type, ok: false, verdict: "skipped" };
    }
    if (!_llm) {
      return { kind: "gen", type: pending.type, ok: false, verdict: "unavailable", why: "no llm" };
    }
    if (S && S.ended) {
      return { kind: "gen", type: pending.type, ok: false, verdict: "unavailable", why: "ended" };
    }

    if (pending.type === "lore") {
      debugEvent("gen: lore — " + String(pending.query || "").slice(0, 80));
      const out = await genLore(pending.query);
      if (!out || !(out.answer || (out.entities && out.entities.length) || (out.facts && out.facts.length) || (out.playerFacts && out.playerFacts.length))) {
        return { kind: "gen", type: "lore", ok: false, verdict: "unavailable", why: "empty" };
      }
      if (out.answer) {
        pushLog(out.answer, "llm");
        commitLore("gen:" + (LORE.seq + 1), out.answer, { tags: ["generated", "lore"], text: out.answer });
        _harvest.push({ kind: "fact", text: out.answer, verdict: "accepted", tags: ["generated", "lore"] });
        _loreStats.generated++;
      }
      for (const f of (out.facts || [])) {
        if (!f || validateFactClient(f)) continue;
        commitLore("gen:" + (LORE.seq + 1), f, { tags: ["generated", "lore"], text: f });
        _harvest.push({ kind: "fact", text: f, verdict: "accepted", tags: ["generated", "lore"] });
        _loreStats.generated++;
      }
      commitPlayerFacts(out);
      const beforeItems = Object.keys(WORLD.items).length;
      applyEntities(out.entities, pending.query);
      bridgeLoreToItems([out.answer].concat(out.facts || []));
      const entitiesAdded = Math.max(0, Object.keys(WORLD.items).length - beforeItems);
      _loreStats.entitiesAdded += entitiesAdded;
      for (const e of (out.entities || [])) {
        if (e && e.id) _harvest.push({ kind: "entity", text: e.name || e.id, meta: e, verdict: "accepted", tags: ["generated"] });
      }
      saveState();
      return {
        kind: "gen", type: "lore", ok: true, verdict: "accepted",
        answer: out.answer, facts: out.facts, entities: out.entities, playerFacts: out.playerFacts
      };
    }

    if (pending.type === "emerge") {
      debugEvent("gen: emerge — " + String(pending.query || "").slice(0, 80));
      const out = await genEmergent(pending.query);
      pushLog(out.text, out.cls || "fog");
      if (out.lore) {
        commitLore("emerge:" + (S.log.length), out.lore);
        _harvest.push({ kind: "emerge_lore", text: out.lore, verdict: "accepted" });
      }
      return {
        kind: "gen", type: "emerge", ok: !!out.ok, verdict: out.ok ? "accepted" : "rejected",
        text: out.text, lifeDelta: undefined, consumeItem: undefined, why: out.ok ? undefined : "nothing"
      };
    }

    if (pending.type === "improvise") {
      debugEvent("gen: improvise — " + String(pending.query || "").slice(0, 80));
      const out = await genImprovise(pending.query);
      const answer = (out && out.answer) || (out && out.ok ? "You finish the work." : "Nothing comes of it.");
      pushLog(answer, out && out.ok ? "llm" : "warn");
      if (out && out.ok) {
        applyImproviseResult(out);
        commitLore("improvise:" + (LORE.seq + 1), answer, { tags: ["generated", "improvise"], text: answer });
        commitPlayerFacts({ answer, playerFacts: out.playerFacts || [], facts: [] });
        if (out.result) {
          _harvest.push({ kind: "entity", text: out.result.name || out.result.id, meta: out.result, verdict: "accepted", tags: ["improvised"] });
          _loreStats.entitiesAdded++;
        }
        _loreStats.generated++;
        saveState();
        return {
          kind: "gen", type: "improvise", ok: true, verdict: "accepted",
          answer, result: out.result, consume: out.consume, playerFacts: out.playerFacts
        };
      }
      return {
        kind: "gen", type: "improvise", ok: false, verdict: "rejected",
        answer, why: (out && out.why) || "failed"
      };
    }

    if (pending.type === "place") {
      debugEvent("gen: place — " + String(pending.query || "").slice(0, 80));
      const gp = await genPlace(pending.query);
      if (gp.ok) {
        pushLog(`You uncover ${gp.prop.name}. ${gp.prop.desc || ""} (go: ${gp.exitKey})`, "llm");
        debugEvent("place: uncovered " + gp.prop.id);
        _loreStats.placesAdded++;
        _harvest.push({
          kind: "place", text: `${gp.prop.name}: ${gp.prop.desc || ""}`,
          meta: gp.prop, verdict: "accepted", tags: ["place", "generated"]
        });
        return {
          kind: "gen", type: "place", ok: true, verdict: "accepted",
          place: gp.prop, exitKey: gp.exitKey
        };
      }
      return {
        kind: "gen", type: "place", ok: false,
        verdict: gp.why === "LLM unavailable" ? "unavailable" : "rejected",
        why: gp.why
      };
    }

    return { kind: "gen", type: pending.type, ok: false, verdict: "rejected", why: "unknown type" };
  }

  function isOver() { return !!(S && S.ended); }
  function ending() { return (S && S.endKind) || null; }
  function metrics() {
    if (!S) return null;
    return {
      life: S.life, wreck: S.wreck, signal: S.signal,
      warmth: S.warmth, clock: S.clock, turns: S.clock
    };
  }
  function loreStats() {
    return {
      nodes: LORE ? Object.keys(LORE.nodes).length : 0,
      retrieved: _loreStats.retrieved,
      generated: _loreStats.generated,
      entitiesAdded: _loreStats.entitiesAdded,
      placesAdded: _loreStats.placesAdded
    };
  }
  function dumpHarvest() { return _harvest.slice(); }
  function exportState() {
    return {
      S: S ? JSON.parse(JSON.stringify(S)) : null,
      LORE: LORE ? LORE.toJSON() : null,
      WORLD: {
        nodes: JSON.parse(JSON.stringify(WORLD.nodes)),
        items: JSON.parse(JSON.stringify(WORLD.items))
      }
    };
  }
  function listContributions() {
    const out = [];
    if (!LORE) return out;
    for (const n of Object.values(LORE.nodes)) {
      if (n.source === "play" || n.source === "generated" || (n.tags && n.tags.includes("generated"))) {
        out.push({
          id: n.id, subject: n.subject, relation: n.relation, object: n.object,
          text: n.text, tags: n.tags || [], source: n.source, world: WORLD_ID
        });
      }
    }
    return out;
  }
  function mergeShared(nodes) {
    let added = 0;
    for (const n of (nodes || [])) {
      if (LORE.nodes[n.id]) continue;
      LORE.commit(n.subject, n.relation, n.object, {
        id: n.id, source: n.source || "shared",
        tags: (n.tags || []).concat("shared"), turn: n.turn || 0
      });
      added++;
    }
    if (added) persistLore();
    return added;
  }
  function appendLog(t, cls) { pushLog(t, cls); }
  function patchLastLog(cls, patch) {
    if (!S || !S.log || !S.log.length) return false;
    for (let i = S.log.length - 1; i >= 0; i--) {
      if (S.log[i].c === cls) {
        Object.assign(S.log[i], patch || {});
        saveState();
        return true;
      }
    }
    return false;
  }
  function parseContext(text) {
    const n = node();
    const ctx = (text || "") + " " + n.name + " " + (S.inv.map(itemName).join(" "));
    return {
      place: n.name,
      exits: Object.keys(n.exits || {}).map(k => k + "→" + WORLD.nodes[n.exits[k]].name).join(", "),
      here: (n.items || []).filter(i => !hasItem(i)).map(itemName).join(", ") || "none listed",
      inventory: S.inv.map(itemName).join(", ") || "empty",
      lore: LORE.retrieve(ctx, 6).map(x => "- " + x.text).join("\n"),
      recent: S.log.slice(-8).map(e => e.t).join("\n"),
      constraints: SPEC.constraints.join(" "),
    };
  }
  function journalNodes() {
    if (!LORE) return [];
    return Object.values(LORE.nodes).filter(n => n.source === "play" || n.source === "generated");
  }
  function journalLinks(id) {
    if (!LORE) return [];
    return LORE.edges.filter(e => e.from === id).map(e => LORE.nodes[e.to]).filter(Boolean);
  }

  // bump retrieve counter when LoreGraph.retrieve is used — wrap once
  const _origRetrieve = LoreGraph.prototype.retrieve;
  if (!_origRetrieve._wrapped) {
    LoreGraph.prototype.retrieve = function (query, k) {
      const r = _origRetrieve.call(this, query, k);
      _loreStats.retrieved += r.length;
      return r;
    };
    LoreGraph.prototype.retrieve._wrapped = true;
  }

  return {
    apiVersion: AGENT_API_VERSION,
    reset, observe, act, genStep,
    isOver, ending, metrics, loreStats, dumpHarvest, exportState,
    listContributions, mergeShared, appendLog, patchLastLog, parseContext, journalNodes, journalLinks,
  };
}
