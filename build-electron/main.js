// Electron 主进程：把 project-analyzer.html 装进一个独立桌面窗口
const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const path = require("path");
const { scanDir } = require("./scanner");

// 隔离 userData，避免打包后的 portable exe 与开发态共享 %APPDATA%\project-analyzer\
// 现象：打包后 exe 一启动就看到开发测试时填的 API key / 历史记录 / AI 记忆，
//       看起来像"打进 exe 里了"，其实是 Electron 默认 userData 路径共享。
// portable exe 运行时 electron-builder 会注入 PORTABLE_EXECUTABLE_DIR 环境变量，
// 指向 exe 所在目录；此时数据落在 exe 同级 .data\ 子目录，随 exe 走、删 .data 即清空。
// 开发态 npm start 落在 build-electron\.data\（已在 .gitignore 忽略），与打包产物完全隔离。
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
const userDataDir = isPortable
  ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, ".data")
  : path.join(__dirname, ".data");
app.setPath("userData", userDataDir);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    title: "项目结构分析器",
    backgroundColor: "#16181c",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "project-analyzer.html"));

  // 页面里的外链一律用系统默认浏览器打开（虽然此工具不联网，防患于未然）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
}

// 弹系统目录选择框，返回选中的路径；用户取消则返回 null
ipcMain.handle("dialog:openFolder", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (r.canceled || !r.filePaths || !r.filePaths.length) return null;
  return r.filePaths[0];
});

// 扫描目录，只回传路径与少量文本内容，不传文件内容以外的任何东西
ipcMain.handle("fs:scan", async (_e, root) => {
  if (!root) return null;
  return scanDir(root);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
