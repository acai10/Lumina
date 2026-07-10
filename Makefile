COMPOSE = docker compose

.PHONY: up down format format-frontend format-backend \
	lint lint-frontend lint-backend test test-frontend test-backend

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

format: format-frontend format-backend

format-frontend:
	cd frontend && npm run format

format-backend:
	cd backend && uv run black . && uv run isort .

lint: lint-backend lint-frontend

lint-frontend:
	cd frontend && npm run lint

lint-backend:
	cd backend && uv run ruff check src/ && uv run mypy src/

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest

# Frontend has no test runner yet; build (with tsc typecheck) is the closest gate.
test-frontend:
	cd frontend && npm run build
