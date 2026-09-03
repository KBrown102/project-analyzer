// Electron 打包用的是 build-electron/project-analyzer.html，
// 它是根文件的副本。改完根文件跑一下 `npm run sync`，
// 免得打出来的 exe 里装的是旧版分析器（tests/logic.test.mjs 会校验两份一致）。
// 同样的漂移问题也存在于 prompts/：loadPrompt 用 XMLHttpRequest 同步取
// build-electron/prompts/*.md，副本落后会让打包后的 exe 走兜底提示词。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcHtml = path.join(root, "project-analyzer.html");
const dstHtml = path.join(root, "build-electron", "project-analyzer.html");
const srcPrompts = path.join(root, "prompts");
const dstPrompts = path.join(root, "build-electron", "prompts");

// —— 1. 同步 HTML ——
const a = fs.readFileSync(srcHtml);
const before = fs.existsSync(dstHtml) ? fs.readFileSync(dstHtml) : null;
if (before && before.equals(a)) {
  console.log("[html] 两份已经一致，无需同步。");
} else {
  fs.copyFileSync(srcHtml, dstHtml);
  console.log(
    before
      ? `[html] 已同步：${before.length} → ${a.length} 字节（副本落后 ${a.length - before.length} 字节）`
      : `[html] 已写入副本：${a.length} 字节`
  );
}

// —— 2. 同步 prompts/（只覆盖同名文件，不删 dst 独有的，避免误删用户实验稿）——
if (!fs.existsSync(srcPrompts)) {
  console.log("[prompts] 根 prompts/ 不存在，跳过。");
  process.exit(0);
}
fs.mkdirSync(dstPrompts, { recursive: true });
let copied = 0, same = 0, stale = 0;
for (const name of fs.readdirSync(srcPrompts)) {
  const s = path.join(srcPrompts, name);
  const d = path.join(dstPrompts, name);
  if (!fs.statSync(s).isFile()) continue;
  const sa = fs.readFileSync(s);
  const db = fs.existsSync(d) ? fs.readFileSync(d) : null;
  if (db && db.equals(sa)) { same++; continue; }
  fs.copyFileSync(s, d);
  copied++;
}
// 检查 dst 独有的文件（提醒用户：可能是旧版删了的提示词）
for (const name of fs.existsSync(dstPrompts) ? fs.readdirSync(dstPrompts) : []) {
  const s = path.join(srcPrompts, name);
  if (!fs.existsSync(s)) {
    stale++;
    console.log(`[prompts] ⚠ 副本独有 ${name}，根目录已无对应文件（可能是旧版残留，建议手动删）`);
  }
}
console.log(`[prompts] 同步 ${copied} 个，已一致 ${same} 个，副本独有 ${stale} 个。`);
