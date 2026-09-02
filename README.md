# 项目结构分析器

一个独立的本地工具项目：读取你选的项目目录，判断它是什么类型、流程卡在哪一步、缺哪些关键文件，并给出下一步建议。也附带把它变成桌面快捷方式 / 独立 exe 的打包脚本。

## 这个工具干什么

`project-analyzer.html` 会读你选的一个本地目录，然后告诉你：

- 这是什么类型的项目（游戏 / Web 应用 / 后端服务 / 库 / 命令行工具 / 桌面应用 / 移动应用 / 基础设施 / 嵌入式 / 浏览器插件 / 数据工程 / AI 机器学习 / DevOps / 微服务 / 小游戏 / 内部工具 / 规则库，共 18 套模板）
- 走没走完整的流程，卡在哪一步
- 该有的文件缺哪几样
- 按优先级给出下一步该补什么（P0–P3 分级）
- **你选的这一层到底是不是项目**——不是的话，它会告诉你子目录里哪些才是

也能同时选两个目录，并排对比。

**全程在本地浏览器里跑，不联网，不上传任何东西。**

## 选的目录不是项目怎么办

常见情况是：你选了一个工作区，里面装着好几个项目。这时候整层算出来的结果基本是错的（几个项目的文件会互相干扰）。

分析器会先判断顶层有没有「项目标志物」——`package.json`、`pyproject.toml`、`Cargo.toml`、`go.mod`、`pom.xml`、`*.sln`、`project.godot`、`*.uproject`、`conf.lua`、`composer.json`、`Gemfile` 之类。

- **顶层有** → 就是单个项目，正常分析，不打扰你
- **顶层没有** → 顶部弹出提示条，列出子目录里识别出的项目，每个标注类型和文件数

点任意一个子项目就切过去分析，**不用重新选文件夹**（文件已经在内存里了）。也可以点「整个目录」切回来。

如果连一个标志物都找不到，提示条会直说「这一层可能只是个普通文件夹」，建议直接选更深的那一层。

## 导出提示词给 AI

分析结果可以导出成一段 Markdown，直接粘给 AI 让它帮你补。

每条建议前面都有勾选框，默认全选。导出时**只包含勾选项**——不想让 AI 动的部分取消勾选就行，省 token 也避免它乱改。

点「生成提示词」可以在页面里预览，「复制」或「下载 .md」拿走。导出的内容包含：

1. 项目概况（名称、类型、模板、规模、文件类型分布）
2. 流程进度（已完成 / 未完成 / 当前阶段）
3. 产物齐全度表格（每项带证据路径）
4. 勾选的缺口，按 P0–P3 分组，每条带「该做什么」和「为什么」
5. 给 AI 的指令：要具体文件内容草稿、可以跳过哪些、依赖关系、命令要能直接跑

对比模式下不提供导出。

## 模板清单（18 套）

每套模板 = 阶段进度（phases）+ 产物清单（artifacts）+ 优化建议（advice，P0–P3 分级）。分析器根据文件路径和内容打分，选得分最高的那套。

| 模板 | 识别标志物 | 适用项目 |
|------|-----------|---------|
| `game` | `project.godot` / `*.uproject` / `conf.lua` | Unity / Godot / LÖVE 等游戏引擎项目 |
| `web` | `pages/` `views/` `routes/` 或 `.tsx/.jsx/.vue/.svelte` | 前端 Web 应用 |
| `server` | `controllers/` `middleware/` `models/` + 后端框架 | 后端服务（Express / Fastify / Spring 等） |
| `iac` | `*.tf` / `modules/` / `environments/` | 基础设施即代码（Terraform） |
| `embedded` | `CMakeLists.txt` + `hal/` `bsp/` `drivers/` + `*.ld` | 嵌入式固件 |
| `extension` | `manifest.json`(MV3) + `background/` `content/` `popup/` | 浏览器插件 |
| `data` | `dags/` / `etl/` `pipelines/` / `warehouse/ods→ads` | 数据工程（Airflow / Spark） |
| `cli` | `package.json` 的 `bin` / `__main__.py` / `argparse` `click` | 命令行工具 |
| `desktop` | Electron `main.js`+`preload.js` / Tauri / Qt / WPF | 桌面应用 |
| `mobile` | `AndroidManifest.xml` / `*.xcodeproj` / Flutter `pubspec.yaml` | 移动原生应用 |
| `aiml` | 模型权重(`*.pt` `*.safetensors`) + 训练脚本 | AI / 机器学习项目 |
| `devops` | CI 配置(`.github/workflows` `.gitlab-ci.yml`) + 容器/编排 | DevOps / CI 工程 |
| `microservice` | 多个独立服务目录 + 网关 / 契约 | 微服务架构 |
| `lib` | 根级 `package.json` 暴露 `main`/`exports`/`types` | 库 / SDK |
| `mini` | 文件少、入口 `index.html`、Canvas 动画 | 单文件 HTML5 小游戏 |
| `tool` | 文件很少、单 html / bat / sh 脚本 | 内部工具 |
| `meta` | 文档为主、源码极少 | 规则库 / 文档项目 |
| `generic` | 都不像 | 未识别（兜底） |

