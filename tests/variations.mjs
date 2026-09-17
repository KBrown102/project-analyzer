// 变异测试：故意改坏 project-analyzer.html 里的核心逻辑，看测试是否报错。
//
// 为什么需要它：测试全绿不代表测试有效。把某段核心逻辑改坏、测试却照样全绿，
// 说明那段逻辑根本没人测——这是「假绿」，比测试失败更危险。
//
// 用法：node tests/variations.mjs
//
// 安全性：每个变异体跑完立刻还原，还原写在 finally 里，
// 断言抛异常也会执行；跑完再按字节核对一次，不一致就大字警告。
// （本脚本原先躺在仓库根目录，且还原语句没有保护——
//   一旦 execSync 抛出的异常没被按住，被改坏的 HTML 就会留在工作区。
//   2026-09-18 迁入 tests/ 并补上 finally 与结尾核对。）
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "project-analyzer.html");
const LOGIC_TEST = path.join(root, "tests", "logic.test.mjs");

const orig = fs.readFileSync(target, "utf8");

// [名称, 原串, 替换成]
const VARIANTS = [
  ["V1 删掉 .log 过滤", "if (!/\\.log$/i.test(t.path)) continue;", "/* V1 */"],
  ["V2 评级门槛 80 → 60", "if (score >= 80)", "if (score >= 60) /* V2 */"],
  ["V3 崩溃扣分改成加分", "- crashPenalty", "+ crashPenalty /* V3 */"],
  ["V4 导出永远返回 null", "if (!items.length) return null;", "return null; /* V4 */"],
  ["V5 亮点阈值 0.8 → 0.1", "phDone >= phTotal * 0.8", "phDone >= phTotal * 0.1 /* V5 */"],
];

function runLogicTest() {
  try {
    const out = execFileSync(process.execPath, [LOGIC_TEST], {
      cwd: root,
      encoding: "utf8",
      timeout: 120000,
    });
    return { text: out, failed: false };
  } catch (e) {
    const text = [e.stdout, e.stderr]
      .filter(Boolean)
      .map((x) => String(x))
      .join("\n");
    return { text, failed: true };
  }
}

let missed = 0;
let stale = 0;

for (const [name, find, repl] of VARIANTS) {
  if (!orig.includes(find)) {
    console.log(`? ${name}：源码里找不到锚点，跳过（逻辑可能已重构，请更新锚点）`);
    stale += 1;
    continue;
  }
  try {
    fs.writeFileSync(target, orig.replace(find, repl));
    const r = runLogicTest();
    const fails = r.text.split("\n").filter((l) => l.includes("✗")).length;
    if (r.failed || fails > 0) {
      console.log(`✓ ${name}：被抓住（${fails > 0 ? `${fails} 处失败` : "退出码非 0"}）`);
    } else {
      missed += 1;
      console.log(`✗ ${name}：没被抓住 —— 这段逻辑缺测试覆盖`);
    }
  } finally {
    fs.writeFileSync(target, orig); // 无论如何都还原
  }
}

// 兜底核对：文件必须与开始时字节一致
if (fs.readFileSync(target, "utf8") !== orig) {
  console.error("\n!! project-analyzer.html 未能还原，请立刻执行：git checkout -- project-analyzer.html");
  process.exitCode = 1;
} else {
  console.log(`\n全部还原完毕（原文件 ${Buffer.byteLength(orig)} 字节，未改动）。`);
}

if (stale > 0) console.log(`注意：${stale} 个变异体锚点失效，需要更新后再跑。`);
if (missed > 0) {
  console.error(`\n有 ${missed} 个变异体没被测试抓住，测试覆盖存在空洞。`);
  process.exitCode = 1;
}
