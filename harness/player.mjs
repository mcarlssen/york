import { createHash } from "node:crypto";
import { getActionSchema, WORLD_DOC, ENDINGS } from "../src/engine.js";

const OBSERVE_SCHEMA = {
  privileged: "privileged-v1",
  blind: "blind-v1",
};

function endingSummary() {
  return Object.entries(ENDINGS)
    .map(([kind, [title, tone]]) => `${kind} (${tone}): ${title}`)
    .join("; ");
}

/**
 * Build the LLM system prompt. No god-map / full node list.
 * @param {{ arm: string, observeMode: string, constraints?: string[], title?: string }} opts
 */
export function buildSystemPrompt(opts = {}) {
  const arm = opts.arm || "full";
  const observeMode = opts.observeMode || "privileged";
  const title =
    opts.title ||
    WORLD_DOC.identity?.title ||
    "The Gray Light: Wreck of the Meridian";
  const tagline = WORLD_DOC.identity?.tagline || "";
  const constraints = opts.constraints || WORLD_DOC.constraints || [];
  const actions = getActionSchema().join("|");

  const lines = [
    `You are a castaway playing "${title}".${tagline ? ` ${tagline}` : ""}`,
    "The engine owns truth: meters, map, inventory, endings. You only choose actions.",
    `Constraints: ${Array.isArray(constraints) ? constraints.join(" ") : String(constraints)}`,
    `Actions (JSON only): {"action":"${actions}","target":string|null,"item":string|null,"say":string|null}. Include discover to explore beyond known exits.`,
    `Win/lose: ${endingSummary()}.`,
    `Observe mode: ${observeMode}.`,
  ];

  if (arm === "full" || arm === "blind") {
    lines.push(
      "Explore: ask about the island and use discover to seek new places when the known path feels exhausted."
    );
  }

  return lines.join("\n");
}

export function hashPromptVersion(template, observeSchemaId) {
  return createHash("sha256")
    .update(String(template) + String(observeSchemaId))
    .digest("hex")
    .slice(0, 16);
}

function extractJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeAction(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const action = parsed.action;
  if (!action || typeof action !== "string") return null;
  return {
    action,
    target: parsed.target ?? null,
    item: parsed.item ?? null,
    say: parsed.say ?? null,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function obsUserMessage(observation) {
  return JSON.stringify(observation);
}

/**
 * @param {{ complete: Function, model?: string, transport?: string }} llmClient
 * @param {{ arm?: string, observeMode?: string, PLAYER_MODEL?: string, title?: string, constraints?: string[] }} config
 */
export function createDecideAction(llmClient, config = {}) {
  const arm = config.arm || "full";
  const observeMode = config.observeMode || "privileged";
  const system = buildSystemPrompt({
    arm,
    observeMode,
    title: config.title,
    constraints: config.constraints,
  });
  const schemaId = OBSERVE_SCHEMA[observeMode] || `${observeMode}-v1`;
  const promptVersion = hashPromptVersion(system, schemaId);

  return async function decideAction(observation, _history) {
    const user = obsUserMessage(observation);
    let lastFailure = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await llmClient.complete({
        system,
        user,
        maxTokens: 200,
      });

      if (res.status === "rate_limit") {
        lastFailure = "rate_limit";
        if (attempt === 0) {
          await sleep(200);
          continue;
        }
        return {
          action: "look",
          parsedOk: false,
          failure: "rate_limit",
          abort: "rate_limit",
          promptVersion,
          raw: res.content,
        };
      }

      if (res.status === "transport_fail") {
        lastFailure = "transport_fail";
        if (attempt === 0) continue;
        return {
          action: "look",
          parsedOk: false,
          failure: "transport_fail",
          promptVersion,
          raw: res.content,
        };
      }

      if (res.status === "empty" || !res.content) {
        lastFailure = "empty";
        if (attempt === 0) continue;
        return {
          action: "look",
          parsedOk: false,
          failure: "empty",
          promptVersion,
          raw: res.content,
        };
      }

      const parsed = normalizeAction(extractJsonObject(res.content));
      if (parsed) {
        return {
          ...parsed,
          parsedOk: true,
          promptVersion,
          raw: res.content,
          usedLLM: true,
        };
      }

      lastFailure = "parse_fail";
      // retry once on malformed JSON
    }

    return {
      action: "look",
      parsedOk: false,
      failure: lastFailure || "parse_fail",
      promptVersion,
      raw: null,
    };
  };
}

/** Stable id for the current prompt template + observe schema. */
export function promptVersion(opts = {}) {
  const system = buildSystemPrompt(opts);
  const mode = opts.observeMode || "privileged";
  const schemaId = OBSERVE_SCHEMA[mode] || `${mode}-v1`;
  return hashPromptVersion(system, schemaId);
}
