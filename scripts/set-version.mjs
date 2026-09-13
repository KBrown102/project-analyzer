// ============================================================================
// set-version.mjs —— 版本号单一数据源同步脚本（零外部依赖，只用 node: 内置模块）
// ----------------------------------------------------------------------------
// 版本号在这个项目里需要出现在 3 个地方，缺一处就会出现「exe 叫 1.1.0、报告页脚还写
// 1.0.0」这种漂移。本脚本把「根 package.json 的 version」当作唯一数据源，一次写全：
//
//   1. package.json                    根 npm 包元数据（唯一数据源）
//   2. build-electron/package.json     electron-builder 靠它决定 exe 文件名与 EXE 属性版本
//   3. project-analyzer.html           导出报告页脚的用户可见水印（APP_VERSION 常量）
//      build-electron/project-analyzer.html  第 3 项的副本，由 sync-electron.mjs 复制而来
//
// 用法：
//   node scripts/set-version.mjs           # 只打印当前版本号（退出码 0）
//   node scripts/set-version.mjs 1.1.0     # 把三处同步为 1.1.0
//   node scripts/set-version.mjs 1.2.3-beta.1
//
// 设计取舍（HTML 版本号注入方式）：
//   采用 (b) —— 在 HTML 里定义 `var APP_VERSION = "1.0.0";` 常量，页脚引用它。
//   理由：
//     1) 锚定唯一、替换安全。页脚字面量 `由项目结构分析器 v1.0.0 生成` 里嵌着版本号，
//        直接替换需要构造正则，而 HTML 正文里存在 `versions.tf`、`v1.0.0` 等正则关键字面量
//        （分析器自身的规则表），误伤风险靠正则约束来兜。`APP_VERSION` 是专属标识符，
//        全文件仅此一处声明，正则不需要任何模糊匹配，天然不会误伤。
//     2) 单一引用点。页脚改成 `"由项目结构分析器 v" + APP_VERSION + " 生成"`，以后即使
//        页脚文案改版（加链接、加日期），版本号注入逻辑依然成立。
//     3) 保持单文件自包含。APP_VERSION 就是一行原生 JS var，拷走 HTML 依然零依赖，
//        不引入任何构建期占位符（如 {{VERSION}}），浏览器直接打开也不会露出生占位符。
//
// 所有终端输出与注释均为中文。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 脚本所在目录的上一级即项目根目录（与 sync-electron.mjs 保持一致的定位方式）。 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 需要同步的三个（严格说是四个）文件的绝对路径。 */
const ROOT_PKG = path.join(root, "package.json");
const BUILD_PKG = path.join(root, "build-electron", "package.json");
const ROOT_HTML = path.join(root, "project-analyzer.html");
const BUILD_HTML = path.join(root, "build-electron", "project-analyzer.html");

/**
 * 合法版本号：semver 的 x.y.z，可选 -prerelease 后缀（如 1.2.3-beta.1、1.2.3-rc.2）。
 * 刻意不支持 build metadata（+xxx）与前导 `v`，避免 `v1.0.0` 被静默接受后
 * 又在 electron-builder 的文件名里生成 `project-analyzer-v1.0.0.exe` 这种怪名。
 */
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** HTML 里版本常量声明行的锚点：全文件仅此一处。 */
export const APP_VERSION_RE = /var\s+APP_VERSION\s*=\s*"[^"]*";/;

/**
 * JSON 顶层 version 字段的锚定正则。
 *
 * 这里 `^` 配合 `m` 标志锚定行首，`( {2}` 强制「行首恰好两个空格缩进」——
 * 这两点组合起来才等价于「顶层字段」。原因：JSON.stringify 默认顶层字段缩进
 * 就是 2 空格，而任何嵌套字段（如 `build.win.version`）的缩进必然 ≥ 4 空格，
 * 因此「行首恰好两空格」能唯一锁定顶层字段。
 *
 * 若去掉 `{2}`（退化成 /^(\s*"version"...)/m），在「顶层 version 之前先出现一个
 * 嵌套 "version" 键」的 JSON 里，替换会命中**第一个**匹配（即嵌套那个），
 * 从而改错字段、顶层 version 反而没动。测试里用边界样本锁死了这个行为。
 */
