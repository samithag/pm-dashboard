#!/bin/bash
# Stop the Kanban PM app (Linux/Mac)
cd "$(dirname "$0")/.."
docker compose down
echo "App stopped"
