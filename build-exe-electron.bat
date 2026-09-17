@echo off
chcp 65001 >nul 2>&1
setlocal

set "SRC=%~dp0project-analyzer.html"
set "ICON=%~dp0assets\icon.ico"
set "BUILD=%~dp0build-electron"

echo.
echo   项目结构分析器 - 打包成独立 exe（Electron 方式） ##
echo   ==============================================
echo.
echo   说明: 这个方案会把 Chromium 运行时一起打进 exe， ##
echo         成品约 70MB，但完全独立，拷到任何 Windows 电脑都能跑。 ##
echo         首次运行需要联网下载依赖，耗时几分钟。 ##
echo.
echo   如果你只是想自己在电脑上用，不必打包，两种更快的方式: ##
echo     1. 直接双击 project-analyzer.html（浏览器版，零安装） ##
echo     2. 双击 run.bat（用本机已有的 Electron 起，不打包） ##
echo.
pause

if not exist "%SRC%" (
  echo   [错误] 找不到 project-analyzer.html
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo   [错误] 没找到 Node.js。 ##
  echo   请先安装: https://nodejs.org  （选 LTS 版本，一路下一步即可） ##
  pause
  exit /b 1
)

rem ---------- 版本号确认（必须在复制 html 到 build-electron 之前完成）---------- ##
rem 否则副本里的页脚版本号会落后于根文件。 ##
echo   当前版本:
call node "%~dp0scripts\set-version.mjs"
echo.
echo   请输入版本号（直接回车沿用当前版本） ##
echo   格式: x.y.z    例如 1.1.0 / 2.0.0 / 1.2.3-beta.1
set "NEWVER="
set /p NEWVER="  版本号: "
if not "%NEWVER%"=="" (
  call node "%~dp0scripts\set-version.mjs" %NEWVER%
  if errorlevel 1 (
    echo.
    echo   [错误] 版本号不合法，同步失败，未修改任何文件。 ##
    echo   请按上面的提示修正格式后重试（格式: x.y.z，如 1.1.0）。 ##
    pause
    exit /b 1
  )
) else (
  echo   沿用当前版本。 ##
)
echo.

echo   复制页面文件与图标...
copy /Y "%SRC%" "%BUILD%\project-analyzer.html" >nul
copy /Y "%ICON%" "%BUILD%\icon.ico" >nul
rem 同步 prompts/ 目录（AI 提示词文件，loadPrompt 在 exe 里用 XHR 同步取） ##
xcopy /Y /I /Q "%~dp0prompts\*" "%BUILD%\prompts\" >nul
if errorlevel 1 (
  echo   [警告] prompts/ 同步失败，AI 辅助功能将走兜底提示词。 ##
) else (
  echo   prompts/ 已同步到 build-electron\
)

cd /d "%BUILD%"

rem ---------- 国内镜像（加速 Electron 二进制下载）----------
rem 仅本地打包使用，不修改全局 npm 配置 ##
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

echo.
echo   安装依赖（首次较慢）...
echo.
call npm install --registry=https://registry.npmmirror.com
if errorlevel 1 (
  echo.
  echo   [提示] 首次安装失败，正在重试一次。 ##
  echo   若报 UNABLE_TO_VERIFY_LEAF_SIGNATURE，说明本机有代理或安全软件 ##
  echo   在拦截 HTTPS。这次重试只在子进程内放行证书校验，装完即失效， ##
  echo   不会改动系统或 npm 的全局设置。 ##
  echo.
  cmd /c "set NODE_TLS_REJECT_UNAUTHORIZED=0&& npm install --registry=https://registry.npmmirror.com"
  if errorlevel 1 (
    echo.
    echo   [错误] 重试仍然失败，请检查网络或代理设置。 ##
    echo   若只是卡在下载，可先换国内源再重试:
    echo     npm config set registry https://registry.npmmirror.com
    pause
    exit /b 1
  )
)

echo.
echo   打包中（electron-builder 首次也要下载，请继续等待）...
echo.
call npm run dist
if errorlevel 1 (
  echo.
  echo   [错误] 打包失败。 ##
  pause
  exit /b 1
)

echo.
echo   完成! 输出的 exe 在下面这个目录里:
echo   %BUILD%\dist-out\
echo.
start "" "%BUILD%\dist-out"
pause
