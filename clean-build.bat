@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
set "BUILD=%ROOT%build-electron"

rem ---------- 待清理项 ----------
set "P1=%BUILD%\node_modules"
set "P2=%BUILD%\dist-out"
set "P3=%BUILD%\package-lock.json"
set "C1=%LocalAppData%\electron\Cache"
set "C2=%LocalAppData%\electron-builder\Cache"
set "C3=%AppData%\npm-cache"

echo.
echo   项目结构分析器 - 清理打包产物与缓存 ##
echo   =====================================
echo.
echo   当前可清理项： ##
echo.

rem 用 PowerShell 输出各目录大小，不捕获，只看 ##
powershell -NoProfile -ExecutionPolicy Bypass -Command "function F($n,$p){ if(Test-Path $p){ $s=(Get-ChildItem -LiteralPath $p -Recurse -File -EA SilentlyContinue ^| Measure-Object -Property Length -Sum).Sum; $u='B'; if($s -gt 1GB){$s=$s/1GB;$u='GB'} elseif($s -gt 1MB){$s=$s/1MB;$u='MB'} elseif($s -gt 1KB){$s=$s/1KB;$u='KB'} Write-Host ('  {0,-34} {1,8:N1} {2}' -f $n,$s,$u) } else { Write-Host ('  {0,-34} {1,8}' -f $n,'无') } } F '本次依赖 node_modules' '%BUILD%\node_modules'; F '本次打包产物 dist-out' '%BUILD%\dist-out'; F '本次锁文件 package-lock.json' '%BUILD%\package-lock.json'; F 'Electron 全局缓存' '%LocalAppData%\electron\Cache'; F 'electron-builder 全局缓存' '%LocalAppData%\electron-builder\Cache'; F 'npm 全局缓存' '%AppData%\npm-cache'"

echo.
echo   请选择： ##
echo     1  清理本次打包产物（推荐打包前用） ##
echo     2  再清 Electron / electron-builder 全局缓存 ##
echo     3  全部清理（含 npm 全局缓存） ##
echo     0  取消 ##
echo.
set /p CH="输入数字后回车: "

if "%CH%"=="0" (
  echo   已取消。 ##
  pause
  exit /b 0
)

echo.

if "%CH%"=="1" (
  echo   [1/3] 正在删除本次打包产物...
  if exist "%P1%" rd /s /q "%P1%" && echo     已删 %P1% || echo     未找到 %P1%
  if exist "%P2%" rd /s /q "%P2%" && echo     已删 %P2% || echo     未找到 %P2%
  if exist "%P3%" del /f /q "%P3%" && echo     已删 %P3% || echo     未找到 %P3%
  echo.
  echo   清理完成。下次打包会从新下载依赖。 ##
  pause
  exit /b 0
)

if "%CH%"=="2" (
  echo   [1/3] 正在删除本次打包产物...
  if exist "%P1%" rd /s /q "%P1%" && echo     已删 %P1%
  if exist "%P2%" rd /s /q "%P2%" && echo     已删 %P2%
  if exist "%P3%" del /f /q "%P3%" && echo     已删 %P3%
  echo   [2/3] 正在删除 Electron 与 electron-builder 全局缓存...
  if exist "%C1%" rd /s /q "%C1%" && echo     已删 %C1%
  if exist "%C2%" rd /s /q "%C2%" && echo     已删 %C2%
  echo.
  echo   清理完成。下次打包会重新下载 Electron 二进制。 ##
  pause
  exit /b 0
)

if "%CH%"=="3" (
  echo   [1/3] 正在删除本次打包产物...
  if exist "%P1%" rd /s /q "%P1%" && echo     已删 %P1%
  if exist "%P2%" rd /s /q "%P2%" && echo     已删 %P2%
  if exist "%P3%" del /f /q "%P3%" && echo     已删 %P3%
  echo   [2/3] 正在删除 Electron 与 electron-builder 全局缓存...
  if exist "%C1%" rd /s /q "%C1%" && echo     已删 %C1%
  if exist "%C2%" rd /s /q "%C2%" && echo     已删 %C2%
  echo   [3/3] 正在清理 npm 全局缓存...
  call npm cache clean --force >nul 2>&1 && echo     npm 缓存已清空 ## || echo     npm 缓存清理失败（可能无 Node） ##
  echo.
  echo   全部清理完成。 ##
  pause
  exit /b 0
)

echo   未知选项 "%CH%"，已取消。 ##
pause
