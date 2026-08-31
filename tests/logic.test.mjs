// 真实行为测试：把 script 抽出来在 vm 里执行，喂假目录进去，断言分析结果。
// 与 smoke.test.mjs 的区别——这里测的是「分析得对不对」，不是「文件在不在」。
import fs from "node:fs";
import path from "node:path";
import { loadAnalyzer, fakeTree, createChecker, root } from "./_harness.mjs";

const { api } = loadAnalyzer();
const C = createChecker("Logic tests · 项目结构分析器（真实执行分析逻辑）");

const PROFILE_ORDER = ["game", "web", "lib", "mini", "tool", "meta", "generic"];
const PRI_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** 跑一次完整分析，返回 buildData 的结果对象。 */
async function run(tree, label, profileId) {
  return api.analyze(fakeTree(tree), label, profileId || null);
}

// ── 假项目：一套模板一个，外加刻意造的边界情况 ──────────────────

const FIX = {
  // Godot 游戏 → game
  game: {
    "mygame/project.godot": 'config_version=5\n[application]\nrun/main_scene="res://src/main.tscn"',
    "mygame/README.md": "# 我的游戏\n\n一个横版动作游戏。",
    "mygame/design/gdd/core.md": "# GDD · 核心循环\n\n玩家在关卡中收集零件，躲避守卫。",
    "mygame/docs/architecture.md": "# 架构\n\n状态机 + ECS。",
    "mygame/src/player.gd": "extends KinematicBody2D\nfunc _process(d): pass\n",
    "mygame/.github/workflows/ci.yml": "name: CI\non: [push]\n",
  },

  // React Web 应用 → web
  web: {
    "app/package.json": JSON.stringify({ name: "app", dependencies: { react: "^18" } }),
    "app/README.md": "# App\n\n一个管理后台。",
    "app/pages/index.tsx": "export default function P(){ return <div>hi</div>; }\n",
    "app/src/App.tsx": "export default function App(){ return <div/>; }\n",
  },

  // 带 main/types 的 npm 包 → lib
  lib: {
    "mylib/package.json": JSON.stringify({ name: "mylib", main: "dist/index.js", types: "dist/index.d.ts" }),
    "mylib/README.md": "# mylib\n\n工具函数集合。",
    "mylib/CHANGELOG.md": "# Changelog\n\n## 1.0.0\n",
    "mylib/src/index.ts": "export function add(a,b){ return a+b; }\n",
    "mylib/dist/index.d.ts": "export declare function add(a: number, b: number): number;\n",
    "mylib/examples/demo.js": "const { add } = require('../dist/index.js');\n",
    "mylib/test/index.test.js": "test('add', () => {});\n",
  },

  // 单文件 HTML 小游戏 → mini
  mini: {
    "fish/index.html": [
      "<!DOCTYPE html><meta name='viewport' content='width=device-width'>",
      "<canvas id='c'></canvas><script>",
      "function loop(){ update(); requestAnimationFrame(loop); }",
      "addEventListener('pointerdown', start);",
      "var TXT_INTRO='怎么玩：点击水面投喂';",
      "var TXT_OVER='再来一次';",
      "</script>",
    ].join("\n"),
    "fish/README.md": "# 喂鱼\n\n点水面投喂。",
  },

  // python 小工具 → tool
  tool: {
    "mytool/run.bat": "@echo off\npython main.py\n",
    "mytool/README.md": "# mytool\n\n批量重命名工具。",
    "mytool/main.py": "import os\ndef main():\n    pass\n",
  },

  // 规则 / 文档仓库 → meta
  meta: {
    "myrules/README.md": "# 规则库\n\n团队约定集合。",
    "myrules/OVERVIEW.md": "# 总览\n\n这里沉淀所有约定。",
    "myrules/rules/naming.md": "# 命名约定\n",
    "myrules/references/ref-a.md": "# 参考 A\n",
    "myrules/design/design-b.md": "# 设计 B\n",
    "myrules/docs/doc-c.md": "# 文档 C\n",
  },

  // 一堆 C# 源码、没有 package.json / index.html → generic
  generic: {
    "myproj/README.md": "# myproj\n",
    "myproj/src/main.cs": "class Main {}\n",
    "myproj/src/util.cs": "class Util {}\n",
    "myproj/src/model.cs": "class Model {}\n",
    "myproj/src/view.cs": "class View {}\n",
    "myproj/src/ctrl.cs": "class Ctrl {}\n",
    "myproj/src/svc.cs": "class Svc {}\n",
    "myproj/src/dao.cs": "class Dao {}\n",
    "myproj/src/dto.cs": "class Dto {}\n",
    "myproj/src/api.cs": "class Api {}\n",
    "myproj/src/core.cs": "class Core {}\n",
  },
};

