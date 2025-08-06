@echo off
chcp 65001 >nul 2>&1
set LANG=zh_CN.UTF-8
set LC_ALL=zh_CN.UTF-8
node "%~dp0src\index.js" %*