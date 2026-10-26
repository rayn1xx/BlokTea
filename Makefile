.PHONY: up up-llm down reset-demo test openapi lock

up:
	docker compose up --build

up-llm:
	docker compose --profile llm up --build

down:
	docker compose --profile llm down

# вернуть базу к состоянию перед показом
reset-demo:
	docker compose exec backend python -m app.seed --reset

test:
	cd backend && pytest -ra

openapi:
	cd backend && python -m app.openapi > ../docs/openapi.yaml

lock:
	cd backend && uv pip compile requirements.txt --universal --python-version 3.12 --no-header --no-annotate -o requirements.lock
