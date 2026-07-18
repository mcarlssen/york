import { offlineParse } from "../src/engine.js";

export function decideOffline(observation, history) {
  // Prefer look first turn; then try exits[0]; then wait — dumb but deterministic
  if (history.length === 0) return { action: "look", parsedOk: true, usedLLM: false };
  const exits = observation.exits || [];
  if (exits.length) {
    const i = history.length % exits.length;
    return { action: "go", target: exits[i], parsedOk: true, usedLLM: false };
  }
  return { action: "wait", parsedOk: true, usedLLM: false };
}

export function decideOfflineFromText(text) {
  const p = offlineParse(text);
  const a = p.actions ? p.actions[0] : p;
  return { ...a, parsedOk: true, usedLLM: false };
}
