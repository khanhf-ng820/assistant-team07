# CARENTA API Service

Independent Python 3.12/FastAPI service for CARENTA budget planner.
Implements the 100% deterministic budget calculation engine (zero LLM math) and Phase 1 REST endpoints (Issue #43).

## Features

- **Safe-to-Spend (Tiền còn lại, UC04):** Deterministic derivation from income, fixed costs, and protected savings.
- **Dynamic Daily Budget & Recovery (Hạn mức trong ngày & UC05):** Auto-recalculates subsequent daily limits when overspending occurs.
- **Savings Goal Projection:** Suggests daily savings contribution rate based on remaining target and deadline.
- **Transaction CRUD:** Supports paginated and date-filtered reads and idempotent writes (`idempotency_key`).
- **Dual Routing:** Endpoints are accessible via both `/api/v1` and `/v1`.

## Endpoints

- `GET /health`: Service health check.
- `GET /api/v1/transactions` (and `/v1/transactions`): List transactions with date and kind filtering.
- `POST /api/v1/transactions`: Create a transaction (requires `idempotency_key`, returns 409 on key collision with mismatched payload).
- `GET /api/v1/budget/summary`: Budget summary including Safe-to-Spend, daily allowance, and recovered subsequent limits.
- `GET /api/v1/goals`: List saving goals.
- `POST /api/v1/goals`: Create active goal (rejects client-supplied balance overrides).
- `GET /api/v1/goal`: Get current active goal.
- `PATCH /api/v1/goal`: Update goal parameters while preserving allocated savings.
- `POST /api/v1/goal/allocate`: Allocate virtual savings into goal.

Interactive OpenAPI documentation is available at `http://localhost:8000/docs`.

## Run from repository root

```sh
uv sync --project services/carenta-api --locked --python 3.12
uv run --project services/carenta-api uvicorn app.main:app --app-dir services/carenta-api --host 0.0.0.0 --port 8000
```

## Run tests

From the repository root (scoped):

```sh
uv run --project services/carenta-api python -m pytest -c services/carenta-api/pyproject.toml services/carenta-api/tests -q
```

Or from `services/carenta-api`:

```sh
cd services/carenta-api
uv run pytest
```
