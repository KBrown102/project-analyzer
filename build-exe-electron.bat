@echo off
chcp 936 >nul 2>&1
setlocal

set "SRC=%~dp0project-analyzer.html"
set "ICON=%~dp0assets\icon.ico"
set "BUILD=%~dp0build-electron"

echo.
echo   项目结构分析器 - 打包成独立 exe（Electron 方式）
echo   ==============================================
echo.
echo   说明: 这个方案会把 Chromium 运行时一起打进 exe，
echo         成品约 80-120MB，但完全独立，拷到任何 Windows 电脑都能跑。
echo         首次运行需要联网下载依赖，耗时几分钟。
echo.
echo   如果你只是自己用，更推荐 build-desktop.bat（零体积、零下载）。
echo.
pause

if not exist "%SRC%" (
  echo   [错误] 找不到 project-analyzer.html
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo   [错误] 没找到 Node.js。
  echo   请先安装: https://nodejs.org  （选 LTS 版本，一路下一步即可）
  pause
  exit /b 1
)

echo   复制页面文件与图标...
copy /Y "%SRC%" "%BUILD%\project-analyzer.html" >nul
copy /Y "%ICON%" "%BUILD%\icon.ico" >nul

cd /d "%BUILD%"

rem ---------- 国内镜像 + 跳过 Electron 下载证书验证 ----------
rem 仅本地打包使用，不修改全局 npm 配置
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set NODE_TLS_REJECT_UNAUTHORIZED=0

echo.
echo   安装依赖（首次较慢）...
echo.
call npm install --registry=https://registry.npmmirror.com
if errorlevel 1 (
  echo.
  echo   [错误] npm install 失败。
  echo   若卡在下载，可先换国内源再重试:
  echo     npm config set registry https://registry.npmmirror.com
  echo     set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  pause
  exit /b 1
)

echo.
echo   打包中（electron-builder 首次也要下载，请继续等待）...
echo.
call npm run dist
if errorlevel 1 (
  echo.
  echo   [错误] 打包失败。
  pause
  exit /b 1
)

echo.
echo   完成! 输出的 exe 在下面这个目录里:
echo   %BUILD%\dist-out\
echo.
start "" "%BUILD%\dist-out"
pause
