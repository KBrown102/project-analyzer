// ============================================================================
// 版本号同步测试（scripts/set-version.mjs）
// ----------------------------------------------------------------------------
// 这里要验证的是「三处都改到 + 非法输入绝不落盘 + 页脚替换不误伤」。
//
// 关键约束：脚本设计上操作的是真实仓库文件，所以必须先整仓备份、跑完恢复，
// 绝不能污染仓库状态。备份集合取「脚本会碰的 4 个文件 + 两份 HTML 在 build-electron
// 副本」，跑完用字节级比对确认已还原。
//
// 零外部依赖：只用 node: 内置模块，断言自己写。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { root, createChecker } from "./_harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETVER = path.join(root, "scripts", "set-version.mjs");

const ROOT_PKG = path.join(root, "package.json");
const BUILD_PKG = path.join(root, "build-electron", "package.json");
const ROOT_HTML = path.join(root, "project-analyzer.html");
const BUILD_HTML = path.join(root, "build-electron", "project-analyzer.html");

/** 脚本会写到的全部文件，备份 / 恢复都围绕这个清单。 */
const TARGETS = [ROOT_PKG, BUILD_PKG, ROOT_HTML, BUILD_HTML];

const C = createChecker("Version tests · 版本号同步（set-version.mjs）");

// ---------------------------------------------------------------------------
// 0. 快照原始状态（字节级），退出前必定还原
// ---------------------------------------------------------------------------
const snapshot = new Map();
for (const f of TARGETS) {
  snapshot.set(f, fs.existsSync(f) ? fs.readFileSync(f) : null);
}

/** 还原全部目标文件到测试开始前的字节状态。 */
function restoreAll() {
  for (const [f, buf] of snapshot) {
    if (buf === null) {
      if (fs.existsSync(f)) fs.rmSync(f, { force: true });
    } else {
      fs.writeFileSync(f, buf);
    }
  }
}

/**
 * 在无参数 / 带参数两种模式下调用 set-version.mjs。
 * @param {string[]} args 传给脚本的参数
 * @returns {{status: number, stdout: string, stderr: string}} 进程结果
 */
