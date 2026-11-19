# Makefile for the beatgen project

.PHONY: install build run clean install-frontend run-frontend install-backend run-backend all help regen-certs lint lint-backend lint-frontend format format-backend format-frontend \
	setup dev-certs supabase-keys supabase-start supabase-stop supabase-reset supabase-status dev-services dev-services-stop local-env seed-local local-up local-down

# Default target
all: install build run

# Install dependencies for both frontend and backend
install: install-frontend install-backend

# Install frontend dependencies (exactly as locked)
install-frontend:
	@echo "Installing frontend dependencies..."
	cd frontend && npm ci

# Install backend dependencies into backend/.venv, exactly as locked in backend/uv.lock.
# (backend/requirements.txt is generated from the same lock for pip-based deploys.)
install-backend:
	@echo "Installing backend dependencies..."
	cd backend && uv sync --locked

# Build frontend (adjust if necessary)
build:
	@echo "Building frontend..."
	cd frontend && npm run build

# Run frontend development server
run-frontend:
	@echo "Running frontend development server..."
	cd frontend && npm run dev

# Run backend server (adjust if necessary)
# Assuming Flask/FastAPI common run command
run-backend:
	@echo "Running backend server on https://0.0.0.0:8000..."
	# Use 0.0.0.0 to listen on all network interfaces
	# Adjust SSL certificate paths if they are different
	cd backend && uv run uvicorn app2.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile ../frontend/.cert/key.pem --ssl-certfile ../frontend/.cert/cert.pem --reload

# Run both frontend and backend (can be run in separate terminals or managed with a tool like concurrently)
run:
	@echo "To run the full application:"
	@echo "1. Open a terminal and run 'make run-frontend'"
	@echo "2. Open another terminal and run 'make run-backend'"

# Clean up build artifacts and dependencies
clean:
	@echo "Cleaning up..."
	rm -rf frontend/node_modules frontend/dist frontend/build
	rm -rf backend/__pycache__ backend/.pytest_cache backend/venv  # Adjust as needed
	find . -name '*.pyc' -delete

# Help target to display available commands
help:
	@echo "Available commands:"
	@echo "  install          - Install frontend and backend dependencies"
	@echo "  install-frontend - Install frontend dependencies"
	@echo "  install-backend  - Install backend dependencies"
	@echo "  build            - Build the frontend application"
	@echo "  run              - Instructions to run frontend and backend servers"
	@echo "  run-frontend     - Run the frontend development server"
	@echo "  run-backend      - Run the backend server"
	@echo "  clean            - Remove build artifacts and dependencies"
	@echo ""
	@echo "Local stack (Docker; see docs/local-development.md):"
	@echo "  setup            - Install deps, dev TLS certs, local JWT signing key"
	@echo "  local-up         - Start Supabase + Redis, write env files if missing, seed"
	@echo "  local-down       - Stop Supabase + Redis (data is kept)"
	@echo "  supabase-reset   - Wipe the local database and storage, re-apply migrations"
	@echo "  local-env        - (Re)write backend/.env + frontend/.env.local for the local stack"
	@echo "  seed-local       - Seed local instruments and drum samples"
	@echo "  help             - Show this help message"

# Regenerate SSL certificates for localhost using mkcert
regen-certs:
	@echo "Regenerating SSL certificates for localhost..."
	@echo "Requires mkcert (https://github.com/FiloSottile/mkcert). Run 'mkcert -install' first if needed."
	@mkdir -p frontend/.cert
	mkcert -key-file frontend/.cert/key.pem -cert-file frontend/.cert/cert.pem localhost 127.0.0.1 ::1
	@echo "Certificates regenerated in frontend/.cert/" 

lint-backend: ## check code style with ruff and black
	cd backend && ruff check . && \
		black --check --diff .

format-backend: ## format code with ruff and black
	cd backend && ruff check --fix .
	# Temporarily removed: && \
	#	ruff format . && \
	#	black .

lint-frontend: ## check code style with eslint
	cd frontend && npm run lint

format-frontend: ## format code with eslint
	cd frontend && npm run format

lint: lint-backend lint-frontend

format: format-backend format-frontend

# ---------------------------------------------------------------------------
# Local development stack: Supabase CLI (auth, storage, Postgres) + Redis.
# ---------------------------------------------------------------------------
SUPABASE := npx --yes supabase@3.2.0

# One-time workspace setup: dependencies, dev TLS certs, local JWT signing key.
setup: install dev-certs supabase-keys

# Self-signed TLS for the HTTPS dev servers (frontend/.cert is git-ignored).
# `make regen-certs` is the mkcert alternative that browsers trust.
dev-certs:
	@if [ -f frontend/.cert/key.pem ] && [ -f frontend/.cert/cert.pem ]; then \
		echo "frontend/.cert already exists"; \
	else \
		mkdir -p frontend/.cert && \
		openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
			-keyout frontend/.cert/key.pem -out frontend/.cert/cert.pem -subj "/CN=localhost" \
			-addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"; \
	fi

# The backend only accepts asymmetric (ES256/RS256) Supabase JWTs, so the local stack
# signs with a generated ES256 key (supabase/signing_keys.json, git-ignored).
supabase-keys:
	@if [ -f supabase/signing_keys.json ]; then \
		echo "supabase/signing_keys.json already exists"; \
	else \
		echo '[]' > supabase/signing_keys.json && \
		$(SUPABASE) gen signing-key --algorithm ES256 --append </dev/null; \
	fi

supabase-start: supabase-keys
	$(SUPABASE) start

supabase-stop:
	$(SUPABASE) stop

supabase-status:
	$(SUPABASE) status

# Destroys local data: re-creates the database, re-applies supabase/migrations, re-creates buckets.
supabase-reset:
	$(SUPABASE) db reset

dev-services:
	docker compose -f docker-compose.dev.yml up -d --wait

dev-services-stop:
	docker compose -f docker-compose.dev.yml stop

# Writes backend/.env and frontend/.env.local from `supabase status` (never overwrites).
local-env:
	python3 scripts/local_env.py --if-missing

seed-local:
	cd backend && uv run python scripts/seed_local_dev.py --skip-if-remote

local-up: supabase-start dev-services local-env seed-local

local-down: supabase-stop dev-services-stop

