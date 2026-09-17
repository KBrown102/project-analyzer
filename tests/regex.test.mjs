// 正则集中管理（REGEXES）的单测。
// 三件事：
//   1. 加载分析器时 checkRegexes 会在 __PA 赋值前自检——一旦有叶子不是 RegExp，
//      loadAnalyzer 就会抛错。这一步本身就构成强断言。
//   2. 显式遍历 REGEXES 所有叶子断言全是 RegExp 实例（双重保险）。
//   3. 关键正则的正例（该匹配的不漏）+ 反例（不该匹配的不误命中）抽查，
//      防提前闭合 / 拼写退化导致的静默失效。
import { loadAnalyzer, createChecker } from "./_harness.mjs";

const C = createChecker("Regex tests · REGEXES 集中管理与自检");
let api;
try {
  ({ api } = loadAnalyzer());
  C.ok("加载分析器（checkRegexes 自检通过）", true);
} catch (e) {
  C.ok("加载分析器（checkRegexes 自检通过）", false, e.message);
  console.error("\nREGEXES 自检失败，后续测试无法进行：" + e.message);
  process.exit(1);
}

// ── 1. REGEXES 已暴露且是对象 ─────────────────────────────────
console.log("\n[1] REGEXES 暴露");
C.ok("__PA.REGEXES 已暴露", api.REGEXES && typeof api.REGEXES === "object");
C.ok("__PA.SCORE_REGISTRY 已暴露", Array.isArray(api.SCORE_REGISTRY) && api.SCORE_REGISTRY.length === 17);
C.ok("__PA.PRIORITY 已暴露", api.PRIORITY && typeof api.PRIORITY === "object");

// ── 2. 递归遍历所有叶子，断言全是 RegExp 实例 ─────────────────
console.log("\n[2] 所有 REGEXES 叶子是 RegExp 实例");
// 注意跨域：REGEXES 在 vm 上下文里创建，regex 是 vm 域的 RegExp，
// 主域的 `v instanceof RegExp` 恒为 false。用 [[Class]] 内部槽判定才准。
function isRegExp(v) {
  return Object.prototype.toString.call(v) === "[object RegExp]";
}
let leafCount = 0, badCount = 0;
const bad = [];
function walk(obj, trail) {
  const keys = Object.keys(obj);
  for (const k of keys) {
    const v = obj[k];
    const p = trail + "." + k;
    if (v && typeof v === "object" && !isRegExp(v)) {
      walk(v, p);
    } else {
      leafCount += 1;
      if (!isRegExp(v)) { badCount += 1; bad.push(p); }
    }
  }
}
walk(api.REGEXES, "REGEXES");
C.ok(`遍历到 ${leafCount} 个正则叶子`, leafCount >= 60, `实际 ${leafCount}`);
C.ok("所有叶子都是 RegExp 实例", badCount === 0, bad.length ? `非正则叶子：${bad.join(", ")}` : "");
C.ok("顶层共享正则齐全（noise/textFile/testDir/ci/readme/src）",
  ["noise","textFile","testDir","ci","readme","src"].every((k) => isRegExp(api.REGEXES[k])));
C.ok("util 子对象齐全且全正则",
  ["indexHtml","packageJson","mdFile","batSh","pagesViews","designDir","frontendExt","singleHtml"]
    .every((k) => isRegExp(api.REGEXES.util[k])));

// ── 3. 关键正则正例：该匹配的不漏 ─────────────────────────────
console.log("\n[3] 正例（该匹配的不漏）");
const positives = [
  ["util.indexHtml", api.REGEXES.util.indexHtml, "index.html"],
  ["util.indexHtml", api.REGEXES.util.indexHtml, "app/index.html"],
  ["util.packageJson", api.REGEXES.util.packageJson, "package.json"],
  ["util.packageJson", api.REGEXES.util.packageJson, "mylib/package.json"],
  ["util.mdFile", api.REGEXES.util.mdFile, "README.md"],
  ["util.mdFile", api.REGEXES.util.mdFile, "docs/UPPER.MD"],   // i 标志
  ["util.batSh", api.REGEXES.util.batSh, "run.bat"],
  ["util.batSh", api.REGEXES.util.batSh, "deploy.sh"],
  ["util.singleHtml", api.REGEXES.util.singleHtml, "index.html"],
  ["util.singleHtml", api.REGEXES.util.singleHtml, "tool.html"],
  ["util.frontendExt", api.REGEXES.util.frontendExt, "App.tsx"],
  ["util.frontendExt", api.REGEXES.util.frontendExt, "page.jsx"],
  ["util.frontendExt", api.REGEXES.util.frontendExt, "Comp.vue"],
  ["util.frontendExt", api.REGEXES.util.frontendExt, "page.svelte"],
  ["util.designDir", api.REGEXES.util.designDir, "design/gdd/core.md"],
  ["util.pagesViews", api.REGEXES.util.pagesViews, "pages/home.tsx"],
  ["util.pagesViews", api.REGEXES.util.pagesViews, "routes/api.js"],
  ["src", api.REGEXES.src, "main.js"],
  ["src", api.REGEXES.src, "App.tsx"],
  ["src", api.REGEXES.src, "player.gd"],
  ["src", api.REGEXES.src, "main.py"],
  ["src", api.REGEXES.src, "main.cs"],
  ["src", api.REGEXES.src, "main.rs"],
  ["noise", api.REGEXES.noise, "app/node_modules/dep/index.js"],
  ["noise", api.REGEXES.noise, "app/.git/config"],
  ["noise", api.REGEXES.noise, "app/dist/bundle.js"],
  ["testDir", api.REGEXES.testDir, "tests/unit.test.js"],
  ["testDir", api.REGEXES.testDir, "src/app.test.js"],
  ["readme", api.REGEXES.readme, "README.md"],
  ["readme", api.REGEXES.readme, "readme.md"],
];
for (const [name, re, sample] of positives) {
  C.ok(`正例 ${name} 命中 "${sample}"`, re.test(sample), `${name} 未命中 ${JSON.stringify(sample)}`);
}

