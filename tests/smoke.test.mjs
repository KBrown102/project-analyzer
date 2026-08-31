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
["build-desktop.bat", "build-desktop-ps.bat", "build-exe-electron.bat", "run-local-electron.bat",
  "clean-build.bat"].forEach((rel) =>
  assert(`${rel} exists`, fs.existsSync(path.join(root, rel)))
);

// bat 必须是 GBK，否则中文在 cmd 里会乱码。新增中文 bat 时记得加进这个列表。
["build-desktop.bat", "build-desktop-ps.bat", "build-exe-electron.bat",
  "clean-build.bat", "run-local-electron.bat"].forEach((rel) => {
  const buf = fs.readFileSync(path.join(root, rel));
  const isUtf8Bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  assert(`${rel} not UTF-8-BOM`, !isUtf8Bom);
});

// ---------- Electron 侧的原生扫描 ----------
["build-electron/preload.js", "build-electron/scanner.js", "build-electron/main.js"].forEach((rel) =>
  assert(`${rel} exists`, fs.existsSync(path.join(root, rel)))
);

const pkg = JSON.parse(fs.readFileSync(path.join(root, "build-electron", "package.json"), "utf-8"));
["main.js", "preload.js", "scanner.js", "project-analyzer.html", "icon.ico"].forEach((f) =>
  assert(`package.json files 包含 ${f}`, pkg.build.files.includes(f))
);
const mainJs = fs.readFileSync(path.join(root, "build-electron", "main.js"), "utf-8");
assert("main.js 配了 preload", mainJs.includes("preload"));
assert("main.js 注册了 dialog:openFolder", mainJs.includes("dialog:openFolder"));
assert("main.js 注册了 fs:scan", mainJs.includes("fs:scan"));
const preload = fs.readFileSync(path.join(root, "build-electron", "preload.js"), "utf-8");
assert("preload 暴露 openFolder", preload.includes("openFolder"));
assert("preload 暴露 scan", preload.includes("scan:"));
assert("scanner.js 不依赖 electron（否则没法单测）",
  !/require\(["']electron["']\)/.test(fs.readFileSync(path.join(root, "build-electron", "scanner.js"), "utf-8")));

// 浏览器版与 Electron 版的噪音目录列表必须一致，否则同一目录两条路线结果会不同
function noiseWords(text, re) {
  const m = text.match(re);
  if (!m) return null;
  return m[1].split("|").map((s) => s.trim()).filter(Boolean).sort();
}
// 注意：不能用 [^)]+ —— 列表里有 dist(-.*)? 这种自带括号的项，会提前截断
const htmlNoise = noiseWords(html, /var NOISE = \/\(\^\|\\\/\)\((.+?)\)\(\\\/\|\$\)\//);
const scannerNoise = noiseWords(
  fs.readFileSync(path.join(root, "build-electron", "scanner.js"), "utf-8"),
  /const NOISE_DIR = \/\^\((.+?)\)\$\//
);
assert("取到了 html 的噪音列表", Array.isArray(htmlNoise));
assert("取到了 scanner 的噪音列表", Array.isArray(scannerNoise));
if (htmlNoise && scannerNoise) {
  const onlyHtml = htmlNoise.filter((w) => !scannerNoise.includes(w));
  const onlyScan = scannerNoise.filter((w) => !htmlNoise.includes(w));
  assert(`两边噪音词一致（各 ${htmlNoise.length} 个）`,
    onlyHtml.length === 0 && onlyScan.length === 0,
    `html 多: ${onlyHtml.join(",")} | scanner 多: ${onlyScan.join(",")}`);
}

// ---------- 文档 ----------
assert("README.md exists", fs.existsSync(path.join(root, "README.md")));

if (failed > 0) {
  console.error(`\n${failed} smoke test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll smoke tests passed.");
}
