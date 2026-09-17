# 项目结构分析器

一个独立的本地工具项目：读取你选的项目目录，判断它是什么类型、流程卡在哪一步、缺哪些关键文件，并给出下一步建议。也附带把它打包成独立 exe 的脚本。

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

## 历史快照

> 2026-09-13 新增。让这个工具从「用一次就走」变成「能回头看」。

每次分析成功会自动存一份**摘要**到浏览器 localStorage。工具栏「历史 (n/20)」按钮打开抽屉就能看到：

- **列表**：项目名、分析时间、技术类型、套用的模板、文件数、阶段进度（x/y）
- **回看**：展开那一次的完整摘要（根目录、阶段完成、产物齐全、是否截断）
- **删除**：删单条；抽屉右上角「清空全部」一次清干净

只存摘要级字段（**不存目录树**，避免撑爆 5MB 配额），最多留 **20 条**，超了自动丢最旧的。数据只在你自己的浏览器里，不上传任何地方；换浏览器、清了站点数据就没了 —— 这是刻意的。

> 怎么用：隔几周回来分析同一个目录，把两条快照的阶段完成度和产物齐全度对一下，就知道这段时间补的文档有没有真的起作用。
>
> localStorage 不可用、配额满、序列化失败都会静默降级，只丢掉历史功能，不影响分析本身。

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

所有逻辑在一个 `<script>` 里（约 3590 行，全文件 3867 行），通过 `window.__PA` 暴露核心函数给测试。双击打开即用，无构建步骤，改完刷新见效果。

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

### 最省事：在线打开

打开 https://kbrown102.github.io/project-analyzer/ ，点「在线打开分析器」，选一个目录。零安装，先试试合不合手。

> 那个页面是仓库根目录的 `index.html`，一个纯入口的落地页，不含任何分析逻辑（分析逻辑全在 `project-analyzer.html` 里）。GitHub Pages 不接受自定义入口文件名，所以入口必须叫 `index.html`。

### 次省事：下载单文件，双击就用

双击 `project-analyzer.html`，点「选择项目 A」，选一个目录。功能和在线版完全一样，多一份「断网也能用、不怕以后这个网页关掉」的保险。

### 想要独立窗口：用本机 Electron 起

双击 `run.bat`。它不打包、不下载，只是找到本机已装的 Electron 直接启动分析器，适合想要独立窗口但不想等打包的场景。

### 想要独立 exe：拷给别人用

双击 `build-exe-electron.bat`。会把 Chromium 一起打进去，成品约 80–120MB，拷到任何 Windows 电脑都能跑。

需要装 Node.js，首次运行要联网下载依赖，国内源已经配好了（npmmirror 镜像），慢慢等几分钟。打包脚本会自动同步 `project-analyzer.html` 和 `prompts/` 到 `build-electron/`，不需要手动跑 `npm run sync`。

### 改版本号

版本号是「单一数据源 + 自动同步」：**唯一源是根 `package.json` 的 `version`**，改一次会自动写到所有该出现的地方。

| 位置 | 作用 |
|---|---|
| `package.json` | 唯一数据源 |
| `build-electron/package.json` | electron-builder 靠它决定 exe 文件名与 EXE 属性里的版本 |
| `project-analyzer.html` | 导出报告页脚的「由项目结构分析器 v1.0.0 生成」水印 |
| `build-electron/project-analyzer.html` | 上一项的副本 |

两种改法，任选其一：

```bash
# 1) 双击（推荐，不打包，纯改版本号）
设置版本号.bat

# 2) 命令行
npm run version:set 1.1.0
```

不带参数运行会打印当前版本号。版本号必须是 `x.y.z` 形式，可带预发布后缀（如 `1.2.3-beta.1`）；写成 `1.2`、`abc`、`v1.0.0` 会被拒绝并保持文件不变。

`build-exe-electron.bat` 在打包前也会问一次版本号（直接回车就沿用当前版本），所以「改版本 → 打 exe」一条链路不用来回切脚本。

