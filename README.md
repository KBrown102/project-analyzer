# Claw 工具集

项目结构分析器，以及把它变成桌面快捷方式 / 独立 exe 的打包脚本。

## 这个工具干什么

`project-analyzer.html` 会读你选的一个本地目录，然后告诉你：

- 这是什么类型的项目（游戏 / Web 应用 / 库 / 小游戏 / 内部工具 / 规则库）
- 走没走完整的流程，卡在哪一步
- 该有的文件缺哪几样
- 按优先级给出下一步该补什么

也能同时选两个目录，并排对比。

**全程在本地浏览器里跑，不联网，不上传任何东西。**

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
tools/
├── project-analyzer.html     分析器本体，单文件零依赖
├── build-desktop.bat         建桌面快捷方式（VBScript 方式）
├── build-desktop-ps.bat      建桌面快捷方式（PowerShell 方式）
├── build-exe-electron.bat    打包成独立 exe
├── clean-build.bat           清理打包产物与全局缓存
├── assets/                   图标 icon.ico / icon.png 与生成脚本 make-icon.py
├── build-electron/           Electron 打包用目录
│   ├── main.js               窗口入口
│   ├── package.json          打包配置
│   └── dist-out/             打包产物（exe 在这里面）
└── launcher.vbs              建快捷方式时临时生成的脚本
```

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
