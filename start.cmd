@echo off
cd /d "%~dp0"
node scripts/setup.mjs && node server.mjs
