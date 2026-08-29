// Electron 打包用的是 build-electron/project-analyzer.html，
// 它是根文件的副本。改完根文件跑一下 `npm run sync`，
// 免得打出来的 exe 里装的是旧版分析器（tests/logic.test.mjs 会校验两份一致）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "project-analyzer.html");
const dst = path.join(root, "build-electron", "project-analyzer.html");

const a = fs.readFileSync(src);
const before = fs.existsSync(dst) ? fs.readFileSync(dst) : null;

if (before && before.equals(a)) {
  console.log("两份已经一致，无需同步。");
  process.exit(0);
}

fs.copyFileSync(src, dst);
console.log(
  before
    ? `已同步：${before.length} → ${a.length} 字节（副本落后 ${a.length - before.length} 字节）`
    : `已写入副本：${a.length} 字节`
);