`build-electron/package-lock.json` 里的版本号由 npm 自己维护，不用手动改，下次 `npm install` 会自动跟随。exe 文件名（`artifactName`）已经写成 `project-analyzer-${version}.${ext}`，会自动跟随新版本号。

### 改 bat 脚本的注意事项

本项目所有 `.bat` 统一采用 **「UTF-8 无 BOM 文件 + `chcp 65001`」** 组合。改的时候有三条硬性约定，别踩：

1. **文件编码必须和 `chcp` 码页配对**。本项目的约定是：文件存 UTF-8（无 BOM），脚本第一行逻辑代码写 `chcp 65001 >nul`。
   - 若文件是 UTF-8 而 `chcp` 是 936 → 控制台输出全部乱码（如 `褰撳墠鐗堟湰`）。
   - 若文件是 GBK 而 `chcp` 是 65001 → 同样乱码。
   - 两者必须一致，这是乱码问题的唯一根因。
2. **行尾必须是 CRLF**（不能是 LF）。用某些编辑器保存成 LF 后，`cmd.exe` 会按字节偏移解析，出现 `'OOT'`、`'zer.html'` 这类错位报错，**且退出码仍是 0**，属于静默失败。
3. **每条中文行末尾要补一个 ASCII 尾标记**（当前统一用 `" ##"`）。`cmd.exe` 在按码页解析行时，中文行最后一个字节可能落在多字节序列的前导字节区，会把紧随的 `\r` 当成该字的第二字节吞掉，导致这一行和下一行粘连。

> ⚠️ **绝不要用「UTF-8 读进来、UTF-8 写回去」的方式批量改这些 bat。**
> 如果文件当前是 GBK，这种写法会把每个汉字变成 U+FFFD（`ef bf bd`），**不可逆**。
> 正确做法：先用 `new TextDecoder("gbk").decode(buf)` 解码，再按 UTF-8 写出；或直接从 git 取原始字节。

这三条都有字节级测试兜着（`tests/version.test.mjs` 的 bat 编解码断言组：CRLF / 孤立 LF / 中文结尾行 / U+FFFD / 严格 UTF-8 解码 / chcp 值），改坏了跑 `npm test` 会红。

### 清理打包产物

双击 `clean-build.bat`：它会先统计各目录大小，再让你选「只清本次产物」「连带 Electron / electron-builder 全局缓存」「全部清空（含 npm 缓存）」。打包失败时（典型如 NSIS 下载 `access is denied`）选第 2 项清缓存重试通常能解决。

## 文件说明

```
项目结构分析器-1.0.0/
├── project-analyzer.html     分析器本体，单文件零依赖（约 3750 行）
├── package.json              测试与同步脚本入口
├── LICENSE                   MIT 开源协议（Copyright (c) 2026 KBrown102）
├── build-exe-electron.bat    打包成独立 exe（打包前问版本号，自动同步 html + prompts）
├── clean-build.bat           清理打包产物与全局缓存
├── 设置版本号.bat             单独改版本号（不打包），同步到全部 4 处
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
│   ├── sync-electron.mjs     同步根 html + prompts/ 到 build-electron/
│   └── set-version.mjs       版本号单一数据源，一次同步全部 4 处
└── tests/
    ├── smoke.test.mjs        文件与资产检查（静态断言，含 prompts 副本一致性 + userData 隔离）
    ├── regex.test.mjs        正则提前闭合守护
    ├── logic.test.mjs        分析逻辑行为测试（真跑 analyze，含 AI 校验/总结/记忆）
    ├── scanner.test.mjs      Electron 目录扫描测试（真扫临时目录）
    ├── version.test.mjs      版本号同步测试（改完自动还原仓库文件）
    ├── variations.mjs        变异测试：故意改坏核心逻辑，验测试有效性（跑完自动还原）
    └── _harness.mjs          把 <script> 抽出来在 Node vm 里执行的加载器
```

