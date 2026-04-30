@echo off
cd /d C:\Users\Drumdie\ClaudeCodeProjects\MiCartera

start "MiCartera Backend" cmd /k "cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload"

start "MiCartera Frontend" cmd /k "cd frontend && npm run dev"