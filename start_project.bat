@echo off
echo ===================================
echo Starting Kairos Project
echo ===================================

echo --- Launching Backend Server...

:: We 'cd' into the backend, then find the 'venv' folder *inside* it.
START "Kairos Backend" cmd /k "cd backend && venv\Scripts\activate && flask run"

echo --- Launching Frontend App...

START "Kairos Frontend" cmd /k "cd Kairos_frontend && npm start"