// ── 1. 每套模板都能被自动识别出来 ──────────────────────────────
console.log("\n[1] 模板自动识别");
const detected = {};
for (const id of PROFILE_ORDER) {
  const d = await run(FIX[id], `auto-${id}`);
  detected[id] = d;
  C.eq(`${id} → profile`, d.profile, id);
}
C.ok("七个 fixture 判出七种模板，无重复",
  new Set(Object.values(detected).map((d) => d.profile)).size === 7,
  [...new Set(Object.values(detected).map((d) => d.profile))].join(","));

// ── 2. 类型识别 ────────────────────────────────────────────────
console.log("\n[2] 项目类型识别");
C.eq("Godot", detected.game.type, "Godot 游戏");
C.eq("前端工程", detected.web.type, "Node / 前端工程");
C.eq("Python", detected.tool.type, "Python 项目");
C.eq("规则仓库", detected.meta.type, "规则 / 文档仓库");
C.eq("HTML5 小游戏", detected.mini.type, "HTML5 网页项目");
C.eq("未识别", detected.generic.type, "未识别类型");

// ── 3. 结果结构完整性 ──────────────────────────────────────────
console.log("\n[3] 结果结构");
const d0 = detected.game;
["label", "root", "name", "files", "dirs", "exts", "profile", "profileName", "profileTag",
  "auto", "type", "phases", "artifacts", "eng", "has", "intro", "advice"].forEach((k) => {
  C.ok(`d.${k} 存在`, d0[k] !== undefined && d0[k] !== null);
});
C.eq("root 取的是顶层目录名", d0.root, "mygame");
C.ok("root 不含斜杠", !d0.root.includes("/"));
C.ok("exts 是 {ext,n} 数组且按数量降序",
  Array.isArray(d0.exts) && d0.exts.every((e) => e.ext && typeof e.n === "number") &&
  d0.exts.every((e, i) => i === 0 || d0.exts[i - 1].n >= e.n));
C.ok("has 映射与 artifacts 一致",
  d0.artifacts.every((a) => d0.has[a.key] === a.has));
C.ok("intro 有 title 字段", typeof d0.intro.title === "string");
C.ok("dirs 统计出了子目录", d0.dirs >= 3, `实际 ${d0.dirs}`);

// ── 4. 阶段链 ──────────────────────────────────────────────────
console.log("\n[4] 阶段链推进");
const ph = detected.game.phases;
C.ok("list 长度等于模板阶段数",
  ph.list.length === api.PROFILES.game.phases.length, `实际 ${ph.list.length}`);
const byName = (n) => ph.list.find((p) => p.name === n);
C.ok("系统设计 已完成（design/gdd 命中）", byName("系统设计").done, JSON.stringify(byName("系统设计")));
C.ok("技术搭建 已完成（docs/architecture 命中）", byName("技术搭建").done);
C.ok("制作 已完成（src/ 命中）", byName("制作").done);
C.ok("概念 未完成（没写立项文档）", !byName("概念").done);
C.ok("发布 未完成", !byName("发布").done);
C.eq("lastDone = 制作(5)", ph.lastDone, 5);
C.eq("cur 指向打磨(6)", ph.cur, 6);
C.ok("cur 标记只落在一个阶段上",
  ph.list.filter((p) => p.cur).length === 1);
C.ok("已完成阶段都带证据路径",
  ph.list.filter((p) => p.done).every((p) => typeof p.evidence === "string" && p.evidence.length > 0));
C.ok("未完成阶段 evidence 为 null",
  ph.list.filter((p) => !p.done).every((p) => p.evidence === null));

// ── 5. 产物清单 ────────────────────────────────────────────────
console.log("\n[5] 产物清单");
const art = detected.mini.artifacts;
const artBy = (k) => art.find((a) => a.key === k);
C.ok("入口 index.html 命中", artBy("ENTRY").has);
C.ok("开始页说明 命中（正文含『怎么玩』）", artBy("INTRO").has);
C.ok("体验闭环 命中（正文含『再来一次』）", artBy("LOOP").has);
C.ok("帧率控制 命中（requestAnimationFrame）", artBy("PERF").has);
C.ok("移动端适配 命中（viewport）", artBy("RESP").has);
C.ok("零外部依赖 命中（neg 项：正文没有 CDN 链接）", artBy("SELF").has);

