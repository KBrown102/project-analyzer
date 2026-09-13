# 配置说明

项目结构分析器本身是单文件零依赖的工具，需要配置的地方不多。这里说明怎么改图标、改打包产物、以及如何保证两份 HTML 始终一致。

## 环境需求

- **使用分析器**：任意安装了 Edge / Chrome 的 Windows 系统即可，直接双击 `project-analyzer.html`。
- **运行测试**：需要 Node.js 22+。
- **打包 exe**：需要 Node.js + 能访问 npm 镜像的网络（默认已配 npmmirror 镜像）。

## 项目配置

### `package.json`（根目录）

```json
{
  "scripts": {
    "test": "node scripts/sync-electron.mjs && node tests/smoke.test.mjs && node tests/regex.test.mjs && node tests/logic.test.mjs && node tests/scanner.test.mjs && node tests/version.test.mjs",
    "test:smoke": "node tests/smoke.test.mjs",
    "test:regex": "node tests/regex.test.mjs",
    "test:logic": "node tests/logic.test.mjs",
    "test:scanner": "node tests/scanner.test.mjs",
    "test:version": "node tests/version.test.mjs",
    "sync": "node scripts/sync-electron.mjs",
    "version:set": "node scripts/set-version.mjs"
  }
}
```

- `npm test`：先 sync 再跑全部五套测试（sync 放最前，否则副本落后会直接判红）。
- `npm run sync`：改完 `project-analyzer.html` 后，把最新内容同步到 `build-electron/project-analyzer.html`。
- `npm run version:set`：改版本号，一次同步全部 4 处（等价于双击 `设置版本号.bat`）。

### `.gitignore`

已默认排除：

- `node_modules/`、`build-electron/node_modules/`、`build-electron/dist-out/`
- `build-electron/package-lock.json`（本地打包生成，CI 不入库）
- `build-electron/.data/`（开发态 userData 隔离目录）
- `*.log`、`.DS_Store`、`Thumbs.db`

如果你新增了临时产物，顺手加进来。

### `build-electron/package.json`

Electron 打包配置：

- `productName`：生成的 exe 名称。
- `appId`：Windows 应用标识。
- `build.win.icon`：图标路径（默认 `icon.ico`，相对于 `build-electron/`）。
- `build.win.target.portable`：生成单文件绿色 exe，不用安装程序。

修改后重新跑 `build-exe-electron.bat` 即可。

## 图标配置

- 当前图标：`assets/icon.ico` 与 `assets/icon.png`。
- 换图标：改 `assets/make-icon.py` 最上面的颜色常量，然后运行该脚本重新生成。
- 注意：`build-electron/icon.ico` 是 Electron 打包用的副本；改完根目录下的 `assets/icon.ico`，也要同步到 `build-electron/icon.ico`，否则打出来的 exe 图标不会变。

## 启动方式

项目提供三种启动方式，按「省事 → 独立」排列：

- **浏览器版**：直接双击 `project-analyzer.html`。零安装、零下载，改完刷新即见效果。
- **本地 Electron**：双击 `run.bat`。会用本机已装的 Electron 起一个桌面窗口，不打包、不下载。适合想要独立窗口但不想等打包的场景。
- **打包成 exe**：双击 `build-exe-electron.bat`。把 Chromium 一起打进去，成品 80–120MB，可拷给别人。需要联网下载依赖。

> 历史上还有 `build-desktop.bat` / `build-desktop-ps.bat` 两个「在桌面建快捷方式」的脚本，以及它们临时生成的 `launcher.vbs`，已于 2026-09-03 移除（对应的 `launcher.vbs` 条目也已从 `.gitignore` 清理）。现在想放桌面，直接给 `project-analyzer.html` 或 `run.bat` 建快捷方式即可。

## 测试配置

- `tests/smoke.test.mjs`：静态断言，检查文件、函数名、副本一致性。
- `tests/logic.test.mjs`：行为测试，用 `node:vm` 把 `<script>` 块抽出来真跑。
- `tests/_harness.mjs`：测试加载器，负责伪造 `document` / `window`。

两套测试共同保证：改了代码不会把打包副本落下，也不会让分析逻辑悄然失效。
