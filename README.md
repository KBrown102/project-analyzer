# 项目结构分析器

一个独立的本地工具项目：读取你选的项目目录，判断它是什么类型、流程卡在哪一步、缺哪些关键文件，并给出下一步建议。也附带把它变成桌面快捷方式 / 独立 exe 的打包脚本。

## 这个工具干什么

`project-analyzer.html` 会读你选的一个本地目录，然后告诉你：

- 这是什么类型的项目（游戏 / Web 应用 / 库 / 小游戏 / 内部工具 / 规则库）
- 走没走完整的流程，卡在哪一步
- 该有的文件缺哪几样
- 按优先级给出下一步该补什么
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
│   ├── main.js               窗口入口
│   ├── package.json          打包配置
│   ├── project-analyzer.html 根文件的副本（改完根文件要同步，见下）
│   └── dist-out/             打包产物（exe 在这里面，已 gitignore）
├── docs/
│   └── config.md             配置说明
├── scripts/
│   └── sync-electron.mjs     把根 html 同步到 build-electron/
└── tests/
    ├── smoke.test.mjs        文件与资产检查（静态断言）
    ├── logic.test.mjs        分析逻辑行为测试（真跑 analyze）
    └── _harness.mjs          把 <script> 抽出来在 Node vm 里执行的加载器
```

`launcher.vbs` 是建桌面快捷方式时临时生成的，用完即弃，已加进 `.gitignore`。

## 改代码之后

分析器是单文件，改完 `project-analyzer.html` 直接刷新浏览器就能看效果，没有构建步骤。但有两件事别忘了：

```bash
npm test          # smoke + logic，130+ 项断言
npm run sync      # 把根 html 同步到 build-electron/，否则打出来的是旧版
```

`npm test` 里的 `logic` 会检查两份 html 是否一致，忘了同步会直接失败。

## 测试是怎么测的

`tests/_harness.mjs` 把 `project-analyzer.html` 里的 `<script>` 块抽出来，在 Node 的 `vm` 里配上假的 `document` / `window` 跑一遍，拿到脚本自己暴露的 `window.__PA`，然后喂假目录进去做真实断言——不是对着源码字符串数数。

覆盖的内容：

- 七套模板各造一个假项目，断言能被自动识别成对应的那套
- 项目类型识别（Godot / 前端工程 / Python / 规则仓库 / HTML5 / 未识别）
- 阶段链推进（哪个阶段完成、`lastDone` / `cur` 落在哪、已完成阶段必带证据）
- 产物清单，含 `neg` 项语义（命中＝缺失，比如引了 CDN 就算「非零外部依赖」）
- 强制换模板与 `buildData` 不重读文件直接重算
- 七套 `advice*()` 的字段完整性、优先级排序、无重复
- 噪声目录过滤（`node_modules` / `.git` / `dist` 等）
- 畸形输入不抛异常（非法 JSON 的 package.json、中文与空格路径、无扩展名文件）
- 7 个假项目 × 7 套模板 = 49 个交叉组合全部跑通
- 项目边界识别：单项目 / 多项目工作区 / 谁都不像项目，以及 9 类 manifest 的识别
- 切换子项目：只统计自己的文件、`scope` 字段、切子项目不污染顶层结果
- 提示词导出：五个段落齐全、勾选状态影响输出、全不选时有兜底文案

这套测试用变异测试验过有效性：故意把游戏判定、噪声正则、类型识别、`neg` 语义、优先级排序这 5 处分别改坏，5 个全部被抓到。

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
