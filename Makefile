COMPOSE = docker compose

.PHONY: up down format format-frontend format-backend

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

format: format-frontend format-backend

format-frontend:
	cd frontend && npm run format

format-backend:
	cd backend && uv run black . && uv run isort .
