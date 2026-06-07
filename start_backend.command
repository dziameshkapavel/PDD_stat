#!/bin/bash
cd "$(dirname "$0")/app/backend"
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
sleep 2
open http://127.0.0.1:8000
wait
