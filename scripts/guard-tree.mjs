// 仓库结构守卫。两件事：
//   1) --files        关键文件必须都在（防「仓库被清空」这类事故）
//   2) --tree A B     对比两个提交，判断这次推送是否发生了「树退化」
//
// 由来：2026-09-17 有一次自动 revert 以空树为基线（4b825dc6…），
// 一次删光全仓 48 个文件、-14680 行（a7b8689），事后靠人工才发现并恢复（c1f14b7）。
// 本脚本让 CI 在推送到 main 时就拦住它，而不是等下一次看仓库时才察觉。
//
// 用法：
//   node scripts/guard-tree.mjs --files
//   node scripts/guard-tree.mjs --tree <beforeSha> <afterSha>
//
// 没装 git / 不是 git 仓库时（比如有人把源码目录拷走单独跑）只打警告，不失败。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// —— 关键文件：这些没了说明仓库结构被破坏，不是正常重构 ——
// 若确实要删其中某一项，请连着改这份清单，别让守卫长期红着。
const CRITICAL = [
  "package.json",
  "README.md",
  "LICENSE",
  ".gitignore",
  "index.html",
  "project-analyzer.html",
  "build-electron/project-analyzer.html",
  "build-electron/main.js",
  "build-electron/package.json",
  "scripts/sync-electron.mjs",
  "scripts/set-version.mjs",
  "prompts/purpose.md",
  ".github/workflows/ci.yml",
];

// —— 树退化阈值 ——
const MAX_DELETE_RATIO = 0.4;      // 一次推送删掉 40% 以上文件
const MIN_DELETE_COUNT = 5;        // 且至少 5 个（小仓库删 2 个就 40%，别误报）
const MAX_NET_DELETED_LINES = 3000; // 或净删除 3000 行以上
const ZERO = "0000000000000000000000000000000000000000";
const ALLOW_TOKEN = "ALLOW-MASS-DELETE";

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function gitOk(...args) {
  try {
    git(...args);
    return true;
  } catch {
    return false;
  }
}

function checkFiles() {
  const missing = CRITICAL.filter((f) => !fs.existsSync(path.join(root, f)));
  if (missing.length === 0) {
    console.log(`✓ 关键文件齐全（共 ${CRITICAL.length} 项）。`);
    return;
  }
  console.error(`✗ 关键文件缺失 ${missing.length} 个，仓库结构不完整：`);
  for (const f of missing) console.error(`    - ${f}`);
  console.error("\n  若这是有意删除，请同步更新 scripts/guard-tree.mjs 里的 CRITICAL 清单。");
  process.exitCode = 1;
}

function checkTree(before, after) {
  if (!before || !after) {
    console.log("跳过：没拿到提交号（before/after 为空）。");
    return;
  }
  if (/^0+$/.test(before)) {
    console.log("跳过：新分支的首次推送，没有可比基线。");
    return;
  }
  if (!gitOk("cat-file", "-e", `${before}^{commit}`)) {
    console.log(`跳过：基线 ${before.slice(0, 7)} 不在本地历史里（force push 或浅克隆）。`);
    return;
  }

  const msg = git("log", "-1", "--format=%B", after);
  if (msg.includes(ALLOW_TOKEN)) {
    console.log(`跳过：提交信息里带了逃生阀 ${ALLOW_TOKEN}。`);
    return;
  }

  const totalBefore = git("ls-tree", "-r", "--name-only", before).split("\n").filter(Boolean).length;
  const deleted = git("diff", "-M", "--diff-filter=D", "--name-only", before, after)
    .split("\n")
    .filter(Boolean);

  let added = 0;
  let removed = 0;
  for (const line of git("diff", "-M", "--numstat", before, after).split("\n")) {
    if (!line.trim()) continue;
    const [add, del] = line.split("\t");
    if (add === "-" || del === "-") continue; // 二进制文件，行数无意义
    added += Number(add) || 0;
    removed += Number(del) || 0;
  }
  const netDeleted = removed - added;
  const ratio = totalBefore > 0 ? deleted.length / totalBefore : 0;

  console.log(`基线 ${before.slice(0, 7)} → ${after.slice(0, 7)}`);
  console.log(`  基线文件 ${totalBefore} 个，本次删除 ${deleted.length} 个（${(ratio * 100).toFixed(0)}%）`);
  console.log(`  行变化 +${added} / -${removed}（净 ${netDeleted >= 0 ? "-" : "+"}${Math.abs(netDeleted)}）`);

  const problems = [];
  if (deleted.length >= MIN_DELETE_COUNT && ratio >= MAX_DELETE_RATIO) {
    problems.push(
      `删除 ${deleted.length} 个文件，占基线 ${(ratio * 100).toFixed(0)}%，超过 ${MAX_DELETE_RATIO * 100}% 阈值`
    );
  }
  if (netDeleted >= MAX_NET_DELETED_LINES) {
    problems.push(`净删除 ${netDeleted} 行，超过 ${MAX_NET_DELETED_LINES} 行阈值`);
  }

  if (problems.length === 0) {
    console.log("✓ 未发现树退化。");
    return;
  }

  console.error("\n✗ 疑似「树退化」——这次推送大面积删除了仓库内容：");
  for (const p of problems) console.error(`    - ${p}`);
  if (deleted.length > 0) {
    console.error("\n  被删文件（最多列 30 个）：");
    for (const f of deleted.slice(0, 30)) console.error(`    - ${f}`);
    if (deleted.length > 30) console.error(`    … 另有 ${deleted.length - 30} 个`);
  }
  console.error(
    "\n  这类事故通常是「以空树为基线的 revert」造成的（参见 a7b8689）。" +
      `\n  若确认是有意为之，在提交信息里写上 ${ALLOW_TOKEN} 后再推一次即可放行。`
  );
  process.exitCode = 1;
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "--files") {
  checkFiles();
} else if (mode === "--tree") {
  checkTree(rest[0] || process.env.BEFORE, rest[1] || process.env.AFTER);
} else {
  console.error("用法：node scripts/guard-tree.mjs --files | --tree <beforeSha> <afterSha>");
  process.exitCode = 2;
}
