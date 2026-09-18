@echo off
title Nafas Clean Air Zone™ Fleet Mission Control
cd /d "%~dp0"
echo Starting backend server on http://localhost:8000 ...
python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000
pause
