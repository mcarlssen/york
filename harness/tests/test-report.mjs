import assert from "node:assert/strict";
import { writeReport } from "../report.mjs";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "york-report-"));
const { reportPath, metricsPath } = writeReport({
  outDir: dir,
  signals: {
    mechanics: { summary: "ok" },
    loop: { summary: "ok" },
    world: { summary: "ok", harvestPath: "harness/harvest/x.json" },
  },
  manifest: { promptVersion: "abc", runs: [] },
  proxyNotes: null,
});
const md = readFileSync(reportPath, "utf8");
assert.match(md, /Mechanics/);
assert.match(md, /Game loop/);
assert.match(md, /World/);
assert.doesNotMatch(md, /^## Fun/m);
console.log("test-report: ok");
