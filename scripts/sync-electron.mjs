// Electron 打包用的是 build-electron/project-analyzer.html，
// 它是根文件的副本。改完根文件跑一下 `npm run sync`，
// 免得打出来的 exe 里装的是旧版分析器（tests/logic.test.mjs 会校验两份一致）。
// 同样的漂移问题也存在于 prompts/：loadPrompt 用 XMLHttpRequest 同步取
// build-electron/prompts/*.md，副本落后会让打包后的 exe 走兜底提示词。
//
// 用法：
//   node scripts/sync-electron.mjs          同步（默认，会写文件）
//   node scripts/sync-electron.mjs --check  只校验不改写；有漂移则退出码 1
//
// 为什么要有 --check：npm test 的第一步就是本脚本的同步动作，
// 它会把副本改成与源一致，于是紧随其后的「两份字节一致」断言必然成立，
// 副本落后这种事故永远测不出来（假绿）。CI 必须在 npm test 之前先跑 --check。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHECK = process.argv.includes("--check");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcHtml = path.join(root, "project-analyzer.html");
const dstHtml = path.join(root, "build-electron", "project-analyzer.html");
const srcPrompts = path.join(root, "prompts");
const dstPrompts = path.join(root, "build-electron", "prompts");

let drift = 0;

function finish() {
  if (!CHECK) return;
  if (drift > 0) {
    console.log(`\n[check] ✗ 发现 ${drift} 处副本漂移 —— 请先跑 npm run sync 再提交。`);
    process.exitCode = 1;
  } else {
    console.log("\n[check] ✓ 未发现漂移。");
  }
}

// —— 1. 同步 HTML ——
const src = fs.readFileSync(srcHtml);
const dst = fs.existsSync(dstHtml) ? fs.readFileSync(dstHtml) : null;
if (dst && dst.equals(src)) {
  console.log("[html] 两份已经一致，无需同步。");
} else if (CHECK) {
  drift += 1;
  console.log(
    dst
      ? `[html] ✗ 副本与根文件不一致：根 ${src.length} 字节 / 副本 ${dst.length} 字节（差 ${src.length - dst.length}）`
      : "[html] ✗ 副本不存在：build-electron/project-analyzer.html"
  );
} else {
  fs.copyFileSync(srcHtml, dstHtml);
  console.log(
    dst
      ? `[html] 已同步：${dst.length} → ${src.length} 字节（副本落后 ${src.length - dst.length} 字节）`
      : `[html] 已写入副本：${src.length} 字节`
  );
}

// —— 2. 同步 prompts/（只覆盖同名文件，不删 dst 独有的，避免误删用户实验稿）——
if (!fs.existsSync(srcPrompts)) {
  console.log("[prompts] 根 prompts/ 不存在，跳过。");
  finish();
} else {
  if (!CHECK) fs.mkdirSync(dstPrompts, { recursive: true });
  let copied = 0, same = 0, stale = 0, differ = 0;
  for (const name of fs.readdirSync(srcPrompts)) {
    const s = path.join(srcPrompts, name);
    const d = path.join(dstPrompts, name);
    if (!fs.statSync(s).isFile()) continue;
    const sa = fs.readFileSync(s);
    const db = fs.existsSync(d) ? fs.readFileSync(d) : null;
    if (db && db.equals(sa)) { same++; continue; }
    if (CHECK) {
      drift += 1;
      differ += 1;
      console.log(`[prompts] ✗ 副本与根不一致：${name}`);
      continue;
    }
    fs.copyFileSync(s, d);
    copied++;
  }
  // 检查 dst 独有的文件（提醒用户：可能是旧版删了的提示词）
  // 注意：本脚本从不删副本独有文件，所以它跑一次 sync 也修不好，
  // 不算可自动修复的漂移，--check 下只警告不计入 drift。
  for (const name of fs.existsSync(dstPrompts) ? fs.readdirSync(dstPrompts) : []) {
    const s = path.join(srcPrompts, name);
    if (!fs.existsSync(s)) {
      stale++;
      console.log(`[prompts] ⚠ 副本独有 ${name}，根目录已无对应文件（可能是旧版残留，建议手动删）`);
    }
  }
  console.log(
    CHECK
      ? `[prompts] 一致 ${same} 个，漂移 ${differ} 个，副本独有 ${stale} 个。`
      : `[prompts] 同步 ${copied} 个，已一致 ${same} 个，副本独有 ${stale} 个。`
  );
  finish();
}
