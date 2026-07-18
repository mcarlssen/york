import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function summarize(section, fallback) {
  if (section?.summary != null) return String(section.summary);
  if (fallback) return fallback;
  return JSON.stringify(section ?? {}, null, 2);
}

function formatProxyNotes(proxyNotes) {
  if (!proxyNotes) return null;
  const lines = ["## Player-proxy notes", "", "_proxy — not human fun_", ""];
  if (typeof proxyNotes === "string") {
    lines.push(proxyNotes);
  } else if (proxyNotes.review) {
    lines.push(String(proxyNotes.review));
  }
  if (proxyNotes.selfReports?.length) {
    lines.push("", "### Per-run self-reports");
    for (const sr of proxyNotes.selfReports) {
      lines.push(`- **${sr.runId || "run"}:** ${sr.text || JSON.stringify(sr)}`);
    }
  }
  return lines.join("\n");
}

/**
 * Write report.md + metrics.json under outDir.
 * @returns {{ reportPath: string, metricsPath: string }}
 */
export function writeReport({
  outDir,
  signals,
  manifest,
  proxyNotes = null,
}) {
  mkdirSync(outDir, { recursive: true });

  const mechanics = signals?.mechanics ?? {};
  const loop = signals?.loop ?? {};
  const world = signals?.world ?? {};

  const execLines = [
    `1. Mechanics: ${summarize(mechanics, "n/a")}`,
    `2. Game loop: ${summarize(loop, "n/a")}`,
    `3. World & lore: ${summarize(world, "n/a")}`,
  ];

  const md = [
    "# Playtest report",
    "",
    "## Executive",
    "",
    ...execLines,
    "",
    "## Mechanics",
    "",
    summarize(mechanics),
    "",
    "## Game loop",
    "",
    summarize(loop),
    "",
    "## World",
    "",
    summarize(world),
    world.harvestPath ? `\nHarvest: \`${world.harvestPath}\`` : "",
    "",
  ];

  const proxySection = formatProxyNotes(proxyNotes);
  if (proxySection) {
    md.push(proxySection, "");
  }

  md.push(
    "## Manifest",
    "",
    `promptVersion: \`${manifest?.promptVersion ?? "unknown"}\``,
    "",
    "```json",
    JSON.stringify(manifest ?? {}, null, 2),
    "```",
    ""
  );

  const reportPath = join(outDir, "report.md");
  const metricsPath = join(outDir, "metrics.json");
  writeFileSync(reportPath, md.filter((l) => l !== undefined).join("\n"));
  writeFileSync(
    metricsPath,
    JSON.stringify(
      {
        signals,
        manifest,
        proxyNotes: proxyNotes
          ? { enabled: true, label: "proxy — not human fun" }
          : null,
      },
      null,
      2
    )
  );

  return { reportPath, metricsPath };
}
