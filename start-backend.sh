#!/bin/bash
cd backend && source venv/bin/activate && uvicorn app2.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile ../frontend/.cert/key.pem --ssl-certfile ../frontend/.cert/cert.pem --reload