## 改代码之后

分析器是单文件，改完 `project-analyzer.html` 直接刷新浏览器就能看效果，没有构建步骤。但有三件事别忘了：

```bash
npm test          # smoke + regex + logic + scanner + version，1000+ 项断言
npm run sync      # 同步根 html + prompts/ 到 build-electron/，否则打出来的是旧版
```

⚠️ 注意一个容易误判的地方：`npm test` 的**第一步就是 `sync`**，它会把两份 html 与 prompts 副本变成一致，紧接着 `logic` / `smoke` 再断言"两边一致"——这条断言此时**恒为真，抓不到任何问题**。

想真正检查"有没有忘了 sync"，要**单跑**（用的是仓库里已提交的副本）：

```bash
npm run test:logic    # 校验 build-electron/project-analyzer.html 与根文件字节一致
npm run test:smoke    # 校验 build-electron/prompts/ 与根 prompts/ 字节一致
```

## CI 会检查什么

推送到 `main` / 开 PR 时跑 `.github/workflows/ci.yml`，两个 job：

| 检查 | 失败意味着 |
| --- | --- |
| 关键文件齐全 | `package.json` / `LICENSE` / 分析器本体等 12 个核心文件有缺失，仓库结构被破坏 |
| 副本漂移 | 改了根 `project-analyzer.html` 或 `prompts/` 却没跑 `npm run sync`，打出来的 exe 会是旧版 |
| 树退化守卫 | 这次推送大面积删除了仓库内容（删掉 ≥40% 文件，或净删 ≥3000 行） |
| 全量测试 | 1000+ 项断言里有失败 |

「副本漂移」和「关键文件齐全」都**独立于 `npm test` 之外单独跑**，就是为了绕开上面说的那个假绿：`npm test` 会先把副本同步一致，再断言一致，那条断言永远为真。

**树退化守卫的由来**：2026-09-17 有过一次以空树为基线的自动 revert，一次删光全仓 48 个文件、-14680 行（`a7b8689`），靠事后人工翻仓库才发现并恢复。现在这类事故会在推送时就被拦住。确认是有意的大批量删除时，在提交信息里写上 `ALLOW-MASS-DELETE` 即可放行。

本地等价检查：`npm run verify`。

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
- 历史快照：分析成功自动存 localStorage（上限 20 条），可回看详情 / 删除单条 / 清空全部
- 可视化 HTML 报告导出：独立 HTML 文件含评级 / 亮点 / 阶段 / 产物 / 崩溃 / 建议，支持对比模式
- 崩溃日志扫描：11 类错误模式（Lua / Python / JS / Java / Go / Rust / 通用 FATAL），严重度排序，有崩溃时评级扣分
- 总体评级与工程亮点：A/B/C/D 四档 + 分项明细 + 亮点清单（从已有数据反向展示）
- 目录扫描：噪音目录不进、大文件不读内容、深度与文件数上限、空目录/不存在目录不崩
- **两条路线等价**：同一棵目录树分别走 Electron 扫描和浏览器 input，断言结论完全一致
- 两版噪音目录列表逐词比对（各 28 个），防止两边漂移导致结果不一致
- **AI 模块**（P3）：`loadAIConfig` / `saveAIConfig` 默认值与持久化、`callAI` 失败降级不阻断主功能、`loadPrompt` 占位符注入与 fallback、`parseAIJSON` 解析带围栏的 JSON、每步校验 / 整体总结的输入构造、记忆滚动 50 条与导出分组
- **打包配置**（P4）：`build-electron/prompts/` 5 个文件存在且与根字节一致、`package.json files` 含 `prompts/**`、`main.js` 显式 `setPath` userData
- **版本号同步**：合法号三处（实际四处）都改到、非法号被拒且文件零改动、幂等重设不报错、替换只动 `APP_VERSION` 声明不动正文其它 `1.0.0`、`devDependencies` 不被波及。这个测试会真实改写仓库文件，跑完自动按字节还原，不会污染工作区

