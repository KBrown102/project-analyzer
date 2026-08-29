@echo off
chcp 936 >nul 2>&1
setlocal enabledelayedexpansion

set "HTML=%~dp0project-analyzer.html"
set "DIR=%~dp0"

echo.
echo   项目结构分析器 - 桌面启动器生成
echo   ================================
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

rem ---------- 生成 vbs 启动器（负责建快捷方式 + 立即启动） ----------
set "VBS=%DIR%launcher.vbs"
set "URLPATH=file:///%HTML:\=/%"
set "ICON=%~dp0assets\icon.ico"

rem 注意: sc.TargetPath 必须是纯路径，不能带引号，否则快捷方式指向无效目标
>  "%VBS%" echo On Error Resume Next
>> "%VBS%" echo Set ws = CreateObject^("WScript.Shell"^)
>> "%VBS%" echo desk = ws.SpecialFolders^("Desktop"^)
>> "%VBS%" echo If Err.Number ^<^> 0 Then WScript.Echo "FAILED 桌面路径获取失败: " ^& Err.Description : WScript.Quit 1
>> "%VBS%" echo Set sc = ws.CreateShortcut^(desk ^& "\ProjectAnalyzer.lnk"^)
>> "%VBS%" echo sc.TargetPath = "!BROWSER!"
>> "%VBS%" echo sc.Arguments = "--app=" ^& Chr^(34^) ^& "!URLPATH!" ^& Chr^(34^) ^& " --window-size=1200,900"
>> "%VBS%" echo sc.Description = "Project Analyzer"
>> "%VBS%" echo sc.IconLocation = "!ICON!"
>> "%VBS%" echo sc.Save
>> "%VBS%" echo If Err.Number ^<^> 0 Then WScript.Echo "FAILED " ^& Err.Number ^& " : " ^& Err.Description : WScript.Quit 1
>> "%VBS%" echo WScript.Echo "CREATED " ^& desk ^& "\ProjectAnalyzer.lnk"
>> "%VBS%" echo ws.Run Chr^(34^) ^& sc.TargetPath ^& Chr^(34^) ^& " " ^& sc.Arguments, 1, False

echo   已生成启动器: launcher.vbs
echo   正在创建桌面快捷方式并启动...
echo.

cscript //nologo "%VBS%"
if errorlevel 1 (
  echo.
  echo   [错误] 快捷方式没建成功，上面那行 FAILED 就是原因。
  echo   常见情况: 系统禁用了 VBScript，或桌面目录被 OneDrive 重定向。
  echo   可以改用 PowerShell 版: build-desktop-ps.bat
  echo.
  pause
  exit /b 1
)

echo.
echo   完成。桌面上已出现 ProjectAnalyzer 快捷方式。
echo   以后双击它就能打开分析器（独立窗口，没有浏览器工具栏）。
echo.
echo   说明:
echo   - 这是用浏览器的 --app 模式启动的，不需要打包运行时，零额外体积。
echo   - launcher.vbs 也可以直接双击运行，效果一样。
echo   - 想要真正的 .exe 单文件，请看同目录的 build-exe-electron.bat。
echo.
pause
