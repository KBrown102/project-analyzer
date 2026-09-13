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

**全程在本地浏览器里跑，不联网（AI 辅助功能除外，需自配 API key），不上传任何东西。**

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

## 崩溃 / 错误日志扫描

> 2026-09-14 新增。分析器会自动扫描项目里的 `.log` 文件，提取错误堆栈和关键错误信息。

如果你的项目里有 `crash.log`、`debug.log`、`error.log` 这类日志文件，分析器会：

1. 用 11 条正则匹配常见错误模式：Lua（`attempt to index` / `stack traceback`）、Python（`Traceback` / `TypeError`）、JS（`TypeError` / `UnhandledPromiseRejection`）、Java（`Exception` / `NullPointerException`）、Go（`panic`）、Rust（`panicked at`）、通用（`FATAL` / `SEGFAULT`）
2. 每条 hit 带严重度（fatal / error）、语言标签、行号、时间戳
3. 按严重度排序，每个文件最多展示 15 条
4. 有崩溃日志时，总体评级会扣分（每条扣 3 分，上限 20 分）

这部分纯规则驱动，不需要 AI，不需要联网。

## 总体评级与工程亮点

> 2026-09-14 新增。一眼看到项目整体健康度，以及哪些做得好。

### 总体评级

分析结果卡片里新增「总体评级」区块，按 A / B / C / D 四档展示工程成熟度：

| 评级 | 分数 | 含义 |
|------|------|------|
| A | ≥80 | 工程实践完善，流程齐备 |
| B | ≥60 | 基本到位，有改进空间 |
| C | ≥40 | 早期阶段，核心缺口明显 |
| D | <40 | 刚起步或缺少工程化 |

分数 = 阶段完成率 × 40% + 产物命中率 × 35% + 工程化指标 × 25% - 崩溃扣分。分项明细在评级卡片旁展示。

### 工程亮点

除了列缺口，分析器现在也会列出**做得好的地方**——已命中的 artifact 会反向包装成亮点清单，比如「阶段流程完成度高」「核心产物齐全」「CI 流水线已配置」「有测试文件」「有 README 文档」等。只改展示层，不改检测逻辑。

## 导出可视化报告

> 2026-09-14 新增。把分析结果导出成独立可分享的 HTML 文件。

顶部工具栏点「导出报告」即可下载一个 `.html` 文件，双击打开就是一份排版好的项目体检报告，包含：

- 概览统计（评级 / 文件数 / 阶段完成 / 产物命中 四宫格）
- 评级详情（阶段 / 产物 / 工程 / 崩溃扣分分项）
- 工程亮点清单
- 阶段进度网格（已完成 / 当前 / 未完成三色区分）
- 产物清点表格
- 工程化指标表格
- 崩溃日志（如有）
- 缺口列表
- 优化建议（按 P0–P3 优先级排列，带颜色标签）

报告内联 CSS，无外部依赖，拷给别人也能直接打开看。支持单项目 + 对比模式。

## AI 辅助分析（可选）

> 2026-09-03 新增。文档不全时让大模型帮你判断「这一步分析得准不准、能不能跳过」「整体应该补什么」。默认关闭，不影响主功能。

### 怎么开

顶部「AI 设置」按钮 → 打开开关 → 填三样东西：

| 字段 | 说明 | 默认 |
|------|------|------|
| Base URL | OpenAI 兼容接口的根地址 | `https://api.openai.com/v1` |
| API Key | 你的密钥，**只存本地 localStorage，不上传任何地方** | （空） |
| Model | 模型名 | `gpt-4o-mini` |

填完点「测试连接」走一发 ping，通了再保存。也支持 DeepSeek / 通义 / Kimi 等 OpenAI 兼容服务，把 Base URL 换成对应地址即可（如 `https://api.deepseek.com/v1`）。

开关关掉时，所有 AI 按钮自动隐藏，主功能完全不受影响。

### 提示词文件

`prompts/` 目录里有 5 个 `.md` 文件，可以自己改文案调 AI 行为：

