.PHONY: up down reset-demo test openapi

up:
	docker compose up --build

down:
	docker compose down

# вернуть базу к состоянию перед показом
reset-demo:
	docker compose exec backend python -m app.seed --reset

test:
	cd backend && pytest -ra

openapi:
	cd backend && python -m app.openapi > ../docs/openapi.yaml
