@echo off
chcp 936 >nul
title 推送到 GitHub
cd /d "%~dp0"

echo ==========================================
echo   项目结构分析器 - 推送到 GitHub
echo ==========================================
echo.
echo   仓库: https://github.com/KBrown102/project-analyzer.git
echo   分支: main      标签: v1.0.0
echo.
echo 请输入 GitHub Personal Access Token
echo   获取: https://github.com/settings/tokens
echo   权限: 必须勾选 repo 和 workflow
echo         (不勾 workflow 推 .github 会被拒绝)
echo.
set /p TOKEN=Token:

if "%TOKEN%"=="" (
    echo.
    echo [取消] 没有输入 token, 什么都没做.
    pause
    exit /b 1
)

echo.
echo 正在推送, 请稍候...
echo.

git remote set-url origin https://%TOKEN%@github.com/KBrown102/project-analyzer.git
git push -u origin main
if errorlevel 1 goto FAILED
git push origin v1.0.0
if errorlevel 1 goto FAILED

git remote set-url origin https://github.com/KBrown102/project-analyzer.git
echo.
echo ==========================================
echo   推送完成
echo     main 分支  已推送
echo     v1.0.0    已推送
echo   remote url 已复原, token 没有留存
echo ==========================================
echo.
echo 下一步: 创建 Release
echo   1. 打开
echo      https://github.com/KBrown102/project-analyzer/releases/new
echo   2. 在 Choose a tag 里选 v1.0.0
echo   3. 把下面这个文件拖进底部的附件框
echo      build-electron\dist-out\项目结构分析器-1.0.0.exe
echo   4. 点 Publish release
echo.
pause
exit /b 0

:FAILED
git remote set-url origin https://github.com/KBrown102/project-analyzer.git
echo.
echo [失败] 推送没成功, remote url 已复原.
echo.
echo 常见原因:
echo   - token 没勾 repo 或 workflow 权限
echo   - token 已过期或被撤销
echo   - 网络连不上 github.com
echo.
pause
exit /b 1
