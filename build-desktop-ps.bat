@echo off
chcp 936 >nul 2>&1
setlocal enabledelayedexpansion

set "HTML=%~dp0project-analyzer.html"

echo.
echo   项目结构分析器 - 桌面快捷方式（PowerShell 版）
echo   ==========================================
echo.
echo   说明: build-desktop.bat 用的是 VBScript，某些新版 Windows
echo         会禁用它。这个脚本改用 PowerShell，功能完全一样。
echo.

if not exist "%HTML%" (
  echo   [错误] 当前目录找不到 project-analyzer.html
  echo   请把本脚本和 project-analyzer.html 放在同一个文件夹里再运行。
  echo.
  pause
  exit /b 1
)

rem ---------- 找 Edge 或 Chrome ----------
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not defined BROWSER (
  echo   [错误] 没有找到 Microsoft Edge，也没有找到 Google Chrome。
  echo   请先安装其中一个浏览器，再重新运行本脚本。
  echo.
  pause
  exit /b 1
)

echo   浏览器: !BROWSER!
echo.

set "URLPATH=file:///%HTML:\=/%"
set "ICON=%~dp0assets\icon.ico"

rem 用 [char]34 拼引号，避开 bat 与 PowerShell 的双引号嵌套
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $ws = New-Object -ComObject WScript.Shell; $d = [Environment]::GetFolderPath('Desktop'); $lnk = $d + '\ProjectAnalyzer.lnk'; $sc = $ws.CreateShortcut($lnk); $sc.TargetPath = '!BROWSER!'; $sc.Arguments = '--app=' + [char]34 + '!URLPATH!' + [char]34 + ' --window-size=1200,900'; $sc.Description = 'Project Analyzer'; $sc.IconLocation = '!ICON!'; $sc.Save(); Write-Host ('CREATED ' + $lnk); Start-Process -FilePath '!BROWSER!' -ArgumentList $sc.Arguments } catch { Write-Host ('FAILED ' + $_.Exception.Message); exit 1 }"

if errorlevel 1 (
  echo.
  echo   [错误] 快捷方式没建成功，上面 FAILED 那行是原因。
  echo.
  pause
  exit /b 1
)

echo.
echo   完成。桌面上已出现 ProjectAnalyzer 快捷方式。
echo   以后双击它就能打开分析器（独立窗口，没有浏览器工具栏）。
echo.
pause