这套测试用变异测试验过有效性：故意把判定分支、噪声正则、类型识别、`neg` 语义、优先级排序、`callAI` 降级、记忆容量、占位符注入、`parseAIJSON` strip、`buildDataSummary` 字段、`crashPenalty` 符号、`exportHTMLReportData` 返回值、`buildHighlights` 阈值这几处分别改坏，全部被抓到。

其中 5 个变异体固化在 `tests/variations.mjs` 里，随时可以重跑一遍验证测试仍然有效（跑完自动按字节还原 `project-analyzer.html`）：`npm run test:variations`。

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

**打开分析器：什么都不用装。** 双击 `project-analyzer.html` 就行 —— Windows / macOS / Linux 都可以，浏览器用 Edge、Chrome、Firefox、Safari 任意一个都能跑。

> 目录是用浏览器原生的 `webkitdirectory` 读的，**不是 Chrome 独占的 File System Access API**，所以换浏览器也能用。整个过程纯本地，不联网、不上传。

**只有两种情况需要额外准备：**

- **想分析几万文件的大目录**
  浏览器版超过 8000 个文件会提示，并且会明显变慢（浏览器自身限制）。
  Windows 用户可以双击 `run.bat` 走本机 Electron 扫描（需已装 Node.js + Electron；它是逐层遍历、不进入噪音目录，深度 8 层 / 3 万文件封顶）。
  macOS / Linux 目前没有对应的一键脚本，建议先把目录选到更深一层的子项目再分析。
- **想用 AI 辅助功能**
  自备 OpenAI 兼容 API key（DeepSeek / 通义 / Kimi，本地的 Ollama / LM Studio 同理）。

**只有「打包成独立 exe」这一步限 Windows x64**（双击 `build-exe-electron.bat`，需要 Node.js）。分析功能本身不挑系统，挑系统的只有打包。

## 常见问题

**分析出来的模板不对**

右上角「分析模板」下拉框可以手动切。比如一个目录被误判成库，你可以手动选成「内部工具」。

**打包失败：NSIS 下载 `access is denied`**

`electron-builder` 缓存被另一个进程锁了（或杀软实时扫描）。先看任务管理器有没有残留的 `node.exe` / `electron-builder` 进程，有就结束；再不行双击 `clean-build.bat` 选 2 清 Electron 全局缓存，重新打包会重新下载 NSIS。

**打包后的 exe 一启动就看到开发时填的 API key / 历史**

那是 `userData` 路径共享导致的——见上面「exe 版的数据存哪」。重新打包后的 exe 会用 exe 同级 `.data\` 子目录，旧残留清掉即可（关掉所有 exe → 资源管理器粘 `%APPDATA%\project-analyzer` 回车 → 删整个文件夹）。

> ⚠️ **分发 exe 给别人时，只拷 exe 单个文件，不要整个文件夹。**
> `.data\` 里存着你自己填的 **API key（明文）** 和 AI 记忆记录。`.gitignore` 能挡住它进仓库，但挡不住你顺手把整个目录压缩发出去。要分享就只发 `project-analyzer-<版本>.exe` 那一个文件；`build-electron/.data/` 只想删就直接删，下次运行会重建。

**打包产物占地方**

`build-electron/dist-out/` 和 `build-electron/node_modules/` 都是可以删的，删了重新打包会再生成。或者双击 `clean-build.bat` 一键清。

## 图标

桌面版和独立 exe 都用的是 `assets/icon.ico`。

如果你想换配色或重画，改 `assets/make-icon.py` 最上面几个颜色常量，然后双击/运行这个 Python 脚本即可重新生成 `icon.ico` 和 `icon.png`。

## 开源协议

本项目基于 [MIT License](LICENSE) 发布，Copyright (c) 2026 KBrown102。

简单说：你可以自由使用、修改、分发，包括商用，只要保留版权声明和许可声明。软件按「原样」提供，不附带任何担保。
