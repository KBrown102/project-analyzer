// Electron 主进程：把 project-analyzer.html 装进一个独立桌面窗口
const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const path = require("path");
const { scanDir } = require("./scanner");

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
