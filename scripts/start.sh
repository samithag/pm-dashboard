#!/bin/bash
# Start the Kanban PM app (Linux/Mac)
cd "$(dirname "$0")/.."
docker compose up -d
echo "App starting at http://localhost:8000"