const cdnTree = {
  "cdnapp/index.html": "<canvas></canvas><script src='https://cdn.jsdelivr.net/npm/x@1'></script>",
};
const dCdn = await run(cdnTree, "cdn");
C.ok("引了 CDN 时 零外部依赖 判定为缺失（neg 生效）",
  dCdn.artifacts.find((a) => a.key === "SELF").has === false);

// neg 字段不能被搞反：每个 neg 项的 has 必须与 evidence 相反
console.log("\n[5b] neg 语义");
let negChecked = 0;
for (const id of PROFILE_ORDER) {
  const pr = api.getProfile(id);
  pr.artifacts.filter((a) => a.neg).forEach((a) => {
    const got = detected[id].artifacts.find((x) => x.key === a.key);
    negChecked += 1;
    C.ok(`${id}.${a.key} neg 语义正确（命中=缺失）`, got.has === !got.evidence);
  });
}
C.ok(`至少覆盖到 ${negChecked} 个 neg 项`, negChecked >= 1);

// ── 6. 强制换模板 ──────────────────────────────────────────────
console.log("\n[6] 强制指定模板");
C.eq("强制 game 生效", (await run(FIX.game, "force-1", "web")).profile, "web");
C.eq("强制 meta 生效", (await run(FIX.web, "force-2", "meta")).profile, "meta");
C.ok("auto 字段仍记录自动判定结果",
  (await run(FIX.web, "force-3", "meta")).auto === "web");

// buildData 不重读文件，直接按缓存重算
const reGame = api.buildData("force-1", "game");
C.eq("buildData 换模板后 profile 跟着变", reGame.profile, "game");
C.ok("buildData 结果仍是完整对象",
  reGame && reGame.phases && reGame.artifacts && Array.isArray(reGame.advice));

// ── 7. advice 输出 ─────────────────────────────────────────────
console.log("\n[7] advice 建议");
for (const id of PROFILE_ORDER) {
  const d = detected[id];
  const adv = d.advice;
  C.ok(`${id} advice 是数组`, Array.isArray(adv));
  C.ok(`${id} advice 每项字段齐全`,
    adv.every((a) => a.pri && a.tag && a.title && a.detail && a.why));
  C.ok(`${id} advice 按优先级排序`,
    adv.every((a, i) => i === 0 || PRI_ORDER[adv[i - 1].pri] <= PRI_ORDER[a.pri]));
  C.ok(`${id} advice 无重复标题`,
    new Set(adv.map((a) => a.title)).size === adv.length);
}

// 空项目应当给出大量建议，且必须包含 P0 的 README
const bare = await run({ "bare/src/a.js": "var a=1;\n" }, "bare");
C.ok("极简项目有建议输出", bare.advice.length > 0);
C.ok("缺 README 时给出 P0 建议",
  bare.advice.some((a) => a.pri === "P0" && /README/.test(a.title)));

// 上面那批 fixture 的 advice 恰好本来就有序，排序断言形同虚设。
// 这个是刻意造的乱序样本：phaseGap 先产出 P1/P2，README 的 P0 排在后面，
// 只有 sortAdv 真的生效，P0 才会跑到最前面。
const unsorted = await run({
  "g2/project.godot": "config_version=5\n",
  "g2/design/gdd/core.md": "# GDD\n",
  "g2/docs/architecture.md": "# 架构\n",
  "g2/src/player.gd": "extends Node\n",
}, "unsorted");
C.eq("乱序样本判为 game", unsorted.profile, "game");
C.ok("乱序样本确实会产出 P0 与 P2 建议",
  unsorted.advice.some((a) => a.pri === "P0") && unsorted.advice.some((a) => a.pri === "P2"));
C.eq("P0 被排到最前（sortAdv 生效）", unsorted.advice[0].pri, "P0");
C.ok("整条建议单调不降",
  unsorted.advice.every((a, i) => i === 0 || PRI_ORDER[unsorted.advice[i - 1].pri] <= PRI_ORDER[a.pri]),
  JSON.stringify(unsorted.advice.map((a) => a.pri)));

// ── 8. NOISE 过滤 ──────────────────────────────────────────────
console.log("\n[8] 噪声目录过滤");
const noisy = await run({
  "app/README.md": "# app\n",
  "app/src/main.js": "var a=1;\n",
  "app/node_modules/dep/index.js": "module.exports=1;\n",
  "app/node_modules/dep/sub/deep.js": "module.exports=2;\n",
  "app/.git/config": "[core]\n",
  "app/dist/bundle.js": "var b=1;\n",
}, "noisy");
C.eq("node_modules / .git / dist 全被过滤，只剩 2 个文件", noisy.files, 2);

