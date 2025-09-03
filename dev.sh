#!/bin/zsh
set -euo pipefail

# Kill any prior Vite/http servers on 5173 and related processes
echo "Killing any existing dev servers..."
# Kill processes on port 5173
if lsof -ti:5173 >/dev/null 2>&1; then
  echo "Killing processes on port 5173..."
  lsof -ti:5173 | xargs -I {} kill -9 {} 2>/dev/null || true
fi

# Kill any existing vite processes
if pgrep -f "vite" >/dev/null 2>&1; then
  echo "Killing existing vite processes..."
  pkill -f "vite" 2>/dev/null || true
fi

# Kill any existing node processes running our dev server
if pgrep -f "npm run dev" >/dev/null 2>&1; then
  echo "Killing existing npm dev processes..."
  pkill -f "npm run dev" 2>/dev/null || true
fi

# Wait a moment for processes to fully terminate
sleep 1

# Start Vite HTTPS dev (consolidated at repo root)
SCRIPT_DIR=${0:A:h}
REPO_ROOT=${SCRIPT_DIR}
cd "$REPO_ROOT"
export NODE_OPTIONS="--openssl-legacy-provider"

# Find a package runner with explicit PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

RUNNER=""
if command -v npm >/dev/null 2>&1; then
  RUNNER="npm run dev"
elif command -v pnpm >/dev/null 2>&1; then
  RUNNER="pnpm dev"
elif command -v yarn >/dev/null 2>&1; then
  RUNNER="yarn dev"
fi

LOG_FILE="$REPO_ROOT/dev.log"
echo "Starting dev server… (logs: $LOG_FILE)" | tee "$LOG_FILE"

if [[ -z "$RUNNER" ]]; then
  echo "No package runner found (npm/pnpm/yarn). Please install Node.js (18+) and npm, then re-run ./dev.sh" | tee -a "$LOG_FILE"
  echo "Current PATH: $PATH" | tee -a "$LOG_FILE"
  echo "Available commands:" | tee -a "$LOG_FILE"
  which npm 2>/dev/null | tee -a "$LOG_FILE" || echo "npm not found" | tee -a "$LOG_FILE"
  which pnpm 2>/dev/null | tee -a "$LOG_FILE" || echo "pnpm not found" | tee -a "$LOG_FILE"
  which yarn 2>/dev/null | tee -a "$LOG_FILE" || echo "yarn not found" | tee -a "$LOG_FILE"
  exit 1
fi

echo "Using runner: $RUNNER" | tee -a "$LOG_FILE"

# Use nohup to keep background running; write logs
# Use eval to properly handle the command with spaces
eval "nohup $RUNNER >>\"$LOG_FILE\" 2>&1 &"
VITE_PID=$!

# Wait a moment for the server to start
sleep 3

# Verify the server is actually running
if kill -0 $VITE_PID 2>/dev/null; then
  echo "Vite started successfully (PID: $VITE_PID). Open in Framer: https://framer.com/plugins/open" | tee -a "$LOG_FILE"
  echo "Local dev URL: https://localhost:5173/" | tee -a "$LOG_FILE"
else
  echo "Failed to start Vite server. Check $LOG_FILE for details." | tee -a "$LOG_FILE"
  exit 1
fi
