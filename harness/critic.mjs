/**
 * Optional player-proxy critic (CRITIC_ENABLED).
 * Labeled proxy — not human fun. Never titles a section "Fun."
 */

function sampleRuns(runs, limit = 3) {
  if (!runs.length) return [];
  return runs.slice(0, Math.min(limit, runs.length));
}

function stubSelfReport(run) {
  return {
    runId: run.id,
    text: `ending=${run.ending}; turns=${run.turns}; arm=${run.arm}`,
  };
}

function stubBatchReview(runs, signals) {
  const arms = Object.keys(signals?.loop?.byArm || {});
  return [
    `Sampled ${runs.length} run(s). Arms with loop metrics: ${arms.join(", ") || "none"}.`,
    "Proxy review: goal confusion / stall points not scored without LLM.",
  ].join(" ");
}

/**
 * @param {{ runs: object[], signals: object, config: object, llmClient?: object|null }} opts
 * @returns {Promise<{ label: string, selfReports: object[], review: string }|null>}
 */
export async function runCritic({ runs, signals, config, llmClient = null }) {
  if (!config?.CRITIC_ENABLED) return null;

  const sampled = sampleRuns(runs);
  const selfReports = [];

  for (const run of sampled) {
    if (llmClient?.complete) {
      try {
        const trajTail = (run.trajectory || [])
          .slice(-8)
          .map((s) =>
            s.kind === "act"
              ? `${s.action?.action}${s.result?.ok === false ? " (reject)" : ""}`
              : `${s.kind}:${s.type || ""}`
          )
          .join(", ");
        const r = await llmClient.complete({
          system:
            "You are a playtest proxy (not a human fun score). One short sentence: goal confusion or stall points.",
          user: `ending=${run.ending} turns=${run.turns} recent=[${trajTail}]`,
          maxTokens: 120,
        });
        selfReports.push({
          runId: run.id,
          text: r.content || stubSelfReport(run).text,
        });
        continue;
      } catch {
        /* fall through to stub */
      }
    }
    selfReports.push(stubSelfReport(run));
  }

  let review = stubBatchReview(sampled, signals);
  if (llmClient?.complete) {
    try {
      const r = await llmClient.complete({
        system:
          "You are a playtest proxy reviewer (not human fun). Brief notes on wreck-clock / signal-vs-conceal navigability.",
        user: JSON.stringify({
          endings: sampled.map((x) => ({ id: x.id, ending: x.ending, arm: x.arm })),
          mechanicsSummary: signals?.mechanics?.summary ?? null,
          loopByArm: signals?.loop?.byArm ?? null,
        }),
        maxTokens: 300,
      });
      if (r.content) review = r.content;
    } catch {
      /* keep stub */
    }
  }

  return {
    label: "proxy — not human fun",
    selfReports,
    review,
  };
}