export const JSON_VERSION_RE = /^( {2}"version"\s*:\s*")[^"]*(")/m;

/**
 * 纯函数：把 JSON 文本里**顶层** version 字段替换为 next，其余字节不动。
 *
 * 抽成可导出的纯函数，是为了让测试能直接对「嵌套 version 干扰」这类边界做断言，
 * 而不必去伪造真实仓库文件（真实文件里顶层 version 恰好是第一个匹配，
 * 天然掩盖了去掉 `{2}` 后的退化行为）。
 *
 * @param {string} text 原始 JSON 文本
 * @param {string} next 新版本号
 * @returns {{text: string, replaced: boolean}} 替换后的文本与是否发生替换
 */
export function replaceTopLevelJsonVersion(text, next) {
  if (!JSON_VERSION_RE.test(text)) {
    return { text, replaced: false };
  }
  return { text: text.replace(JSON_VERSION_RE, `$1${next}$2`), replaced: true };
}

/** 用于「已同步 / 无需修改」逐条记录的收集器。 */
const changes = [];

/**
 * 读取并校验根 package.json 里的版本号（唯一数据源）。
 * @returns {string} 当前版本号
 */
function readCurrentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(ROOT_PKG, "utf-8"));
    if (typeof pkg.version !== "string" || pkg.version === "") {
      console.error(`[错误] ${ROOT_PKG} 里没有可用的 version 字段。`);
      process.exit(1);
    }
    return pkg.version;
  } catch (e) {
    console.error(`[错误] 读取 package.json 失败：${e.message}`);
    process.exit(1);
  }
}

/**
 * 严格校验版本号格式。
 * @param {string} v 待校验的版本号
 * @returns {boolean} 是否为合法 semver
 */
function isValidVersion(v) {
  return typeof v === "string" && SEMVER_RE.test(v);
}

/**
 * 收集一条同步记录；相同则记为「无需修改」。
 * @param {string} label 人类可读的文件名
 * @param {string} from 旧版本
 * @param {string} to 新版本
 * @param {boolean} changed 是否真的写入了
 */
function record(label, from, to, changed) {
  changes.push({ label, from, to, changed });
}

/**
 * 同步 JSON 文件里顶层 version 字段。
 * 用正则精确锚定顶层的 `"version": "x"`（只匹配两个空格缩进的顶层字段），
 * 这样绝不会碰到 devDependencies 里的 `"electron": "^33.0.0"` 之类版本约束。
 * 写回时保留原有缩进与换行风格。
 * @param {string} file 绝对路径
 * @param {string} label 人类可读名
 * @param {string} next 新版本号
 * @returns {void}
 */
function syncJsonVersion(file, label, next) {
  if (!fs.existsSync(file)) {
    console.log(`[跳过] ${label} 不存在。`);
    return;
  }
  const text = fs.readFileSync(file, "utf-8");
  // 先解析拿到旧值，用于汇报与幂等判断；解析失败直接报错，不猜。
  let old;
  try {
    old = JSON.parse(text).version;
  } catch (e) {
    console.error(`[错误] ${label} 不是合法 JSON：${e.message}`);
    process.exit(1);
  }
  if (old === next) {
    record(label, old, next, false);
    return;
  }
  // 只替换顶层 version：行首两个空格 + "version" 键（顶层字段缩进固定为 2 空格）。
  const replaced = replaceTopLevelJsonVersion(text, next);
  if (!replaced.replaced) {
    console.error(`[错误] ${label} 里找不到顶层 version 字段。`);
    process.exit(1);
  }
  fs.writeFileSync(file, replaced.text, "utf-8");
  record(label, old, next, true);
}

