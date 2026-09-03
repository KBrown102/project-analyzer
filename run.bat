@echo off
chcp 936 >nul 2>&1
setlocal enabledelayedexpansion

set "BUILD=%~dp0build-electron"

echo.
echo   项目结构分析器 - 用本地 Electron 直接启动
echo   =========================================
echo.
echo   说明: 这个脚本不打包 exe，而是直接找本机已有的 Electron 启动分析器。
echo         如果你之前装过 Electron，这个脚本能绕过下载和证书问题。
echo.

rem ---------- 候选路径（从上到下优先）----------
set "ELECTRON="
if exist "%LocalAppData%\Programs\electron\electron.exe" set "ELECTRON=%LocalAppData%\Programs\electron\electron.exe"
if not defined ELECTRON if exist "%ProgramFiles%\electron\electron.exe" set "ELECTRON=%ProgramFiles%\electron\electron.exe"
if not defined ELECTRON if exist "%APPDATA%\npm\node_modules\electron\dist\electron.exe" set "ELECTRON=%APPDATA%\npm\node_modules\electron\dist\electron.exe"
if not defined ELECTRON if exist "%BUILD%\node_modules\electron\dist\electron.exe" set "ELECTRON=%BUILD%\node_modules\electron\dist\electron.exe"
if not defined ELECTRON if exist "C:\Users\Administrator\AppData\Roaming\Tencent\Marvis\User\91D366C282FBFBB2A213A3F0FAB033F2\workspace\conv_1a023d04464_81f3285778fc\temp\pi-desktop-src\node_modules\electron\dist\electron.exe" set "ELECTRON=C:\Users\Administrator\AppData\Roaming\Tencent\Marvis\User\91D366C282FBFBB2A213A3F0FAB033F2\workspace\conv_1a023d04464_81f3285778fc\temp\pi-desktop-src\node_modules\electron\dist\electron.exe"

if not defined ELECTRON (
  echo.
  echo   [错误] 没找到本地 Electron。
  echo.
  echo   已搜过这些位置:
  echo     - %LocalAppData%\Programs\electron\electron.exe
  echo     - %ProgramFiles%\electron\electron.exe
  echo     - %APPDATA%\npm\node_modules\electron\dist\electron.exe
  echo     - %BUILD%\node_modules\electron\dist\electron.exe
  echo     - 一处 Tencent Marvis 临时缓存
  echo.
  echo   如果你确定装过，把完整路径写进这个脚本第 14-18 行再试。
  echo   或者运行 build-exe-electron.bat 自动下载安装（需要联网）。
  echo.
  pause
  exit /b 1
)

echo   找到 Electron: !ELECTRON!
echo   正在启动分析器...
echo.

cd /d "%BUILD%"
"!ELECTRON!" .

echo.
echo   分析器已关闭。
echo.
pause
