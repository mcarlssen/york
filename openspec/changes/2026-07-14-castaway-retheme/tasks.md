# Tasks: Castaway retheme

## 1. World document
- [x] Author openspec/world/castaway.json (Crusoe lore, map, ecology, companions, puzzles, endings)

## 2. Engine
- [x] Re-embed WORLD_DOC from castaway.json; buildWorld derives wreck/clock/companions
- [x] New meters: wreck, signal, warmth, clock, tame bonds; newGame init
- [x] Actions: salvage (Wreck's Clock), signal, tame, build (raft/pyre/shelter/balloon), eat/drink
- [x] Endings: rescue_ship, raft_escape, balloon, endure, perish; checkEnd precedence
- [x] Offline parser + LLM schema updated for new verbs; rules precedence preserved

## 3. Validation
- [x] Headless engine tests: all endings reachable; wreck clock; salvage/tame/signal/build/eat
- [ ] Manual play (browser) with and without LLM key

## 4. OpenSpec + repo
- [x] Change proposal/design/tasks + spec deltas
- [x] Update poc/lighthouse-nl/README.md
- [x] Commit on branch; update PR
