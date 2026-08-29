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
    "test": "node tests/smoke.test.mjs && node tests/logic.test.mjs",
    "test:smoke": "node tests/smoke.test.mjs",
    "test:logic": "node tests/logic.test.mjs",
    "sync": "node scripts/sync-electron.mjs"
  }
}
```

- `npm test`：跑所有测试。
- `npm run sync`：改完 `project-analyzer.html` 后，把最新内容同步到 `build-electron/project-analyzer.html`。

### `.gitignore`

已默认排除：

- `node_modules/`、`build-electron/node_modules/`、`build-electron/dist-out/`
- `launcher.vbs`（建桌面快捷方式时临时生成）
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

## 快捷方式配置

- `build-desktop.bat`：用 VBScript 方式在桌面建快捷方式。
- `build-desktop-ps.bat`：用 PowerShell 方式，适合 VBScript 被禁用的情况。

两个脚本都会临时生成 `launcher.vbs`（在 `.gitignore` 里）。如果未来目录结构变了，改脚本里的路径即可。

## 测试配置

- `tests/smoke.test.mjs`：静态断言，检查文件、函数名、副本一致性。
- `tests/logic.test.mjs`：行为测试，用 `node:vm` 把 `<script>` 块抽出来真跑。
- `tests/_harness.mjs`：测试加载器，负责伪造 `document` / `window`。

两套测试共同保证：改了代码不会把打包副本落下，也不会让分析逻辑悄然失效。
