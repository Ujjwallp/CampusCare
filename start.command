#!/bin/bash
# Double-click this file to start CampusCare.
# It starts the local server and opens the app in your browser.
cd "$(dirname "$0")"
echo "Starting CampusCare..."
python3 run_server.py || python run_server.py
