// Electron 侧的目录扫描测试。scanner.js 刻意不依赖 electron，可以直接在 Node 里跑。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadAnalyzer, createChecker } from "./_harness.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const { scanDir, MAX_DEPTH } = require(path.join(root, "build-electron", "scanner.js"));

const C = createChecker("Scanner tests · Electron 目录扫描");

// 建一棵临时目录树
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pa-scan-"));
const TREE = [
  "proj/package.json",
  "proj/README.md",
  "proj/src/main.js",
  "proj/src/deep/a.js",
  "proj/node_modules/dep/index.js",
  "proj/node_modules/dep/nested/deep.js",
  "proj/dist-out/项目结构分析器-1.0.0.exe",
  "proj/.git/config",
  "proj/docs/guide.md",
];
for (const rel of TREE) {
  const full = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `内容：${rel}\n`, "utf-8");
}
// 造一个大文件，验证不会被读进文本池
fs.writeFileSync(path.join(tmpRoot, "proj/big.js"), "x".repeat(400 * 1024), "utf-8");

const r = await scanDir(path.join(tmpRoot, "proj"));

C.ok("扫描出结果", r && Array.isArray(r.paths));
C.eq("base 取的是目录名", r.base, "proj");

const hasNoise = r.paths.filter((p) => /node_modules|dist-out|\.git\//.test(p));
C.eq("噪音目录一个都没进来", hasNoise.length, 0);
C.ok("正常文件都在",
  ["proj/package.json", "proj/README.md", "proj/src/main.js", "proj/docs/guide.md"]
    .every((p) => r.paths.includes(p)),
  JSON.stringify(r.paths));

C.ok("每条路径都以 base 开头", r.paths.every((p) => p.startsWith("proj/")));
C.ok("路径用正斜杠", r.paths.every((p) => !p.includes("\\")));
C.ok("第一条路径的第一段就是根目录名", r.paths.length > 0 && r.paths[0].split("/")[0] === "proj");

const readPaths = r.texts.map((t) => t.path);
C.ok("读到了 package.json 的内容", readPaths.includes("proj/package.json"));
C.ok("文本文件都进了文本池", readPaths.includes("proj/README.md"));
C.ok("超过 300KB 的大文件不读内容", !readPaths.includes("proj/big.js"));
C.ok("二进制 / 非文本不读内容", !readPaths.some((p) => p.endsWith(".exe")));
C.ok("文本条数有上限", r.texts.length <= 250);

// 深度限制
const deepRoot = path.join(tmpRoot, "deep");
let cur = deepRoot;
for (let i = 0; i < MAX_DEPTH + 4; i++) {
  cur = path.join(cur, "d" + i);
  fs.mkdirSync(cur, { recursive: true });
  fs.writeFileSync(path.join(cur, "f.js"), "var a=1;\n", "utf-8");
}
const dr = await scanDir(deepRoot);
const maxDepthSeen = Math.max(...dr.paths.map((p) => p.split("/").length));
C.ok(`钻到 MAX_DEPTH 就停（实际最深 ${maxDepthSeen} 段）`, maxDepthSeen <= MAX_DEPTH + 1);
C.ok("超深时给出 truncated 标记", dr.truncated === true);

// 不存在的目录不能崩
const missing = await scanDir(path.join(tmpRoot, "根本不存在"));
C.ok("扫描不存在的目录不抛异常", missing !== null);
C.eq("不存在的目录返回空路径", missing.paths.length, 0);

// 空目录
fs.mkdirSync(path.join(tmpRoot, "empty"), { recursive: true });
const empty = await scanDir(path.join(tmpRoot, "empty"));
C.ok("空目录不抛异常", empty && empty.paths.length === 0);

// —— 扫描结果要能直接喂给分析器，且和浏览器版结论一致 ——
const { api } = loadAnalyzer();
const fromScan = await api.analyzeEntries(
  { paths: r.paths, texts: r.texts, source: "electron" },
  "scan"
);
C.ok("扫描结果能被分析器接受", fromScan !== null);
C.eq("source 记为 electron", fromScan.source, "electron");
C.eq("root 取到了", fromScan.root, "proj");
C.ok("判出了 Node 类型", /Node|前端/.test(fromScan.type), fromScan.type);

// 同样的文件走浏览器路线，结论应该一致
const browserFiles = r.paths.map((p) => {
  const rel = p.slice("proj/".length);
  const full = path.join(tmpRoot, "proj", rel);
  return {
    name: path.basename(p),
    size: fs.statSync(full).size,
    webkitRelativePath: p,
    text: () => Promise.resolve(fs.readFileSync(full, "utf-8")),
  };
});
const fromBrowser = await api.analyze(browserFiles, "browser");
C.eq("两条路线文件数一致", fromBrowser.files, fromScan.files);
C.eq("两条路线类型一致", fromBrowser.type, fromScan.type);
C.eq("两条路线模板一致", fromBrowser.profile, fromScan.profile);
C.eq("两条路线阶段完成数一致",
  fromBrowser.phases.list.filter((p) => p.done).length,
  fromScan.phases.list.filter((p) => p.done).length);

fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log(`\n通过 ${C.state.pass} 项，失败 ${C.state.fail} 项`);
if (C.state.fail > 0) {
  console.error("\n失败项：");
  C.state.failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log("All scanner tests passed.");