| 文件 | 用途 | 占位符 |
|------|------|--------|
| `purpose.md` | 分析器是干嘛的、给 AI 的总背景 | — |
| `rules.md` | 规则约束（输出格式、JSON only、不要编造） | — |
| `spec.md` | 18 套模板的识别规则说明 | — |
| `step-check.md` | **每步校验**的提示词 | `{{stepType}}` `{{stepId}}` `{{dataSummary}}` |
| `summary.md` | **整体总结**的提示词 | `{{fullData}}` |

改完直接刷新页面就生效。如果某个文件被删了或读不到，分析器会自动用内置兜底提示词，AI 功能不中断。

> **打包成 exe 用**：`prompts/` 会被一起打进去（见下「打包配置」），用户在 exe 里改不了——只能改源码 prompts/ 再重新打包。

### 两个用法

**每步校验**：每个 phase / artifact 卡片右下角有「AI 校验」按钮。点了之后，分析器把这一步的数据摘要 + 提示词发给 AI，AI 返回 JSON 格式的判断（是否准确、是否可跳过、原因、建议），结果在卡片旁的小框里显示，**不修改任何分析结果**——只给参考。

**整体总结**：阶段进度标题旁有「AI 总结」按钮。点了之后把全部 phases + artifacts 数据塞进 `summary.md` 提示词，让 AI 给出整体缺口和建议列表。

两者都是**手动触发**，不会自动跑、不会偷偷消耗 token。

### 记忆留存

每次 AI 校验 / 总结的结果会存进 localStorage（key=`pa_ai_memory_v1`），滚动保留最近 50 条。「AI 设置」抽屉里有「导出记忆」按钮，一键下载成按项目分组的 Markdown 文件；也有「清空记忆」按钮。

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

## 架构与设计

### 单文件零依赖

所有逻辑在一个 `<script>` 里（约 3750 行），通过 `window.__PA` 暴露核心函数给测试。双击打开即用，无构建步骤，改完刷新见效果。

取舍：分发成本为零（适合个人工具定位），代价是无法用模块化 / 类型系统 / lint 工具链。当前接近单文件可维护性拐点，后续演进见「路线图」。

### 模板三件套

每加一套模板要动的地方：

1. `*Score(paths, texts)` —— 打分函数，扫标志物累加得分
2. `PROFILES[id]` —— 模板定义（phases + artifacts + advice 引用）
3. `*_PHASE_FILE` —— 阶段→文件建议映射表
4. `advice*(d)` —— 条件式建议生成函数（用 `phaseGap` + `hasA.*`，P0–P3 分级）
5. 注册进 `SCORE_REGISTRY` 数组 + `PRIORITY` 优先级表 + `detectType` 中文返回 + `__PA` 暴露

### 判定流程

`detectProfile` 不再是顺序敏感的 if-else 链。P1 重构后改成**打分注册表 + 优先级裁决**：

- `SCORE_REGISTRY` 数组列 17 个打分函数（generic 不在内，是兜底返回值）
- 每个打分函数对同一份 paths/texts 算分，`≥3` 即命中
- 同分时按 `PRIORITY` 表裁决（特征越特异优先级越高，如 `game:100` 永远赢同分）
- 特异模板（iac / embedded / extension）天然排在前，宽泛模板（tool / lib / generic）天然兜底——**不需要靠代码顺序，顺序错了也不会再误判**

这从根上修掉了 P0 时段的两个误判 bug：`desktop` 被吞进 `mini`、`devops` 被吞进 `tool`。

### 测试策略

从 html 抽取 `<script>` → Node `vm` 加载（伪造 `document` / `window` / `localStorage`）→ 调 `__PA` 暴露的函数做真实断言，不是字符串数数。配合变异验证纪律：故意改坏判定分支，确认测试能拦住。

## 关于「上传」和性能

**文件不会被上传到任何地方。** 代码里除了 AI 辅助功能（用户主动开启并配 API key 后才发起请求）外没有任何网络请求，也不加载任何外部资源，断网也能正常用。

那为什么会看到「上传」字样？因为浏览器版用的是 `<input type="file">` 这个控件——它在 HTML 规范里就叫 *file upload control*，所以不管拿它选单个文件还是整个文件夹，系统对话框和浏览器状态提示都带着这个味儿。数据从头到尾只在你电脑的内存里。