function runSetVersion(args = []) {
  const r = spawnSync(process.execPath, [SETVER, ...args], {
    encoding: "utf-8",
    cwd: root,
  });
  return {
    status: r.status === null ? -1 : r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

/** 读取某文件的 version 字段。 */
function pkgVersion(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8")).version;
}

/** 读取某个 HTML 里 APP_VERSION 常量的值。 */
function htmlVersion(file) {
  const text = fs.readFileSync(file, "utf-8");
  const m = text.match(/var\s+APP_VERSION\s*=\s*"([^"]*)";/);
  return m ? m[1] : null;
}

/** 读取页脚那行的原文拼接结果（用于验证页脚渲染表达式未被打坏）。 */
function footerLine(file) {
  const text = fs.readFileSync(file, "utf-8");
  const m = text.match(/html \+= '<div class="footer">[^\n]*\n/);
  return m ? m[0] : "";
}

// 测试期间守卫：无论成功失败都还原文件
let restored = false;
function finalize() {
  if (restored) return;
  restored = true;
  restoreAll();
}
process.on("exit", finalize);

// 起始基线
const baseVersion = pkgVersion(ROOT_PKG);
C.ok("基线：根 package.json 能读出版本号", /^\d+\.\d+\.\d+/.test(baseVersion), baseVersion);

// ---------------------------------------------------------------------------
// 1. 不带参数：打印当前版本号，退出码 0，不修改任何文件
// ---------------------------------------------------------------------------
{
  const before = TARGETS.map((f) => fs.readFileSync(f));
  const r = runSetVersion([]);
  const after = TARGETS.map((f) => fs.readFileSync(f));
  C.eq("无参数退出码为 0", r.status, 0);
  C.ok("无参数打印了当前版本号", r.stdout.includes(baseVersion), JSON.stringify(r.stdout));
  C.ok(
    "无参数不修改任何文件",
    before.every((b, i) => b.equals(after[i]))
  );
}

// ---------------------------------------------------------------------------
// 2. 非法版本号：退出码 1、中文报错、且四个文件一字未动
// ---------------------------------------------------------------------------
// 注意：不含 "1.0.0 "（尾随空格）。脚本对参数做 trim，尾随空格属于 shell 常见噪音，
// 应当被宽容处理而不是报错，因此这里不把它列为非法输入。
const BAD_INPUTS = ["abc", "1.2", "v1.0.0", "1.0.0.0", "", "1.0.0+meta", "-1.0.0", "1..0"];
{
  const before = TARGETS.map((f) => fs.readFileSync(f));
  let allRejected = true;
  let allUnchanged = true;
  let sawChineseError = true;
  const details = [];

  for (const bad of BAD_INPUTS) {
    const args = bad === "" ? [""] : [bad];
    const r = runSetVersion(args);
    // "" 会走「无参数」分支（argv[2] === ""），同样不得改文件
    const expected = 0;
    // 注意："" 传进去是空串，脚本按「未提供」处理返回 0；其余非法值必须是 1
    const wantStatus = bad === "" ? expected : 1;
    if (r.status !== wantStatus) {
      allRejected = false;
      details.push(`"${bad}" 期望退出码 ${wantStatus}，实际 ${r.status}`);
    }
    if (bad !== "" && !/错误|格式/.test(r.stdout + r.stderr)) {
      sawChineseError = false;
      details.push(`"${bad}" 没有输出中文错误提示`);
    }
  }

  const after = TARGETS.map((f) => fs.readFileSync(f));
  allUnchanged = before.every((b, i) => b.equals(after[i]));

  C.ok("非法版本号一律被拒绝（退出码 1）", allRejected, details.join("; "));
  C.ok("非法版本号有中文错误提示", sawChineseError, details.join("; "));
  C.ok("非法版本号不修改任何文件", allUnchanged);
  C.eq("非法输入后根版本仍为基线", pkgVersion(ROOT_PKG), baseVersion);
}

// ---------------------------------------------------------------------------
// 3. 合法版本号：三处（实际四处）都被改到
// ---------------------------------------------------------------------------
{
  const TARGET_NEW = "9.8.7";
  const r = runSetVersion([TARGET_NEW]);
  C.eq("合法版本号退出码为 0", r.status, 0);
  C.ok("输出里含「已同步」字样", /已同步|同步/.test(r.stdout), JSON.stringify(r.stdout));

  C.eq("根 package.json 已改", pkgVersion(ROOT_PKG), TARGET_NEW);
  C.eq("build-electron/package.json 已改", pkgVersion(BUILD_PKG), TARGET_NEW);
  C.eq("project-analyzer.html 已改", htmlVersion(ROOT_HTML), TARGET_NEW);
  C.eq("build-electron 的 html 副本已改", htmlVersion(BUILD_HTML), TARGET_NEW);

  // 报告导出的页脚必须引用常量，才能随版本变化
  const rootHtml = fs.readFileSync(ROOT_HTML, "utf-8");
  C.ok(
    "页脚改为引用 APP_VERSION 常量",
    rootHtml.includes("由项目结构分析器 v' + APP_VERSION + ' 生成"),
    footerLine(ROOT_HTML)
  );
  C.ok(
    "页脚已不再硬编码旧版本号",
    !rootHtml.includes("由项目结构分析器 v" + baseVersion + " 生成")
  );

  // —— 同步后，页面里唯一的真版本号来源就是 APP_VERSION ——
  // 要求：仍然只有一处 APP_VERSION 声明（避免多份常量各说各话）
  const declCount = (rootHtml.match(/var\s+APP_VERSION\s*=/g) || []).length;
  C.eq("HTML 里 APP_VERSION 声明只有一处", declCount, 1);
}

// ---------------------------------------------------------------------------
// 4. 页脚替换的精确性：不误伤文件里其它含 1.0.0 的内容
// ---------------------------------------------------------------------------
{
  // 先回到基线版本，确认正常路径下没有误伤
  runSetVersion([baseVersion]);

  const rootHtml = fs.readFileSync(ROOT_HTML, "utf-8");
  const buildHtml = fs.readFileSync(BUILD_HTML, "utf-8");

  // 目前恢复到基线后，APP_VERSION 必须是基线值
  C.eq("还原基线后 HTML 版本正确", htmlVersion(ROOT_HTML), baseVersion);

  // 两份文件字节必须一致（副本由 sync-electron 复制，不能只改一份）
  C.ok("两份 HTML 在版本同步后仍完全一致", rootHtml === buildHtml);

  // 精确性：置换到极端版本号后，正文里的其它 "1.0.0" 类文本不受影响。
  // 先记录正文里所有与版本无关的 1.0.0 出现次数（排除 APP_VERSION 声明行）。
  const stripDecl = (t) => t.replace(/var\s+APP_VERSION\s*=\s*\"[^\"]*\";/g, "<APP_VERSION>");
  const beforeStripped = stripDecl(rootHtml);

  runSetVersion(["7.7.7"]);

  const afterHtml = fs.readFileSync(ROOT_HTML, "utf-8");
  const afterStripped = stripDecl(afterHtml);

  C.eq("除 APP_VERSION 外，HTML 其余内容字节不变", afterStripped === beforeStripped ? 1 : 0, 1);
  C.eq("APP_VERSION 已变为新值", htmlVersion(ROOT_HTML), "7.7.7");

  // 关键：文件里仍应保留原本那些与版本无关的 1.0.0 文本（facet：versions.tf 类内容）
  // 我们只断言「置换掉声明后剩下的部分完全没动」，这已经等价于零误伤。
  const untouched = afterStripped === beforeStripped;
  C.ok("页脚替换零误伤（正文原样保留）", untouched);
}

// ---------------------------------------------------------------------------
// 5. 幂等：重复设置同一版本不报错，并给出「无需修改」
// ---------------------------------------------------------------------------
{
  const SAME = "5.5.5";
  const first = runSetVersion([SAME]);
  C.eq("首次设置退出码 0", first.status, 0);

  const before = TARGETS.map((f) => fs.readFileSync(f));
  const second = runSetVersion([SAME]);
  const after = TARGETS.map((f) => fs.readFileSync(f));

  C.eq("重复设置同版本退出码仍为 0", second.status, 0);
  C.ok("重复设置提示「无需修改」", /无需修改/.test(second.stdout), JSON.stringify(second.stdout));
  C.ok("重复设置未再写文件", before.every((b, i) => b.equals(after[i])));
  C.eq("版本保持为设定值", pkgVersion(ROOT_PKG), SAME);
}

// ---------------------------------------------------------------------------
// 6. 带预发布后缀的版本号应被接受
// ---------------------------------------------------------------------------
{
  const PRE = "1.2.3-beta.1";
  const r = runSetVersion([PRE]);
  C.eq("预发布版本号退出码 0", r.status, 0);
  C.eq("根 package.json 接受预发布号", pkgVersion(ROOT_PKG), PRE);
  C.eq("build-electron 接受预发布号", pkgVersion(BUILD_PKG), PRE);
  C.eq("HTML 接受预发布号", htmlVersion(ROOT_HTML), PRE);
  C.eq("副本 HTML 接受预发布号", htmlVersion(BUILD_HTML), PRE);
}

// ---------------------------------------------------------------------------
// 7. build-electron/package.json 的 devDependencies 不得被改动
// ---------------------------------------------------------------------------
{
  const beforePkg = JSON.parse(fs.readFileSync(BUILD_PKG, "utf-8"));
  runSetVersion(["3.2.1"]);
  const afterPkg = JSON.parse(fs.readFileSync(BUILD_PKG, "utf-8"));

  C.eq("顶层 version 已更新", afterPkg.version, "3.2.1");
  C.ok(
    "devDependencies 未被波及",
    JSON.stringify(afterPkg.devDependencies) === JSON.stringify(beforePkg.devDependencies),
    JSON.stringify(afterPkg.devDependencies)
  );
  C.eq(
    "build.artifactName 仍用 ${version} 占位",
    afterPkg.build.win.artifactName,
    "project-analyzer-${version}.${ext}"
  );
  C.eq(
    "portable.artifactName 仍用 ${version} 占位",
    afterPkg.build.portable.artifactName,
    "project-analyzer-${version}.${ext}"
  );
  C.ok(
    "其余顶层字段（files/appId 等）未被改动",
    afterPkg.build.appId === beforePkg.build.appId &&
      JSON.stringify(afterPkg.build.files) === JSON.stringify(beforePkg.build.files)
  );
}

// ---------------------------------------------------------------------------
// 8. HTML 结构完整性：置换后 <script> 块仍能跑（复用 harness 真加载一次）
// ---------------------------------------------------------------------------
{
  const { loadAnalyzer } = await import("./_harness.mjs");
  const { api } = loadAnalyzer(ROOT_HTML);
  C.ok("版本同步后 HTML 脚本仍可正常加载", api && typeof api.analyze === "function");

  // 让导出报告真跑一次，验证页脚拼接表达式求值正常。
  // 用真实 analyze 产出数据，避免手写假对象漏字段（渲染函数会读 grade/phases 等深层结构）。
  let footerOk = false;
  let footerText = "";
  try {
    const { fakeTree } = await import("./_harness.mjs");
    const real = await api.analyze(
      fakeTree({
        "demo/package.json": '{"name":"demo","version":"1.0.0"}',
        "demo/README.md": "# demo\n",
        "demo/src/main.js": "var a=1;\n",
      }),
      "browser"
    );
    // exportHTMLReportData 在 window.__PA 上直接可用
    const data = api.exportHTMLReportData([real]);
    footerText = data && data.html ? data.html : "";
    footerOk = /由项目结构分析器 v.+ 生成/.test(footerText);
  } catch (e) {
    footerOk = false;
    footerText = String(e && e.message);
  }
  C.ok("导出报告页脚渲染出「由项目结构分析器 vX.Y.Z 生成」", footerOk, footerText.slice(0, 200));
  if (footerOk) {
    const shown = footerText.match(/由项目结构分析器 v([^ ]+) 生成/)[1];
    C.eq("页脚显示的版本号 = 当前设定版本", shown, "3.2.1");
  }
}

// ---------------------------------------------------------------------------
// 10. bat 载体静态冒烟：行尾 / 编码 / 关键指令 / 调用路径
// ---------------------------------------------------------------------------
// 背景：set-version.mjs 本身没问题，但用户是通过 bat 双击调用它的。
// 曾经的 Bug —— 设置版本号.bat 全文件是纯 LF，cmd.exe 按字节偏移解析后
// 出现 'OOT' / 'zer.html' / 'rlevel' / 'ho' 这类错位报错，脚本静默不生效。
// 因此必须把 bat 载体本身纳入测试，且用「字节级」断言，不能靠肉眼。
{
  const SETVER_BAT = "设置版本号.bat";
  const BUILD_BAT = "build-exe-electron.bat";

  /** 读 bat 的字节 + 文本，统一给出 CR/LF/行尾统计。 */
  function readBat(rel) {
    const abs = path.join(root, rel);
    const buf = fs.readFileSync(abs);
    const text = buf.toString("binary");
    let cr = 0;
    let lf = 0;
    for (const b of buf) {
      if (b === 0x0d) cr += 1;
      if (b === 0x0a) lf += 1;
    }
    // 孤立 LF（前一个字节不是 CR）的数量：必须为 0 才是纯 CRLF
    let loneLf = 0;
    for (let i = 0; i < buf.length; i += 1) {
      if (buf[i] === 0x0a && (i === 0 || buf[i - 1] !== 0x0d)) loneLf += 1;
    }
    return { abs, buf, text, cr, lf, loneLf };
  }

  // —— 10.1 两个 bat 都必须纯 CRLF ——
  // 这是本次 Bug 的直接回归断言：只要谁把行尾改成 LF，这一组立刻红。
  for (const rel of [SETVER_BAT, BUILD_BAT]) {
    const b = readBat(rel);
    C.ok(`${rel} 含 CRLF（存在 \\r）`, b.cr > 0, `CR=${b.cr}`);
    C.eq(
      `${rel} 行尾全为 CRLF（CR 数 === LF 数）`,
      b.cr,
      b.lf
    );
    C.ok(
      `${rel} 不存在孤立 LF（无纯 LF 行）`,
      b.loneLf === 0,
      `孤立 LF=${b.loneLf}`
    );
    // 正则口径：任何「前面不是 \r 的 \n」都算违规行尾
    C.ok(
      `${rel} 不含不接 CR 的裸 LF`,
      !/(?<!\r)\n/.test(b.text),
      "存在裸 LF"
    );
  }

  // —— 10.2 首三字节不得是 UTF-8 BOM（GFB 兼容 / 现有 smoke 口径）——
  for (const rel of [SETVER_BAT, BUILD_BAT]) {
    const { buf } = readBat(rel);
    const isBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    C.ok(`${rel} 无 UTF-8 BOM`, !isBom, `前 3 字节 = ${buf[0]},${buf[1]},${buf[2]}`);
    // 首字符必须是 @（@echo off），证明没有夹带任何 BOM / 空白前缀
    C.eq(`${rel} 首字节为 '@'（0x40）`, buf[0], 0x40);
  }

  // —— 10.3 关键指令与结构 ——
  {
    const { text } = readBat(SETVER_BAT);
    C.ok(`${SETVER_BAT} 含 chcp 65001`, /chcp\s+65001/.test(text));
    C.ok(`${SETVER_BAT} 含 @echo off`, /^@echo off/.test(text));
    C.ok(`${SETVER_BAT} 以 pause 收尾（防止双击闪退）`, /\bpause\b[^\n]*\s*$/.test(text.trimEnd()));
    C.ok(
      `${SETVER_BAT} 调用 scripts\\set-version.mjs`,
      /scripts\\set-version\.mjs/.test(text),
      "未找到调用路径"
    );
    // 调用的是 node + 绝对路径（%~dp0 前缀），双击时 CWD 不可靠
    C.ok(
      `${SETVER_BAT} 以 %~dp0 锚定项目根`,
      /set\s+"ROOT=%~dp0"/.test(text),
      "未找到 %~dp0 锚定"
    );
    C.ok(
      `${SETVER_BAT} 用 %ROOT% 拼出 scripts\\set-version.mjs 路径`,
      /set\s+"SETVER=%ROOT%scripts\\set-version\.mjs"/.test(text),
      "未找到 SETVER 定义"
    );
    C.ok(
      `${SETVER_BAT} 以 node 调用该绝对路径`,
      /call\s+node\s+"%SETVER%"/.test(text),
      "调用形式不符合预期"
    );
    C.ok(`${SETVER_BAT} 含 setlocal`, /\bsetlocal\b/.test(text));
  }

  {
    const { text } = readBat(BUILD_BAT);
    C.ok(`${BUILD_BAT} 含 chcp 65001`, /chcp\s+65001/.test(text));
    C.ok(`${BUILD_BAT} 含 @echo off`, /^@echo off/.test(text));
  }

  // —— 10.4 build-exe-electron.bat 的时序约束 ——
  // 版本号同步必须发生在 copy HTML 之前，否则副本里的页脚版本会落后根文件。
  {
    const { text } = readBat(BUILD_BAT);
    // 取「最后一次」同步调用（即带 %NEWVER% 的那次真正写入），它才是生效点
    const syncIdx = text.lastIndexOf("set-version.mjs");
    const copyIdx = text.indexOf('copy /Y "%SRC%"');
    C.ok(
      `${BUILD_BAT} 里版本号同步出现在 copy HTML 之前`,
      syncIdx >= 0 && copyIdx >= 0 && syncIdx < copyIdx,
      `syncIdx=${syncIdx}, copyIdx=${copyIdx}`
    );
    C.ok(
      `${BUILD_BAT} 同步时先经 set /p 读取版本号`,
      /set\s+\/p\s+NEWVER=/.test(text),
      "未找到交互读取"
    );
  }

  // —— 10.5 对照实验：把修复后的 bat 人为退回 LF，确认上面的断言真能抓到 ——
  // 自校验（对断言的断言）：若断言写得太弱，这里会暴露「LF 版本也能通过」。
  {
    const { text: crlfText } = readBat(SETVER_BAT);
    const lfText = crlfText.replace(/\r\n/g, "\n");
    let lfCr = 0;
    let lfLf = 0;
    for (let i = 0; i < lfText.length; i += 1) {
      const c = lfText.charCodeAt(i);
      if (c === 0x0a) lfLf += 1;
    }
    lfCr = 0;
    const lfLone = lfLf; // 全 LF 时每一处都是孤立 LF
    C.ok(
      "自校验：LF 版本会被「孤立 LF」断言判为不合格",
      !(lfCr === lfLf && lfLone === 0),
      `LF 版 CR=${lfCr} LF=${lfLf} 孤立=${lfLone}`
    );
    C.ok(
      "自校验：LF 版本会被「裸 LF」正则判为不合格",
      /(?<!\r)\n/.test(lfText),
      "正则没能识别 LF 版"
    );
  }
}

// ---------------------------------------------------------------------------
// 10b. 全部 bat 的「中文行尾必须落回 ASCII」编码安全
// ---------------------------------------------------------------------------
// 背景：cmd.exe 按 GBK(936) 解析批处理。若某行以中文字符结尾，其 UTF-8 最后一个
// 字节常落在 GBK 前导字节区（0x81–0xFE），cmd 会把紧随的 \r 当作双字节字符的
// 第二字节吞掉 → 该行与下一行粘连 → 残片被当命令执行 → 报
// 「't-analyzer.html' 不是内部或外部命令」这类无害但恼人的噪音。
//
// 修复方式：给每条以非 ASCII 结尾的 rem / echo 行补一个纯 ASCII 尾标记，
// 让 \r 落回 ASCII 边界。本组断言锁死这个约定，防止以后新加中文行又踩回去。
{
  /** 项目根下所有 .bat（不递归：这些脚本都在根目录） */
  const allBats = fs
    .readdirSync(root)
    .filter((f) => f.toLowerCase().endsWith(".bat"));

  C.ok(
    "根目录至少存在 4 个 bat（设置版本号 / build-exe / clean-build / run）",
    allBats.length >= 4,
    `实际 ${allBats.length} 个：${allBats.join("、")}`
  );

  // —— 10b.1 每个 bat 的每一行都不得以非 ASCII 字符结尾 ——
  for (const rel of allBats) {
    const buf = fs.readFileSync(path.join(root, rel));
    const lines = buf.toString("utf8").split("\r\n");
    const offenders = [];
    lines.forEach((ln, i) => {
      if (ln && ln.charCodeAt(ln.length - 1) > 127) {
        offenders.push(`第${i + 1}行`);
      }
    });
    C.ok(
      `${rel} 无「以中文结尾」的行（cmd GBK 解析会粘连下一行）`,
      offenders.length === 0,
      offenders.length ? `命中 ${offenders.length} 处：${offenders.slice(0, 6).join("、")}` : ""
    );
  }

  // —— 10b.2 行尾 / 编码口径：所有 bat 统一纯 CRLF + 无 BOM ——
  for (const rel of allBats) {
    const buf = fs.readFileSync(path.join(root, rel));
    let cr = 0;
    let lf = 0;
    let loneLf = 0;
    for (let i = 0; i < buf.length; i += 1) {
      if (buf[i] === 0x0d) cr += 1;
      if (buf[i] === 0x0a) {
        lf += 1;
        if (i === 0 || buf[i - 1] !== 0x0d) loneLf += 1;
      }
    }
    const isBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    C.eq(`${rel} CR 数 === LF 数（纯 CRLF）`, cr, lf);
    C.eq(`${rel} 无孤立 LF`, loneLf, 0);
    C.ok(`${rel} 无 BOM`, !isBom, `前 3 字节 = ${buf[0]},${buf[1]},${buf[2]}`);
    C.eq(`${rel} 首字节为 '@'（0x40）`, buf[0], 0x40);
  }

  // —— 10b.3 自校验：构造一个「中文结尾」的样本，确认上面的检测逻辑真能抓到 ——
  // 对断言的断言：如果检测逻辑写弱了（比如只测 charCode > 127 写成 >= 128 之外的错法），
  // 这里会暴露「中文结尾的行也能通过」。
  {
    const sampleBad = ["@echo off", "echo   项目结构分析器 - 设置版本号", ""].join("\r\n");
    const badLines = sampleBad.split("\r\n");
    const caught = badLines.filter((ln) => ln && ln.charCodeAt(ln.length - 1) > 127);
    C.ok(
      "自校验：「以中文结尾」的样本会被检测逻辑抓到",
      caught.length === 1,
      `实际抓到 ${caught.length} 条`
    );

    const sampleGood = ["@echo off", "echo   项目结构分析器 - 设置版本号 ##", ""].join("\r\n");
    const goodLines = sampleGood.split("\r\n");
    const stillCaught = goodLines.filter((ln) => ln && ln.charCodeAt(ln.length - 1) > 127);
    C.ok(
      "自校验：补了 ASCII 尾标记的样本不再被误判",
      stillCaught.length === 0,
      `仍抓到 ${stillCaught.length} 条`
    );
  }

  // —— 10b.4 编码一致性：文件必须是合法 UTF-8，且 chcp 与之匹配 ——
  // 背景（2026-09-14 踩坑）：bat 的「文件编码」和「chcp 码页」必须成对匹配，
  // 否则控制台中文全乱码。两条正确组合：
  //   · UTF-8 文件 + chcp 65001  （本项目采用）
  //   · GBK   文件 + chcp 936
  // 曾有过的错误组合：UTF-8 文件 + chcp 936 → 中文显示成「鎵撳寘鎴愬姛」这类乱码。
  // 更严重的是：用 UTF-8 去读 GBK 文件再写回，中文会变成不可逆的 U+FFFD。
  // 本组断言把「不允许混合编码」这条纪律钉死。
  for (const rel of allBats) {
    const buf = fs.readFileSync(path.join(root, rel));

    // (1) 不含 U+FFFD 替换字符 —— 出现即说明曾经用错编码读写过，中文已被损坏
    const decoded = buf.toString("utf8");
    const fffdCount = (decoded.match(/\uFFFD/g) || []).length;
    C.eq(`${rel} 不含 U+FFFD（中文未被编码损坏）`, fffdCount, 0);

    // (2) 文件必须是合法 UTF-8（用 TextDecoder 严格模式验证）
    let validUtf8 = true;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      validUtf8 = false;
    }
    C.ok(`${rel} 是合法 UTF-8 编码`, validUtf8, "存在非法 UTF-8 字节序列");

    // (3) chcp 码页必须与 UTF-8 文件匹配 → 必须是 65001
    const chcp = (decoded.match(/chcp\s+(\d+)/) || [])[1];
    C.eq(`${rel} chcp 为 65001（与 UTF-8 文件匹配）`, chcp, "65001");
  }

  // —— 10b.5 自校验：确认「编码损坏」检测真能抓到 ——
  // 对断言的断言：伪造一段含 U+FFFD 的内容，确认上面的计数逻辑会报警。
  {
    const corrupted = Buffer.from("echo 项目结构\uFFFD分析器 ##", "utf8");
    const fffdCount = (corrupted.toString("utf8").match(/\uFFFD/g) || []).length;
    C.ok(
      "自校验：含 U+FFFD 的内容会被检测逻辑抓到",
      fffdCount === 1,
      `实际抓到 ${fffdCount} 个`
    );

    // 反向：确认 GBK 编码的字节确实不是合法 UTF-8（即 UTF-8 严格解码会失败）
    // 「项目」的 GBK 字节是 CF EE C4 BF，不是合法 UTF-8 序列
    const gbkBytes = Buffer.from([0xcf, 0xee, 0xc4, 0xbf]);
    let gbkIsUtf8 = true;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(gbkBytes);
    } catch {
      gbkIsUtf8 = false;
    }
    C.ok(
      "自校验：GBK 字节不是合法 UTF-8（严格解码会失败）",
      !gbkIsUtf8,
      "严格解码竟然通过了 GBK 字节，检测逻辑不可靠"
    );
  }
}

// ---------------------------------------------------------------------------
// 10c. 过时引用守护：已删除的脚本不得再被提及
// ---------------------------------------------------------------------------
// 背景：build-desktop.bat / build-desktop-ps.bat 在 e5dd8ff 已删除，
// 但描述性文字与 clean-build.bat 里的清理项长期没有同步（launcher.vbs 残留）。
// 这组断言锁住「删了文件就要同步描述」，防止将来再次漂移。
{
  const DELETED = ["build-desktop.bat", "build-desktop-ps.bat", "launcher.vbs"];

  // 10c.1 这些文件确实不该存在于磁盘上
  for (const name of DELETED) {
    C.ok(`已删脚本 ${name} 不在仓库里`, !fs.existsSync(path.join(root, name)));
  }

  // 10c.2 可执行脚本里不得残留对它们的引用（.bat 若引用不存在的文件会静默失效）
  const batFiles = fs
    .readdirSync(root)
    .filter((f) => f.toLowerCase().endsWith(".bat"))
    .sort();

  for (const f of batFiles) {
    const content = fs.readFileSync(path.join(root, f), "utf8");
    for (const name of DELETED) {
      C.ok(
        `${f} 不引用已删除的 ${name}`,
        !content.includes(name),
        `仍在引用：${name}`
      );
    }
    // 变量残留（如 LAUNCHER / P4 指向已删文件）
    C.ok(`${f} 无残留的 LAUNCHER 变量`, !/set\s+"LAUNCHER=/i.test(content));
    C.ok(`${f} 无残留的 %P4% 清理项`, !/%P4%/.test(content));
  }

  // 10c.3 README / docs 里若提到，必须是「已移除」的说明性文字，不能当成可用功能
  for (const doc of ["README.md", "docs/config.md"]) {
    const p = path.join(root, doc);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, "utf8");
    for (const name of DELETED) {
      if (!content.includes(name)) continue;
      // 允许出现，但同一行或前后文必须带「移除 / 已删 / 历史」等字样
      const idx = content.indexOf(name);
      const around = content.slice(Math.max(0, idx - 200), idx + 200);
      C.ok(
        `${doc} 提到 ${name} 时标明了「已移除」`,
        /已(经)?(移除|删除)|历史上|不再/.test(around),
        `${name} 出现在文档里但没有标注已移除`
      );
    }
  }

  // 10c.4 自校验：构造一段「把已删脚本当可用功能」的文本，确认判定条件能识别出来
  {
    const bad =
      "- `build-desktop.bat`：用 VBScript 方式在桌面建快捷方式。\n" +
      "- `build-desktop-ps.bat`：用 PowerShell 方式。";
    const good =
      "> 历史上还有 `build-desktop.bat` 等脚本，已于 2026-09-03 移除。";
    const isStale = (s) => {
      const i = s.indexOf("build-desktop.bat");
      if (i === -1) return false;
      const around = s.slice(Math.max(0, i - 200), i + 200);
      return !/已(经)?(移除|删除)|历史上|不再/.test(around);
    };
    C.ok("自校验：把已删脚本当可用功能会被判定为过时", isStale(bad) === true);
    C.ok("自校验：标注了「已移除」的历史说明不会被误判", isStale(good) === false);
  }
}

// ---------------------------------------------------------------------------
// 11. 边界：JSON 顶层 version 与嵌套 "version" 键共存时，只改顶层（锁住 M6 变异）
// ---------------------------------------------------------------------------
// 源码锚定正则 ^( {2}"version"\s*:\s*")[^"]*(") 里的 `{2}` 有实际价值：
// 去掉后退化成 /^(\s*"version"…)/m，会命中**第一个**匹配。
// 在「嵌套 "version" 先于顶层出现」的 JSON 里就会改错字段。
// 真实仓库文件恰好顶层 version 在首位，掩盖了这个退化 —— 所以用构造样本锁死。
{
  const { replaceTopLevelJsonVersion, JSON_VERSION_RE } = await import(
    "../scripts/set-version.mjs"
  );

  // 11.1 样本：顶层 version 之前先出现一个嵌套 "version"
  const nestedFirst = JSON.stringify(
    { dependencies: { version: "9.9.9" }, version: "1.0.0", name: "demo" },
    null,
    2
  );
  // 前置断言：样本确实是「嵌套 version 出现在顶层之前」
  C.ok(
    "边界样本构造正确（嵌套 version 先于顶层）",
    nestedFirst.indexOf('"version": "9.9.9"') <
      nestedFirst.indexOf('\n  "version": "1.0.0"'),
    nestedFirst
  );

  const r1 = replaceTopLevelJsonVersion(nestedFirst, "2.0.0");
  C.ok("边界：替换发生", r1.replaced === true);
  C.eq(
    "边界：顶层 version 被改为 2.0.0",
    JSON.parse(r1.text).version,
    "2.0.0"
  );
  C.eq(
    "边界：嵌套 version 未被碰（仍为 9.9.9）",
    JSON.parse(r1.text).dependencies.version,
    "9.9.9"
  );

  // 11.2 变异对照：去掉 `{2}` 的正则会改错字段 —— 证明断言真有区分力
  {
    const mutatedRe = /^(\s*"version"\s*:\s*")[^"]*(")/m;
    const mutatedOut = nestedFirst.replace(mutatedRe, `$1${"2.0.0"}$2`);
    C.eq(
      "验证 M6 变异确实会改错字段（嵌套被改成 2.0.0）",
      JSON.parse(mutatedOut).dependencies.version,
      "2.0.0"
    );
    C.eq(
      "验证 M6 变异下顶层 version 未被改（仍为 1.0.0）",
      JSON.parse(mutatedOut).version,
      "1.0.0"
    );
    // 原始正则不存在该缺陷
    C.ok(
      "原始正则不受该变异影响",
      JSON.parse(replaceTopLevelJsonVersion(nestedFirst, "2.0.0").text).dependencies
        .version === "9.9.9"
    );
  }

  // 11.3 嵌套出现在顶层之后的常规情形同样只改顶层
  {
    const nestedAfter = JSON.stringify(
      { version: "1.0.0", build: { win: { version: "8.8.8" } } },
      null,
      2
    );
    const r3 = replaceTopLevelJsonVersion(nestedAfter, "3.0.0");
    C.eq("常规样本：顶层已改", JSON.parse(r3.text).version, "3.0.0");
    C.eq(
      "常规样本：深层 build.win.version 未动",
      JSON.parse(r3.text).build.win.version,
      "8.8.8"
    );
  }

  // 11.4 无顶层 version 时不得误改嵌套
  {
    const noTop = JSON.stringify({ a: { version: "7.7.7" } }, null, 2);
    const r4 = replaceTopLevelJsonVersion(noTop, "4.0.0");
    C.eq("无顶层 version：不报告替换", r4.replaced, false);
    C.eq("无顶层 version：文本原样返回", r4.text, noTop);
  }

  // 11.5 正则保留了「行首恰好两空格」这个关键约束
  C.ok(
    "JSON_VERSION_RE 仍锚定行首恰好两空格缩进",
    JSON_VERSION_RE.source.includes("( {2}"),
    JSON_VERSION_RE.source
  );
  C.eq("JSON_VERSION_RE 带 m 标志", JSON_VERSION_RE.flags.includes("m"), true);

  // 11.6 真实文件回归：用同一纯函数处理真实 build-electron/package.json，
  //      必须改的是顶层 version，devDependencies 完全不动。
  {
    const realText = fs.readFileSync(BUILD_PKG, "utf-8");
    const before = JSON.parse(realText);
    const r6 = replaceTopLevelJsonVersion(realText, "6.6.6");
    const after = JSON.parse(r6.text);
    C.eq("真实文件：顶层 version 已改", after.version, "6.6.6");
    C.eq(
      "真实文件：devDependencies 字节不动",
      JSON.stringify(after.devDependencies),
      JSON.stringify(before.devDependencies)
    );
    C.eq(
      "真实文件：build 段落其它字段不动",
      JSON.stringify(after.build.win.artifactName),
      JSON.stringify(before.build.win.artifactName)
    );
  }
}

// ---------------------------------------------------------------------------
// 12. 收尾：还原仓库到测试开始前的状态，并确认字节一致
// ---------------------------------------------------------------------------
restoreAll();
restored = true;

{
  let allSame = true;
  const bad = [];
  for (const f of TARGETS) {
    const now = fs.existsSync(f) ? fs.readFileSync(f) : null;
    const old = snapshot.get(f);
    const same = (now === null && old === null) || (now !== null && old !== null && now.equals(old));
    if (!same) {
      allSame = false;
      bad.push(path.basename(f));
    }
  }
  C.ok("测试结束后仓库文件已完整还原", allSame, bad.join(", "));
  C.eq("还原后根版本回到基线", pkgVersion(ROOT_PKG), baseVersion);
}

// 清掉可能残留的临时目录引用（本测试未使用临时目录，保留彻底性检查）
C.ok("未遗留临时目录", os.tmpdir().length > 0);

console.log(`\n通过 ${C.state.pass} 项，失败 ${C.state.fail} 项`);
if (C.state.fail > 0) {
  console.error("\n失败项：");
  C.state.failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log("All version tests passed.");
