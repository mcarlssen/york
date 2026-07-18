function groupByArm(runs) {
  const byArm = { spine: [], full: [], blind: [] };
  for (const run of runs) {
    const arm = run.arm || "spine";
    if (!byArm[arm]) byArm[arm] = [];
    byArm[arm].push(run);
  }
  return byArm;
}

function endingCounts(runs) {
  const counts = {};
  for (const run of runs) {
    const e = run.ending || "unknown";
    counts[e] = (counts[e] || 0) + 1;
  }
  return counts;
}

function avgTurns(runs) {
  if (!runs.length) return 0;
  const total = runs.reduce((n, r) => n + (r.turns ?? 0), 0);
  return total / runs.length;
}

function buildRejectionHotlist(runs) {
  const hot = {};
  for (const run of runs) {
    for (const step of run.trajectory || []) {
      if (step.kind !== "act" || step.result?.ok !== false) continue;
      const action = step.action?.action || "unknown";
      const reason = step.result?.text || "rejected";
      const key = `${action}×${reason}`;
      hot[key] = (hot[key] || 0) + 1;
    }
  }
  return Object.entries(hot)
    .map(([key, count]) => {
      const [action, reason] = key.split("×");
      return { action, reason, count };
    })
    .sort((a, b) => b.count - a.count);
}

function deadActions(runs) {
  const taken = new Set();
  const rejected = new Set();
  for (const run of runs) {
    for (const step of run.trajectory || []) {
      if (step.kind !== "act") continue;
      const action = step.action?.action;
      if (!action) continue;
      taken.add(action);
      if (step.result?.ok === false) rejected.add(action);
    }
  }
  return [...rejected].filter((a) => !taken.has(a) || rejected.has(a));
}

function genSteps(runs) {
  const steps = [];
  for (const run of runs) {
    for (const step of run.trajectory || []) {
      if (step.kind === "gen") steps.push(step);
    }
  }
  return steps;
}

function analyzeMechanics(byArm) {
  const spineRuns = byArm.spine || [];
  return {
    rejectionHotlist: buildRejectionHotlist(spineRuns),
    deadActions: deadActions(spineRuns),
    byArm: Object.fromEntries(
      Object.entries(byArm).map(([arm, runs]) => [
        arm,
        {
          engineRejectTotal: runs.reduce(
            (n, r) => n + (r.failures?.engine_reject || 0),
            0
          ),
          parseFailTotal: runs.reduce(
            (n, r) => n + (r.failures?.parse_fail || 0),
            0
          ),
          runCount: runs.length,
        },
      ])
    ),
  };
}

function analyzeLoop(byArm) {
  const byArmSignals = {};
  for (const [arm, runs] of Object.entries(byArm)) {
    if (!runs.length) continue;
    byArmSignals[arm] = {
      endingCounts: endingCounts(runs),
      avgTurns: avgTurns(runs),
      runCount: runs.length,
      avgClock:
        runs.reduce((n, r) => n + (r.metrics?.clock ?? 0), 0) / runs.length,
    };
  }
  return { byArm: byArmSignals };
}

function analyzeWorld(byArm) {
  const worldArms = ["full", "blind"];
  const runs = worldArms.flatMap((arm) => byArm[arm] || []);
  const gens = genSteps(runs);
  const loreGens = gens.filter((g) => g.type === "lore");
  const placeGens = gens.filter((g) => g.type === "place");
  const loreAccepted = loreGens.filter((g) => g.verdict === "accepted").length;
  const placeAccepted = placeGens.filter((g) => g.verdict === "accepted").length;
  const runsWithPlace = runs.filter((r) =>
    (r.trajectory || []).some(
      (s) => s.kind === "gen" && s.type === "place" && s.verdict === "accepted"
    )
  ).length;

  const byArmWorld = {};
  for (const arm of worldArms) {
    const armRuns = byArm[arm] || [];
    if (!armRuns.length) continue;
    const armGens = genSteps(armRuns);
    byArmWorld[arm] = {
      genCalls: armRuns.reduce((n, r) => n + (r.genCalls || 0), 0),
      loreAcceptRate:
        armGens.filter((g) => g.type === "lore").length > 0
          ? armGens.filter((g) => g.type === "lore" && g.verdict === "accepted")
              .length /
            armGens.filter((g) => g.type === "lore").length
          : null,
      placeAcceptRate:
        armRuns.length > 0
          ? armRuns.filter((r) =>
              (r.trajectory || []).some(
                (s) =>
                  s.kind === "gen" &&
                  s.type === "place" &&
                  s.verdict === "accepted"
              )
            ).length / armRuns.length
          : null,
      entitiesAdded: armRuns.reduce(
        (n, r) => n + (r.loreStats?.entitiesAdded || 0),
        0
      ),
      placesAdded: armRuns.reduce(
        (n, r) => n + (r.loreStats?.placesAdded || 0),
        0
      ),
    };
  }

  return {
    loreAcceptRate: loreGens.length ? loreAccepted / loreGens.length : null,
    placeAcceptRate: runs.length ? runsWithPlace / runs.length : null,
    genTotal: gens.length,
    emergeCount: gens.filter((g) => g.type === "emerge").length,
    byArm: byArmWorld,
  };
}

export function analyze(runs) {
  const byArm = groupByArm(runs);
  return {
    mechanics: analyzeMechanics(byArm),
    loop: analyzeLoop(byArm),
    world: analyzeWorld(byArm),
  };
}
