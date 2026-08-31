// 渲染进程与主进程之间的桥。
// 页面本身拿不到 Node 能力，只能通过这里暴露的两个方法：弹原生目录框、扫描目录。
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 弹出系统目录选择框，返回选中的路径；用户取消则返回 null
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  // 扫描该路径，返回 { paths, texts, truncated }，不读大文件、不进噪音目录
  scan: (root) => ipcRenderer.invoke('fs:scan', root),
  isNative: true,
});
