@echo off
chcp 65001 >nul 2>&1
setlocal

rem ============================================================================
rem  设置版本号.bat —— 单独修改版本号（不打包） ##
rem  实际逻辑全部在 scripts\set-version.mjs 里，本脚本只负责交互 + 校验 + 中文提示。 ##
rem  版本号会一次性同步到三处：package.json、build-electron\package.json、 ##
rem  两个 project-analyzer.html 的导出报告页脚水印。 ##
rem ============================================================================

set "ROOT=%~dp0"
set "SETVER=%ROOT%scripts\set-version.mjs"

echo.
echo   项目结构分析器 - 设置版本号 ##
echo   ==============================================
echo.
echo   说明: 这条命令会把新版本号一次同步到三处： ##
echo         1. package.json                  （唯一数据源） ##
echo         2. build-electron\package.json   （决定 exe 文件名与 EXE 属性版本） ##
echo         3. 两个 project-analyzer.html    （导出报告页脚水印） ##
echo.
echo   本脚本只改版本号，不会打 exe。打完版本号再跑 ##
echo   build-exe-electron.bat 才会生成对应版本的成品。 ##
echo.

rem ---------- 前置检查 ----------
if not exist "%SETVER%" (
  echo   [错误] 找不到 scripts\set-version.mjs
  echo   请确认在项目根目录下运行本脚本。 ##
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo   [错误] 没找到 Node.js。 ##
  echo   请先安装: https://nodejs.org  （选 LTS 版本，一路下一步即可） ##
  echo.
  pause
  exit /b 1
)

rem ---------- 显示当前版本 ----------
echo   当前版本:
echo   --------------------------------------------------
call node "%SETVER%"
echo   --------------------------------------------------
echo.

echo   请输入版本号（直接回车沿用当前版本） ##
echo   格式: x.y.z    例如 1.1.0 / 2.0.0 / 1.2.3-beta.1
set "NEWVER="
set /p NEWVER="  版本号: "

rem ---------- 空输入：沿用当前版本 ----------
if "%NEWVER%"=="" (
  echo.
  echo   未输入版本号，沿用当前版本，未做任何修改。 ##
  echo.
  pause
  exit /b 0
)

rem ---------- 非空：交给 set-version.mjs（它负责格式校验）----------
echo.
echo   正在同步版本号 %NEWVER% ...
echo.

call node "%SETVER%" %NEWVER%
if errorlevel 1 (
  echo.
  echo   [错误] 版本号同步失败，未修改任何文件。 ##
  echo   请按上面的提示修正格式后重试。 ##
  echo.
  pause
  exit /b 1
)

echo   提示: 接下来可以双击 build-exe-electron.bat 打这个版本的 exe。 ##
echo.
pause