**但浏览器版确实有个真实的性能问题**：浏览器会先把目录下**所有**文件枚举一遍，之后才轮到分析器过滤 `node_modules` 这类噪音目录。选一个大目录会明显卡顿，几万文件时尤其明显。

所以 exe 版（Electron）换了一条路：

| | 浏览器版（双击 html） | exe 版（Electron） |
|---|---|---|
| 选目录 | `<input webkitdirectory>`，浏览器枚举全部文件 | 系统目录对话框，只返回一个路径字符串 |
| 扫描 | 先建完所有 File 对象，分析器**之后**才过滤噪音 | `fs.readdir` 逐层走，噪音目录**根本不进去** |
| 上限 | 无（文件多了就卡） | 深度 8 层、3 万文件封顶，超出标记 `truncated` |

两边会自动识别环境：在 exe 里走原生扫描，在浏览器里退回 input 方式。浏览器版文件超过 8000 个会给出提示，建议改用 exe 或直接选更深的目录。

### exe 版的数据存哪（userData 隔离）

> 2026-09-03 修复。之前打包后的 exe 启动会看到开发测试时填的 API key / 历史记录，看起来像「被打进 exe 里了」，其实是 Electron 默认 userData 路径共享。

`build-electron/main.js` 在 `app.whenReady()` 之前显式重定向 `userData`：