/**
 * 同步 HTML 里的版本常量 `var APP_VERSION = "x";`。
 * 只改这一行，不动页脚字面量，也不碰正文里任何含 `1.0.0` 的正则示例。
 * @param {string} file 绝对路径
 * @param {string} label 人类可读名
 * @param {string} next 新版本号
 * @returns {void}
 */
function syncHtmlVersion(file, label, next) {
  if (!fs.existsSync(file)) {
    console.log(`[跳过] ${label} 不存在。`);
    return;
  }
  const text = fs.readFileSync(file, "utf-8");
  const m = text.match(APP_VERSION_RE);
  if (!m) {
    console.error(`[错误] ${label} 里找不到 var APP_VERSION = "..."; 声明行。`);
    console.error(`       页脚版本号依赖这个常量，请先确认文件未被改坏。`);
    process.exit(1);
  }
  const old = m[0].match(/"([^"]*)"/)[1];
  if (old === next) {
    record(label, old, next, false);
    return;
  }
  fs.writeFileSync(file, text.replace(APP_VERSION_RE, `var APP_VERSION = "${next}";`), "utf-8");
  record(label, old, next, true);
}

/**
 * 打印「已同步」清单。
 * @param {string} current 同步前版本
 * @param {string} next 目标版本
 * @returns {void}
 */
function printReport(current, next) {
  console.log("");
  console.log("  版本号同步结果");
  console.log("  ==================================================");
  console.log(`  当前版本: v${current}`);
  console.log(`  目标版本: v${next}`);
  console.log("  --------------------------------------------------");
  for (const c of changes) {
    if (c.changed) {
      console.log(`  [已同步] ${c.label}`);
      console.log(`           v${c.from} → v${next}`);
    } else {
      console.log(`  [无需修改] ${c.label}（已是 v${next}）`);
    }
  }
  console.log("  ==================================================");
  const wrote = changes.filter((c) => c.changed).length;
  const skipped = changes.length - wrote;
  console.log(`  共 ${wrote} 处已写入，${skipped} 处无需修改。`);
  console.log("");
  console.log("  提示: build-electron/package-lock.json 由 npm 自动维护，");
  console.log("        下次 npm install 时会自动跟随，不用手动改。");
  console.log("  提示: exe 文件名（artifactName）会自动跟随新版本号。");
  console.log("");
}

/**
 * 主流程。
 * @returns {void}
 */
function main() {
  const current = readCurrentVersion();
  const raw = process.argv[2];

  // —— 不带参数：只报当前版本 ——
  if (raw === undefined || raw === "") {
    console.log(`当前版本: ${current}`);
    return;
  }

  const next = raw.trim();

  // —— 格式校验：非法一律不改文件 ——
  if (!isValidVersion(next)) {
    console.error("");
    console.error(`  [错误] 版本号格式不合法: "${next}"`);
    console.error("");
    console.error("  要求格式: x.y.z      例如 1.0.0 / 2.13.7");
    console.error("  允许预发布后缀:       例如 1.2.3-beta.1 / 1.2.3-rc.2");
    console.error("  注意: 不要加前导 v，不要写成 1.2 这种缺段的形式。");
    console.error("");
    console.error("  本次未修改任何文件。");
    console.error("");
    process.exit(1);
  }

  // 目标与现有一致时，依然走一遍各文件，以便发现「某处落后」的不一致状态。
  syncJsonVersion(ROOT_PKG, "package.json", next);
  syncJsonVersion(BUILD_PKG, "build-electron/package.json", next);
  syncHtmlVersion(ROOT_HTML, "project-analyzer.html", next);
  syncHtmlVersion(BUILD_HTML, "build-electron/project-analyzer.html", next);

  printReport(current, next);
}

// ----------------------------------------------------------------------------
// 入口守卫：只有被当作脚本直接执行时才跑 main()。
// 被测试 `import` 时（无 argv[1] 或 argv[1] 不是本文件）不触发任何副作用，
// 这样测试就能安全地复用 replaceTopLevelJsonVersion 等纯函数。
// ----------------------------------------------------------------------------
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main();
}

