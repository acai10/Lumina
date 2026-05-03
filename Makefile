COMPOSE = docker compose

.PHONY: format format-frontend format-backend

format: format-frontend format-backend

format-frontend:
	$(COMPOSE) run --rm --no-deps frontend npm run format

format-backend:
	cd backend && uv run black . && uv run isort .