判定顺序经过仔细排：特异的先认（iac > embedded > extension > data > mobile > desktop > aiml > microservice > server > cli），宽泛的后认（tool / lib / generic 兜底），避免宽模板吞掉特异模板。

## 架构与设计

### 单文件零依赖

所有逻辑在一个 `<script>` 里（约 2450 行），通过 `window.__PA` 暴露核心函数给测试。双击打开即用，无构建步骤，改完刷新见效果。

取舍：分发成本为零（适合个人工具定位），代价是无法用模块化 / 类型系统 / lint 工具链。当前 2450 行接近单文件可维护性拐点，后续演进见「路线图」。

### 模板三件套

每加一套模板要动的地方：

1. `*Score(paths, texts)` —— 打分函数，扫标志物累加得分
2. `PROFILES[id]` —— 模板定义（phases + artifacts + advice 引用）
3. `*_PHASE_FILE` —— 阶段→文件建议映射表
4. `advice*(d)` —— 条件式建议生成函数（用 `phaseGap` + `hasA.*`，P0–P3 分级）
5. `detectProfile` 分支 + `detectType` 中文返回 + `PROFILE_ORDER` + `__PA` 暴露

### 判定流程

`detectProfile` 是一条 if-else 链，18 个分支按特定顺序判定，每个 score 函数打分，`≥3` 即命中。顺序敏感：特异模板在前，宽泛模板在后。**这是当前最大的脆弱点**——顺序错了会导致宽模板吞掉特异模板（已发生过 desktop→mini、devops→tool 误判，见「已知问题」）。

### 测试策略

从 html 抽取 `<script>` → Node `vm` 加载（伪造 `document`/`window`）→ 调 `__PA` 暴露的函数做真实断言，不是字符串数数。配合变异验证纪律：故意改坏判定分支，确认测试能拦住。

## 关于「上传」和性能

**文件不会被上传到任何地方。** 代码里没有任何网络请求（`fetch` / `XMLHttpRequest` / `WebSocket` 一个都没有），也不加载任何外部资源，断网也能正常用。

那为什么会看到「上传」字样？因为浏览器版用的是 `<input type="file">` 这个控件——它在 HTML 规范里就叫 *file upload control*，所以不管拿它选单个文件还是整个文件夹，系统对话框和浏览器状态提示都带着这个味儿。数据从头到尾只在你电脑的内存里。

**但浏览器版确实有个真实的性能问题**：浏览器会先把目录下**所有**文件枚举一遍，之后才轮到分析器过滤 `node_modules` 这类噪音目录。选一个大目录会明显卡顿，几万文件时尤其明显。

所以 exe 版（Electron）换了一条路：

| | 浏览器版（双击 html） | exe 版（Electron） |
|---|---|---|
| 选目录 | `<input webkitdirectory>`，浏览器枚举全部文件 | 系统目录对话框，只返回一个路径字符串 |
| 扫描 | 先建完所有 File 对象，分析器**之后**才过滤噪音 | `fs.readdir` 逐层走，噪音目录**根本不进去** |
| 上限 | 无（文件多了就卡） | 深度 8 层、3 万文件封顶，超出标记 `truncated` |

两边会自动识别环境：在 exe 里走原生扫描，在浏览器里退回 input 方式。浏览器版文件超过 8000 个会给出提示，建议改用 exe 或直接选更深的目录。

## 怎么用

### 最省事：打开就用

双击 `project-analyzer.html`，点「选择项目 A」，选一个目录。

### 想要桌面图标：二选一

| 脚本 | 什么时候用 |
|------|-----------|
| `build-desktop.bat` | 首选。零体积、不下载，用浏览器自带的 app 模式做个快捷方式 |
| `build-desktop-ps.bat` | 上面那个失败时用。同样是建快捷方式，但走 PowerShell，绕开被系统禁用的 VBScript |

