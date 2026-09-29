@echo off
REM Stop the Kanban PM app (Windows)
cd /d "%~dp0\.."
docker compose down
echo App stopped
