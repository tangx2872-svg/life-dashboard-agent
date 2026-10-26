@echo off
cd /d "%~dp0"
set "NODE_RUN=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "NODE_RUN=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  ) else (
    echo Please install Node.js 22 or newer, then reopen this file.
    pause
    exit /b 1
  )
)
if not exist node_modules\mysql2 (
  where npm >nul 2>nul
  if errorlevel 1 (
    if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.cjs" (
      "%NODE_RUN%" "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.cjs" install --frozen-lockfile
    ) else (
      echo Please install Node.js with npm.
      pause
      exit /b 1
    )
  ) else (
    call npm install
  )
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
if not exist .env (
  "%NODE_RUN%" scripts/local-mysql.mjs
  if errorlevel 1 (
    pause
    exit /b 1
  )
) else (
  if exist .local\mysql-local.json "%NODE_RUN%" scripts/local-mysql.mjs
)
echo Open http://127.0.0.1:3000 in your browser.
"%NODE_RUN%" --env-file=.env server/index.mjs
pause