两个都是双击运行，成功后桌面会出现 `ProjectAnalyzer` 图标，双击直接开一个独立窗口，没有浏览器工具栏。

### 想要独立 exe：拷给别人用

双击 `build-exe-electron.bat`。会把 Chromium 一起打进去，成品约 80–120MB，拷到任何 Windows 电脑都能跑。

需要装 Node.js，首次运行要联网下载依赖，国内源已经配好了（npmmirror 镜像），慢慢等几分钟。

## 文件说明

```
项目结构分析器-1.0.0/
├── project-analyzer.html     分析器本体，单文件零依赖
├── package.json              测试与同步脚本入口
├── build-desktop.bat         建桌面快捷方式（VBScript 方式）
├── build-desktop-ps.bat      建桌面快捷方式（PowerShell 方式）
├── build-exe-electron.bat    打包成独立 exe
├── run-local-electron.bat    不打包，直接起 Electron 预览
├── clean-build.bat           清理打包产物与全局缓存
├── assets/                   图标 icon.ico / icon.png 与生成脚本 make-icon.py
├── build-electron/           Electron 打包用目录
│   ├── main.js               窗口入口 + 原生目录选择 / 扫描的 ipc 处理
│   ├── preload.js            主进程与页面之间的桥（contextBridge）
│   ├── scanner.js            目录扫描，刻意不依赖 electron 以便单测
│   ├── package.json          打包配置
│   ├── project-analyzer.html 根文件的副本（改完根文件要同步，见下）
│   └── dist-out/             打包产物（exe 在这里面，已 gitignore）
├── deliverables/             专家评审报告（架构 / 产品 / 代码质量）
├── docs/
│   └── config.md             配置说明
├── scripts/
│   └── sync-electron.mjs     把根 html 同步到 build-electron/
└── tests/
    ├── smoke.test.mjs        文件与资产检查（静态断言）
    ├── logic.test.mjs        分析逻辑行为测试（真跑 analyze）
    ├── scanner.test.mjs      Electron 目录扫描测试（真扫临时目录）
    └── _harness.mjs          把 <script> 抽出来在 Node vm 里执行的加载器
```

`launcher.vbs` 是建桌面快捷方式时临时生成的，用完即弃，已加进 `.gitignore`。

## 改代码之后

分析器是单文件，改完 `project-analyzer.html` 直接刷新浏览器就能看效果，没有构建步骤。但有两件事别忘了：

```bash
npm test          # smoke + logic + scanner，308 项断言
npm run sync      # 把根 html 同步到 build-electron/，否则打出来的是旧版
```

`npm test` 里的 `logic` 会检查两份 html 是否一致，忘了同步会直接失败。

## 测试是怎么测的

`tests/_harness.mjs` 把 `project-analyzer.html` 里的 `<script>` 块抽出来，在 Node 的 `vm` 里配上假的 `document` / `window` 跑一遍，拿到脚本自己暴露的 `window.__PA`，然后喂假目录进去做真实断言——不是对着源码字符串数数。

覆盖的内容：

- 18 套模板各造一个假项目，断言能被自动识别成对应的那套
- 项目类型识别（Godot / 前端工程 / Python / 规则仓库 / HTML5 / 未识别）
- 阶段链推进（哪个阶段完成、`lastDone` / `cur` 落在哪、已完成阶段必带证据）
- 产物清单，含 `neg` 项语义（命中＝缺失，比如引了 CDN 就算「非零外部依赖」）
- 强制换模板与 `buildData` 不重读文件直接重算
- 18 套 `advice*()` 的字段完整性、优先级排序、无重复
- 噪声目录过滤（`node_modules` / `.git` / `dist` 等）
- 畸形输入不抛异常（非法 JSON 的 package.json、中文与空格路径、无扩展名文件）
- 18 个假项目 × 18 套模板 = 324 个交叉组合全部跑通
- 项目边界识别：单项目 / 多项目工作区 / 谁都不像项目，以及 9 类 manifest 的识别
- 切换子项目：只统计自己的文件、`scope` 字段、切子项目不污染顶层结果
- 提示词导出：五个段落齐全、勾选状态影响输出、全不选时有兜底文案
- 目录扫描：噪音目录不进、大文件不读内容、深度与文件数上限、空目录/不存在目录不崩
- **两条路线等价**：同一棵目录树分别走 Electron 扫描和浏览器 input，断言结论完全一致
- 两版噪音目录列表逐词比对（各 28 个），防止两边漂移导致结果不一致