const allNoise = await run({
  "app/node_modules/dep/index.js": "module.exports=1;\n",
}, "all-noise");
C.eq("全是噪声目录时 analyze 返回 null", allNoise, null);

const emptyList = await api.analyze([], "empty");
C.eq("空文件列表返回 null", emptyList, null);

// 已知边界：NOISE 按「路径任意一段」匹配，顶层目录名本身撞上噪声词时整棵都会没掉。
// 这里不是断言它「应该」这样，而是把这个行为钉住——哪天改了正则，测试会提醒你复查。
const topNoise = await run({
  "dist/README.md": "# 我的顶层目录就叫 dist\n",
  "dist/src/main.js": "var a=1;\n",
}, "top-noise");
C.eq("顶层目录名撞噪声词 → 整棵被过滤，返回 null", topNoise, null);

// ── 9. 工程化指标 ──────────────────────────────────────────────
console.log("\n[9] 工程化指标");
C.ok("game 有 CI", detected.game.eng.ci === true);
C.ok("game 无测试", detected.game.eng.test === 0);
C.ok("lib 有测试", detected.lib.eng.test >= 1);
C.ok("web 读到 package.json", detected.web.eng.pkg === true);
C.eq("web 依赖数", detected.web.eng.deps, 1);
C.ok("game 有 README", detected.game.eng.readme === true);
C.ok("tool 无 CI", detected.tool.eng.ci === false);

// ── 10. 鲁棒性：畸形输入不能抛 ─────────────────────────────────
console.log("\n[10] 鲁棒性");
const brokenPkg = await run({
  "bad/package.json": "{ 这不是合法 JSON ]]]",
  "bad/README.md": "# bad\n",
  "bad/index.html": "<html><body>hi</body></html>",
}, "bad-json");
C.ok("非法 package.json 不抛异常且仍出结果", brokenPkg && brokenPkg.profile);
C.ok("非法 package.json 时 scripts 为空数组",
  Array.isArray(brokenPkg.eng.scripts) && brokenPkg.eng.scripts.length === 0);

const weird = await run({
  "w/文件 名 with space.md": "# 空格与中文路径\n",
  "w/UPPER.MD": "# 大写扩展名\n",
  "w/no-ext": "没有扩展名的文件",
  "w/.hidden": "隐藏文件",
}, "weird");
C.ok("中文/空格/无扩展名/隐藏文件 不抛异常", weird !== null);
C.ok("大写 .MD 也计入 md", weird.exts.some((e) => e.ext === "md"));

// 注意：顶层目录别叫 bin/dist/build —— 那会整棵撞上 NOISE 规则（见 [8b]）
const binaryOnly = await run({
  "media/logo.png": null,
  "media/README.md": "# 只有二进制和一行说明\n",
}, "media");
C.ok("二进制文件不进文本池也能分析", binaryOnly !== null);
C.eq("二进制目录只统计到 2 个文件", binaryOnly.files, 2);

// 单文件项目
const single = await run({ "one/main.js": "console.log(1);\n" }, "single");
C.ok("单文件项目不崩", single !== null && typeof single.profile === "string");

// ── 11. 逐模板强制跑通（换模板不能某套炸掉）──────────────────
console.log("\n[11] 所有 fixture × 所有模板 交叉跑通");
let cross = 0, crossFail = 0;
for (const fid of Object.keys(FIX)) {
  for (const pid of PROFILE_ORDER) {
    try {
      const d = api.buildData(`auto-${fid}`, pid);
      if (!d || d.profile !== pid) throw new Error(`profile 应为 ${pid}，实际 ${d && d.profile}`);
      if (!Array.isArray(d.advice)) throw new Error("advice 不是数组");
      cross += 1;
    } catch (e) {
      crossFail += 1;
      console.error(`  ✗ ${fid} × ${pid}: ${e.message}`);
    }
  }
}
C.eq(`7 fixture × 7 模板 = 49 组合全部跑通`, crossFail, 0);
C.ok(`实际跑了 ${cross} 个组合`, cross === 49);

