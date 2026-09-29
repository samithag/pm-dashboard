@echo off
REM Start the Kanban PM app (Windows)
cd /d "%~dp0\.."
docker compose up -d
echo App starting at http://localhost:8000
