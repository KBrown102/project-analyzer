import fs from "node:fs";
import { execSync } from "node:child_process";

const orig = fs.readFileSync("project-analyzer.html", "utf8");

function runVariation(name, replace, replacement) {
  const modified = orig.replace(replace, replacement);
  if (modified === orig) {
    console.log(name + ": PATTERN NOT FOUND");
    return;
  }
  fs.writeFileSync("project-analyzer.html", modified);
  try {
    const r = execSync("node tests/logic.test.mjs 2>&1", { encoding: "utf8", timeout: 60000 });
    const f = r.split("\n").filter(l => l.includes("✗")).length;
    console.log(name + ": " + (f > 0 ? "CAUGHT (" + f + " failures)" : "MISSED"));
  } catch (e) {
    // exit code 1 = test failed = variation caught
    const r = e.stdout ? e.stdout.toString() : "";
    const f = r.split("\n").filter(l => l.includes("✗")).length;
    console.log(name + ": " + (f > 0 ? "CAUGHT (" + f + " failures)" : "CAUGHT (exit 1)"));
  }
  fs.writeFileSync("project-analyzer.html", orig);
}

// V1: remove .log filter — use string match
runVariation("V1 (remove .log filter)",
  "if (!/\\.log$/i.test(t.path)) continue;",
  "/* V1 */");

// V2: grade threshold
runVariation("V2 (grade 80->60)",
  "if (score >= 80)",
  "if (score >= 60) /* V2 */");

// V3: crashPenalty
runVariation("V3 (penalty - -> +)",
  "- crashPenalty",
  "+ crashPenalty /* V3 */");

// V4: export returns null
runVariation("V4 (export returns null)",
  "if (!items.length) return null;",
  "return null; /* V4 */");

// V5: highlight threshold
runVariation("V5 (highlight 0.8->0.1)",
  "phDone >= phTotal * 0.8",
  "phDone >= phTotal * 0.1 /* V5 */");

console.log("All variations restored.");