// ── 12. 两份 html 必须一致（electron 打包用的是副本）──────────
console.log("\n[12] 打包副本同步");
const a = fs.readFileSync(path.join(root, "project-analyzer.html"), "utf-8");
const b = fs.readFileSync(path.join(root, "build-electron", "project-analyzer.html"), "utf-8");
C.ok("build-electron/project-analyzer.html 与根文件一致", a === b,
  a === b ? "" : `根 ${a.length} 字节 vs 副本 ${b.length} 字节`);

// ── 14. 项目边界识别 ───────────────────────────────────────────
console.log("\n[14] 项目边界识别");

// 一个工作区：顶层只有散碎文件，两个真项目在子目录里，
// 外加一个纯文档目录（不该被当成项目）
const WS = {
  "workspace/README.md": "# 我的工作区\n",
  "workspace/随手记.md": "# 随手记\n",
  "workspace/antgame/package.json": '{"name":"antgame","dependencies":{"pixi":"^7"}}',
  "workspace/antgame/src/main.js": 'import PIXI from "pixi";\n',
  "workspace/antgame/README.md": "# 蚂蚁沙盒\n",
  "workspace/webtool/index.html": "<canvas></canvas><script>requestAnimationFrame(loop)</script>",
  "workspace/webtool/README.md": "# 小工具\n",
  "workspace/notes/a.md": "# A\n",
  "workspace/notes/b.md": "# B\n",
  "workspace/notes/c.md": "# C\n",
  "workspace/notes/d.md": "# D\n",
};

const wsD = await run(WS, "ws");
const bnd = wsD.boundary;
C.ok("工作区 不是单项目", bnd.isSingle === false);
C.eq("识别出 2 个子项目", bnd.projects.length, 2);
C.eq("子项目是 antgame 与 webtool",
  bnd.projects.map((p) => p.name).sort().join(","), "antgame,webtool");
C.ok("纯文档的 notes/ 没被当成项目", !bnd.projects.some((p) => p.name === "notes"));
C.ok("每个子项目都带 kind 和文件数",
  bnd.projects.every((p) => p.kind && typeof p.files === "number"));
C.ok("子项目按得分降序",
  bnd.projects.every((p, i) => i === 0 || bnd.projects[i - 1].score >= p.score));
C.ok("reason 里说明了找到几个", /2 个候选/.test(bnd.reason), bnd.reason);
// kind 必须验：光断言「识别出来了」不够——靠弱信号也能识别，但类型会退化成「未识别」
C.eq("antgame 认出是 Node 项目",
  bnd.projects.find((p) => p.name === "antgame").kind, "Node / 前端");
C.eq("webtool 认出是网页项目",
  bnd.projects.find((p) => p.name === "webtool").kind, "网页 / 单文件");

// 顶层自带 manifest → 就是单项目，不该弹提示
const solo = await run({
  "myapp/package.json": '{"main":"x.js"}',
  "myapp/src/a.js": "var a=1;\n",
  "myapp/README.md": "# app\n",
}, "solo");
C.ok("顶层有 package.json → 判定为单项目", solo.boundary.isSingle === true);
C.eq("单项目时 projects 为空", solo.boundary.projects.length, 0);
C.ok("reason 指出是标志物", /标志物/.test(solo.boundary.reason), solo.boundary.reason);

// 谁都不像项目
const junk = await run({ "junk/图片 1.png": null, "junk/说明.txt": "随便放的东西\n" }, "junk");
C.ok("没有标志物时 isSingle=false", junk.boundary.isSingle === false);
C.eq("没有标志物时 projects 为空", junk.boundary.projects.length, 0);
C.ok("reason 提示可能只是普通文件夹", /普通文件夹/.test(junk.boundary.reason), junk.boundary.reason);

console.log("\n[14b] 各类项目标志物");
const manifestCases = [
  ["package.json", "Node / 前端"],
  ["pyproject.toml", "Python"],
  ["Cargo.toml", "Rust"],
  ["go.mod", "Go"],
  ["pom.xml", "Java"],
  ["app.sln", ".NET"],
  ["project.godot", "Godot"],
  ["game.uproject", "Unreal"],
  ["composer.json", "其他"],
];
// manifest 必须放在子目录里：放顶层的话整层就会被判成单项目，projects 是空的
for (const [file, kind] of manifestCases) {
  const d = await run({
    ["hub/proj/" + file]: "x\n",
    "hub/proj/README.md": "# p\n",
    "hub/proj/src/main.js": "var a=1;\n",
  }, "m-" + file);
  C.ok(`${file} 所在目录被识别为项目`, d.boundary.projects.length === 1,
    `实际 ${d.boundary.projects.length} 个`);
  const p = d.boundary.projects[0];
  C.ok(`${file} → ${kind}`, p && p.kind === kind, p ? p.kind : "未识别");
}