// ── 4. 关键正则反例：不该匹配的不误命中 ───────────────────────
console.log("\n[4] 反例（不该匹配的不误命中）");
const negatives = [
  // indexHtml 只认 index.html，不认别的 html
  ["util.indexHtml", api.REGEXES.util.indexHtml, "tool.html"],
  ["util.indexHtml", api.REGEXES.util.indexHtml, "index.htm"],
  // packageJson 不认子目录里随意的 .json
  ["util.packageJson", api.REGEXES.util.packageJson, "config.json"],
  ["util.packageJson", api.REGEXES.util.packageJson, "tsconfig.json"],
  // mdFile 不认 .markdown 之外的别的扩展名
  ["util.mdFile", api.REGEXES.util.mdFile, "README.txt"],
  ["util.mdFile", api.REGEXES.util.mdFile, "notes.mds"],   // 不该把 mds 当 md
  // batSh 只认 .bat/.sh，不认 .ps1/.cmd
  ["util.batSh", api.REGEXES.util.batSh, "run.ps1"],
  ["util.batSh", api.REGEXES.util.batSh, "build.cmd"],
  // singleHtml 只认「根或单层目录下」的 html；这里取不结束于 .html 的样本作反例
  ["util.singleHtml", api.REGEXES.util.singleHtml, "index.htm"],
  ["util.singleHtml", api.REGEXES.util.singleHtml, "styles/main.css"],
  // frontendExt 不认 .js/.ts（非框架扩展名）
  ["util.frontendExt", api.REGEXES.util.frontendExt, "main.js"],
  ["util.frontendExt", api.REGEXES.util.frontendExt, "app.ts"],
  // src 不认 .md/.json/.html（非源码扩展名）
  ["src", api.REGEXES.src, "README.md"],
  ["src", api.REGEXES.src, "package.json"],
  ["src", api.REGEXES.src, "index.html"],
  // noise 不该把正常目录名当噪音
  ["noise", api.REGEXES.noise, "app/src/main.js"],
  ["noise", api.REGEXES.noise, "mylib/package.json"],
  // testDir 不该把普通 src 文件当测试
  ["testDir", api.REGEXES.testDir, "src/main.js"],
  // readme 不该匹配含 readm 但非 readme 的文件
  ["readme", api.REGEXES.readme, "main.js"],
];
for (const [name, re, sample] of negatives) {
  C.ok(`反例 ${name} 不命中 "${sample}"`, !re.test(sample), `${name} 误命中了 ${JSON.stringify(sample)}`);
}

// ── 5. 每套模板分组齐全（18 套 + generic）──────────────────────
console.log("\n[5] 各模板分组正则齐全");
const profileGroups = ["game","web","server","iac","embedded","extension","data","cli",
  "desktop","mobile","aiml","devops","microservice","lib","mini","tool","meta","generic"];
let groupLeaf = 0;
for (const id of profileGroups) {
  const g = api.REGEXES[id];
  const ok = g && typeof g === "object" && !Array.isArray(g);
  C.ok(`REGEXES.${id} 是分组对象`, ok, `实际 ${typeof g}`);
  if (ok) {
    const subKeys = Object.keys(g);
    C.ok(`REGEXES.${id} 至少有 1 条正则`, subKeys.length >= 1, `实际 ${subKeys.length} 条`);
    groupLeaf += subKeys.length;
  }
}
C.ok(`18 套模板分组共 ${groupLeaf} 条正则`, groupLeaf >= 18, `实际 ${groupLeaf}`);

// ── 汇总 ─────────────────────────────────────────────────────
console.log(`\n通过 ${C.state.pass} 项，失败 ${C.state.fail} 项`);
if (C.state.fail > 0) {
  console.error("\n失败项：");
  C.state.failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log("All regex tests passed.");