- **打包后 portable exe**：数据落在 **exe 同级的 `.data\` 子目录**（electron-builder 注入 `PORTABLE_EXECUTABLE_DIR` 环境变量）。随 exe 走，拷到哪都能用，删 `.data\` 即清空。
- **开发态 `npm start`**：数据落在 `build-electron\.data\`（已加进 `.gitignore`），与打包产物完全隔离。

两者都不再读写 `%APPDATA%\project-analyzer\`，开发态和打包态的数据互不污染。想清空旧残留：关掉所有运行中的 exe，资源管理器地址栏粘 `%APPDATA%\project-analyzer` 回车，把整个文件夹删掉。

## 怎么用

### 最省事：打开就用

双击 `project-analyzer.html`，点「选择项目 A」，选一个目录。

### 想要独立 exe：拷给别人用

双击 `build-exe-electron.bat`。会把 Chromium 一起打进去，成品约 80–120MB，拷到任何 Windows 电脑都能跑。

需要装 Node.js，首次运行要联网下载依赖，国内源已经配好了（npmmirror 镜像），慢慢等几分钟。打包脚本会自动同步 `project-analyzer.html` 和 `prompts/` 到 `build-electron/`，不需要手动跑 `npm run sync`。

### 清理打包产物

双击 `clean-build.bat`：它会先统计各目录大小，再让你选「只清本次产物」「连带 Electron / electron-builder 全局缓存」「全部清空（含 npm 缓存）」。打包失败时（典型如 NSIS 下载 `access is denied`）选第 2 项清缓存重试通常能解决。

## 文件说明

```
项目结构分析器-1.0.0/
├── project-analyzer.html     分析器本体，单文件零依赖（约 3750 行）
├── package.json              测试与同步脚本入口
├── build-exe-electron.bat    打包成独立 exe（自动同步 html + prompts）
├── clean-build.bat           清理打包产物与全局缓存
├── run.bat                   不打包，直接起 Electron 预览
├── assets/                   图标 icon.ico / icon.png 与生成脚本 make-icon.py
├── prompts/                  AI 提示词文件（5 个 .md，可编辑调 AI 行为）
│   ├── purpose.md            分析器总背景
│   ├── rules.md              规则约束（输出格式 / JSON only / 不编造）
│   ├── spec.md               18 套模板识别规则
│   ├── step-check.md         每步校验提示词（含 {{stepType}} 等占位符）
│   └── summary.md            整体总结提示词（含 {{fullData}}）
├── build-electron/           Electron 打包用目录
│   ├── main.js               窗口入口 + 原生目录选择/扫描 ipc + userData 隔离
│   ├── preload.js            主进程与页面之间的桥（contextBridge）
│   ├── scanner.js            目录扫描，刻意不依赖 electron 以便单测
│   ├── package.json          打包配置（files 含 prompts/**）
│   ├── project-analyzer.html 根文件的副本（npm run sync 自动同步）
│   ├── prompts/              根 prompts/ 的副本（npm run sync 自动同步）
│   └── dist-out/             打包产物（exe 在这里面，已 gitignore）
├── deliverables/             专家评审 / 阶段设计文档（架构 / 产品 / 代码质量 / P1–P3 设计与概览）
├── docs/
│   └── config.md             配置说明
├── scripts/
│   └── sync-electron.mjs     同步根 html + prompts/ 到 build-electron/
└── tests/
    ├── smoke.test.mjs        文件与资产检查（静态断言，含 prompts 副本一致性 + userData 隔离）
    ├── regex.test.mjs        正则提前闭合守护
    ├── logic.test.mjs        分析逻辑行为测试（真跑 analyze，含 AI 校验/总结/记忆）
    ├── scanner.test.mjs      Electron 目录扫描测试（真扫临时目录）
    └── _harness.mjs          把 <script> 抽出来在 Node vm 里执行的加载器
```

## 改代码之后

分析器是单文件，改完 `project-analyzer.html` 直接刷新浏览器就能看效果，没有构建步骤。但有三件事别忘了：

```bash
npm test          # smoke + regex + logic + scanner，852 项断言
npm run sync      # 同步根 html + prompts/ 到 build-electron/，否则打出来的是旧版
```

`npm test` 里的 `logic` 会检查两份 html 是否一致，忘了 sync 会直接失败。改了 `prompts/` 也要跑 sync，smoke 会校验 `build-electron/prompts/` 副本与根字节一致。

## 测试是怎么测的

`tests/_harness.mjs` 把 `project-analyzer.html` 里的 `<script>` 块抽出来，在 Node 的 `vm` 里配上假的 `document` / `window` / `localStorage` 跑一遍，拿到脚本自己暴露的 `window.__PA`，然后喂假目录进去做真实断言——不是对着源码字符串数数。

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
- 历史快照：分析成功自动存 localStorage，回看列表 / 删除 / 重建
- 可视化 HTML 报告导出：独立 HTML 文件含评级 / 亮点 / 阶段 / 产物 / 崩溃 / 建议，支持对比模式
- 崩溃日志扫描：11 类错误模式（Lua / Python / JS / Java / Go / Rust / 通用 FATAL），严重度排序，有崩溃时评级扣分
- 总体评级与工程亮点：A/B/C/D 四档 + 分项明细 + 亮点清单（从已有数据反向展示）
- 目录扫描：噪音目录不进、大文件不读内容、深度与文件数上限、空目录/不存在目录不崩
- **两条路线等价**：同一棵目录树分别走 Electron 扫描和浏览器 input，断言结论完全一致
- 两版噪音目录列表逐词比对（各 28 个），防止两边漂移导致结果不一致
- **AI 模块**（P3）：`loadAIConfig` / `saveAIConfig` 默认值与持久化、`callAI` 失败降级不阻断主功能、`loadPrompt` 占位符注入与 fallback、`parseAIJSON` 解析带围栏的 JSON、每步校验 / 整体总结的输入构造、记忆滚动 50 条与导出分组
- **打包配置**（P4）：`build-electron/prompts/` 5 个文件存在且与根字节一致、`package.json files` 含 `prompts/**`、`main.js` 显式 `setPath` userData

这套测试用变异测试验过有效性：故意把判定分支、噪声正则、类型识别、`neg` 语义、优先级排序、`callAI` 降级、记忆容量、占位符注入、`parseAIJSON` strip、`buildDataSummary` 字段、`crashPenalty` 符号、`exportHTMLReportData` 返回值、`buildHighlights` 阈值这几处分别改坏，全部被抓到。

## 已知问题与路线图

### 当前已知问题

| 级别 | 问题 | 状态 |
|------|------|------|
| P2 | 只验文件存在不验内容质量，可能制造「阶段满了=健康」的虚假安全感 | 路线图 P3 |
| P2 | advice 是函数式条件生成，无法序列化成数据配置（阻碍模板数据驱动化与外部规则配置） | 暂缓 |

### 已修（2026-09-03 专家评审发现）

| 原级别 | 问题 | 修复方式 |
|--------|------|---------|
| P0 | `desktop` 被吞进 `mini`、`devops` 被吞进 `tool` | P1 重构：`detectProfile` 改 `SCORE_REGISTRY` + `PRIORITY` 裁决，不再靠代码顺序 |
| P0 | `build-electron/` 副本落后根文件 | `npm run sync` 现在同步 html + prompts/；smoke 校验副本一致性；`build-exe-electron.bat` 打包前自动 copy |
| P0 | 打包后 exe 共享 `%APPDATA%\project-analyzer\` 残留 API key / 历史 | `main.js` 显式 `setPath` userData → exe 同级 `.data\`，与开发态 `build-electron\.data\` 隔离 |
| P1 | `detectProfile` 60 行 if-else 链，18 分支顺序敏感无文档 | 改打分注册表，根治误判类 bug |
| P1 | smoke 测试只检 7/18 套模板 | 现已覆盖 18 套 + prompts 副本 + userData 隔离 + AI 模块结构 |
| P2 | 只能一次性分析，无留存钩子 | 历史快照（localStorage）+ 可视化 HTML 报告导出已上线 |
| P2 | 只列缺口不展示优势，无总体评级 | 工程亮点清单 + A/B/C/D 总体评级已上线 |
| P2 | 不扫运行时日志，漏掉真实崩溃问题 | 崩溃日志扫描（11 类错误模式）已上线 |

### 路线图（按优先级）

**P2 · 中期（1–2 周）**

- 模板数据驱动化：score/advice/PHASE_FILE 抽象成数据配置 + 通用函数，预估减 ~480 行（-13%），新增模板成本从改 5 处降到改 1 处配置
- advice 数据化（外部规则配置）：解锁团队市场，为模板市场埋种
- 模块级标签分类：每个文件标成核心/UI/数据/渲染/存档，大型项目一眼看懂结构（依赖数据驱动化完成）

**P3 · 远期**

- 自定义模板 / 规则配置
- 内容质量校验（不只验文件存在）
- 历史快照 diff 对比：从「单次工具」变「反复回来的诊断仪」

> 模板承载上限约 24 套（当前 18 套），超过后判定链不可维护。建议 22 套时启动数据驱动化重构。单文件约 3750 行已逼近拆分阈值，加 P2 崩溃扫描 + HTML 报告后增长加快，下次大改时考虑按域拆分。

## 它需要什么

- **Windows**，装了 Edge 或 Chrome（任意一个就行）
- 打包 exe 的话还需要 Node.js
- AI 辅助功能需要自备 OpenAI 兼容 API key（DeepSeek / 通义 / Kimi 等都行）

## 常见问题

**分析出来的模板不对**

右上角「分析模板」下拉框可以手动切。比如一个目录被误判成库，你可以手动选成「内部工具」。

**打包失败：NSIS 下载 `access is denied`**

`electron-builder` 缓存被另一个进程锁了（或杀软实时扫描）。先看任务管理器有没有残留的 `node.exe` / `electron-builder` 进程，有就结束；再不行双击 `clean-build.bat` 选 2 清 Electron 全局缓存，重新打包会重新下载 NSIS。

**打包后的 exe 一启动就看到开发时填的 API key / 历史**

那是 `userData` 路径共享导致的——见上面「exe 版的数据存哪」。重新打包后的 exe 会用 exe 同级 `.data\` 子目录，旧残留清掉即可（关掉所有 exe → 资源管理器粘 `%APPDATA%\project-analyzer` 回车 → 删整个文件夹）。

**打包产物占地方**

`build-electron/dist-out/` 和 `build-electron/node_modules/` 都是可以删的，删了重新打包会再生成。或者双击 `clean-build.bat` 一键清。

## 图标

桌面快捷方式和独立 exe 都用的是 `assets/icon.ico`。

如果你想换配色或重画，改 `assets/make-icon.py` 最上面几个颜色常量，然后双击/运行这个 Python 脚本即可重新生成 `icon.ico` 和 `icon.png`。
