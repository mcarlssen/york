import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveHarvestDir(harvestDir) {
  if (!harvestDir) return join(REPO_ROOT, "harness/harvest");
  return isAbsolute(harvestDir) ? harvestDir : join(REPO_ROOT, harvestDir);
}

export function normalizeText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function candidateFromGenStep(step, run) {
  if (step.verdict !== "accepted") return null;

  if (step.type === "lore") {
    const text = step.answer || (step.facts && step.facts[0]);
    if (!text) return null;
    return {
      kind: "fact",
      text,
      meta: { answer: step.answer, facts: step.facts },
      runId: run.id,
      verdict: step.verdict,
      tags: ["generated", "lore"],
    };
  }

  if (step.type === "place" && step.place) {
    const text = `${step.place.name}: ${step.place.desc || ""}`.trim();
    return {
      kind: "place",
      text,
      meta: step.place,
      runId: run.id,
      verdict: step.verdict,
      tags: ["place", "generated"],
    };
  }

  if (step.type === "emerge" && step.text) {
    return {
      kind: "emerge_lore",
      text: step.text,
      meta: {},
      runId: run.id,
      verdict: step.verdict,
      tags: ["emerge"],
    };
  }

  return null;
}

export function collectCandidates(runs) {
  const candidates = [];
  for (const run of runs) {
    if (run.arm === "spine") continue;
    for (const step of run.trajectory || []) {
      if (step.kind !== "gen") continue;
      const c = candidateFromGenStep(step, run);
      if (c) candidates.push(c);
    }
    for (const h of run.harvest || []) {
      if (h.verdict !== "accepted") continue;
      candidates.push({
        kind: h.kind,
        text: h.text,
        meta: h.meta || {},
        runId: run.id,
        verdict: h.verdict,
        tags: h.tags || [],
      });
    }
  }
  return candidates;
}

export function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const key = `${c.kind}:${normalizeText(c.text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function writeHarvest(batchId, runs, config = {}) {
  const harvestDir = resolveHarvestDir(config.HARVEST_DIR);
  mkdirSync(harvestDir, { recursive: true });

  const worldRuns = runs.filter((r) => r.arm === "full" || r.arm === "blind");
  const metaRun = worldRuns[0] || runs[0] || {};
  const candidates = dedupeCandidates(collectCandidates(runs));

  const payload = {
    batchId,
    promptVersion: metaRun.promptVersion || null,
    model: metaRun.model || null,
    candidates,
  };

  const path = join(harvestDir, `${batchId}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return path;
}