这套测试用变异测试验过有效性：故意把判定分支、噪声正则、类型识别、`neg` 语义、优先级排序这几处分别改坏，全部被抓到。

## 已知问题与路线图

### 当前已知问题（2026-09-03 专家评审发现）

| 级别 | 问题 | 状态 |
|------|------|------|
| P0 | `desktop` 模板被 `mini` 吞：`detectProfile` 里 mini 启发式（文件少+index.html）排在 desktopScore 之前，Electron 桌面应用被误判成迷你工具 | 待修 |
| P0 | `devops` 模板被 `tool` 吞：tool 的「文件少」判定排在 devopsScore 之前，DevOps 仓库被误判成通用工具 | 待修 |
| P0 | `build-electron/` 副本落后根文件：改完根文件忘了 `npm run sync`，导致打出来的 exe 装旧版 | 待修（sync 自动化） |
| P1 | `detectProfile` 是 60 行 if-else 链，18 分支顺序敏感无文档，是上述误判的根因 | 路线图 P1 |
| P1 | 重复代码占比约 49%：18 个 score + 18 个 advice + 16 个 PHASE_FILE 模式高度一致 | 路线图 P2 |
| P1 | smoke 测试只检 7/18 套模板，漏检 11 套 | 路线图 P1 |
| P2 | 只验文件存在不验内容质量，可能制造「阶段满了=健康」的虚假安全感 | 路线图 P3 |
| P2 | 导出仅 Markdown，无 JSON/PDF，无法被脚本/CI 消费 | 路线图 P2 |

### 路线图（按优先级）

**P0 · 立即修（≤1 小时）**

- 修正 `detectProfile` 分支顺序：desktopScore 提到 mini 启发式之前、devopsScore 提到 tool 判定之前
- sync 自动化：`npm test` 前置自动跑 sync，或加 pre-commit hook，让副本漂移永不再发

**P1 · 短期（1–3 天）**

- `detectProfile` 重构为打分排序取最高（消除顺序依赖，根治误判类 bug）
- smoke 测试补全 18 套模板 + 加正则提前闭合守护测试 + detectProfile 顺序负向断言
- 正则集中管理 + 单测（防 `docs\//` 这类正则提前闭合 bug，`node --check` 查不出，只有 vm 加载才暴露）

**P2 · 中期（1–2 周）**

- 模板数据驱动化：score/advice/PHASE_FILE 抽象成数据配置 + 通用函数，预估减 ~483 行（-21%），新增模板成本从改 8 处降到改 1 处配置
- 历史快照 + 趋势对比（localStorage）：从「一次性工具」变「反复回来的诊断仪」，这是唯一的留存钩子
- JSON 导出 + CI 集成入口：打开「可被消费」的口子，走向团队工具

**P3 · 远期**

- 自定义模板 / 规则配置：解锁团队市场，为模板市场埋种
- PDF + 可分享 HTML 导出：补全「给人看」的格式
- 内容质量校验（不只验文件存在）

> 模板承载上限约 24 套（当前 18 套），超过后判定链不可维护。建议 22 套时启动数据驱动化重构。单文件约 3000 行是拆分阈值（当前 2450 行）。

## 它需要什么

- **Windows**，装了 Edge 或 Chrome（任意一个就行）
- 打包 exe 的话还需要 Node.js

## 常见问题

**快捷方式没建出来**

先改用 `build-desktop-ps.bat`。两个都失败的话，看窗口里 `FAILED` 那行写的是什么——通常会直接告诉你原因。

**分析出来的模板不对**

右上角「分析模板」下拉框可以手动切。比如一个目录被误判成库，你可以手动选成「内部工具」。

**打包产物占地方**

`build-electron/dist-out/` 和 `build-electron/node_modules/` 都是可以删的，删了重新打包会再生成。

或者双击 `clean-build.bat`：它会先统计各目录大小，再让你选「只清本次产物」「连带 Electron 全局缓存」「全部清空（含 npm 缓存）」。推荐打包前先跑一遍。

## 图标

桌面快捷方式和独立 exe 都用的是 `assets/icon.ico`。

如果你想换配色或重画，改 `assets/make-icon.py` 最上面几个颜色常量，然后双击/运行这个 Python 脚本即可重新生成 `icon.ico` 和 `icon.png`。
