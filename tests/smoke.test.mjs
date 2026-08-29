import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    failed += 1;
  }
}

console.log("Smoke tests · 项目结构分析器");

// ---------- 分析器本体 ----------
const htmlPath = path.join(root, "project-analyzer.html");
const html = fs.readFileSync(htmlPath, "utf-8");
assert("project-analyzer.html exists", fs.existsSync(htmlPath));
assert("project-analyzer.html > 10KB", html.length > 10_000);
assert("has analyze()", html.includes("function analyze("));
assert("has buildData()", html.includes("function buildData("));
assert("has detectType()", html.includes("function detectType("));
assert("has detectProfile()", html.includes("function detectProfile("));
assert("has detectPhases()", html.includes("function detectPhases("));
assert("has detectArtifacts()", html.includes("function detectArtifacts("));
assert("has comparison mode", html.includes("compareMode") || html.includes("对比"));

// ---------- 七套模板必须齐全 ----------
const profiles = ["game", "web", "lib", "mini", "tool", "meta", "generic"];
profiles.forEach((id) => {
  assert(`profile ${id} defined`, new RegExp(`\\n\\s+${id}:\\s*\\{`).test(html));
  assert(`profile ${id} listed in order`, html.includes(`"${id}"`));
});
const advises = [
  "adviceGame", "adviceWeb", "adviceLib",
  "adviceMini", "adviceTool", "adviceMeta", "adviceGeneric",
];
advises.forEach((fn) => assert(`${fn}() defined`, new RegExp(`function\\s+${fn}\\s*\\(`).test(html)));

// 旧的单套流程不应残留
assert("no legacy genAdvice", !/\bgenAdvice\b/.test(html));
assert("no legacy PHASES array", !/\bPHASES\b/.test(html));
assert("no legacy ARTIFACTS array", !/\bARTIFACTS\b/.test(html));

// ---------- 打包与图标资产 ----------
["build-electron/main.js", "build-electron/package.json", "assets/icon.ico", "assets/make-icon.py"].forEach((rel) =>
  assert(`${rel} exists`, fs.existsSync(path.join(root, rel)))
);
["build-desktop.bat", "build-desktop-ps.bat", "build-exe-electron.bat", "run-local-electron.bat", "clean-build.bat"].forEach((rel) =>
  assert(`${rel} exists`, fs.existsSync(path.join(root, rel)))
);

// bat 必须是 GBK，否则中文在 cmd 里会乱码
["build-desktop.bat", "build-exe-electron.bat", "clean-build.bat", "run-local-electron.bat"].forEach((rel) => {
  const buf = fs.readFileSync(path.join(root, rel));
  const isUtf8Bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  assert(`${rel} not UTF-8-BOM`, !isUtf8Bom);
});

// ---------- 文档 ----------
assert("README.md exists", fs.existsSync(path.join(root, "README.md")));

if (failed > 0) {
  console.error(`\n${failed} smoke test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll smoke tests passed.");
}