// ── 15. 切换子项目（scope）────────────────────────────────────
console.log("\n[15] 切换子项目");
const subGame = api.buildData("ws", null, "workspace/antgame");
C.ok("切到子项目后能出结果", subGame !== null);
C.eq("子项目 name 取最后一段", subGame.name, "antgame");
C.eq("子项目只统计自己的文件", subGame.files, 3);
C.ok("子项目 root 仍记着顶层目录", subGame.root === "workspace");
C.eq("scope 字段被记录", subGame.scope, "workspace/antgame");
C.ok("子项目单独判出了游戏类型", /游戏/.test(subGame.type), subGame.type);

const subTool = api.buildData("ws", null, "workspace/webtool");
C.eq("webtool 单独分析只有 2 个文件", subTool.files, 2);
C.eq("webtool 判成小游戏模板", subTool.profile, "mini");

const whole = api.buildData("ws", null, null);
C.eq("scope 为空时回到整个目录", whole.files, 11);
C.eq("scope 为空时 scope 字段为 null", whole.scope, null);
C.eq("不存在的 scope 返回 null", api.buildData("ws", null, "workspace/nope"), null);
C.ok("切子项目不污染顶层结果", api.buildData("ws", null, null).type === wsD.type);

// ── 16. 导出提示词 ─────────────────────────────────────────────
console.log("\n[16] 导出提示词");
const pd = await run({
  "myapp/package.json": '{"main":"x.js"}',
  "myapp/src/a.js": "var a=1;\n",
}, "prompt");
const full = api.genPrompt(pd);
C.ok("提示词非空", full.length > 200);
["## 一、项目概况", "## 二、流程进度", "## 三、产物齐全度",
  "## 四、需要补齐的缺口", "## 五、我希望你做这些"].forEach((sec) => {
  C.ok(`包含 ${sec}`, full.includes(sec));
});
C.ok("包含项目名称", full.includes("myapp"));
C.ok("包含分析模板", full.includes(pd.profileName));
C.ok("产物表格有分隔行", full.includes("| --- | --- | --- |"));
C.ok("默认全选时建议全都在", pd.advice.every((a) => full.includes(a.title)));
C.ok("每条建议带「该做什么」", pd.advice.every((a) => full.includes(a.detail)));
C.ok("每条建议带「为什么」", pd.advice.every((a) => full.includes(a.why)));

if (pd.advice.length >= 2) {
  api._setSel("prompt", pd.advice.map((a, i) => i === 0));
  const one = api.genPrompt(pd);
  C.ok("只勾第一项时它还在", one.includes(pd.advice[0].title));
  C.ok("未勾选项的标题不出现", !one.includes(pd.advice[1].title));
  C.ok("未勾选项的 detail 也不出现", !one.includes(pd.advice[1].detail));

  api._setSel("prompt", pd.advice.map(() => false));
  const none = api.genPrompt(pd);
  C.ok("全不选时有兜底文案", /一项都没勾选/.test(none));
  C.ok("全不选时不输出任何建议标题", pd.advice.every((a) => !none.includes(a.title)));
}
api._setSel("prompt", pd.advice.map(() => true));
const grouped = api.genPrompt(pd);
pd.advice.forEach((a) => {
  C.ok(`优先级分组 ${a.pri} 标题存在`, grouped.includes("### " + a.pri + "（"));
});

const subPrompt = api.genPrompt(subGame);
C.ok("子项目提示词标注了来源路径", subPrompt.includes("workspace/antgame"));

// ── 13. 导出的 API 契约 ────────────────────────────────────────
console.log("\n[13] window.__PA 契约");
["analyze", "buildData", "detectType", "detectProfile", "detectPhases", "detectArtifacts",
  "detectEngineering", "genIntro", "inferModules", "PROFILES", "getProfile",
  "detectProjects", "scoreDir", "genPrompt"].forEach((k) => {
  C.ok(`__PA.${k} 已暴露`, api[k] !== undefined);
});
C.eq("PROFILES 有 7 套", Object.keys(api.PROFILES).length, 7);
C.ok("getProfile 未知 id 回落 generic", api.getProfile("__nope__").id === "generic");

// ── 汇总 ───────────────────────────────────────────────────────
console.log(`\n通过 ${C.state.pass} 项，失败 ${C.state.fail} 项`);
if (C.state.fail > 0) {
  console.error("\n失败项：");
  C.state.failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log("All logic tests passed.");
