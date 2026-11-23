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
This checks only that this process responds. There is no authentication,
financial logic, Gemini integration, media upload, or ledger endpoint yet.
`/v1/transactions` intentionally returns 404.

## Database schema and secrets (issue #42)

The Supabase schema lives in `supabase/migrations/` at the repository root:
`profiles`, `transactions`, `commitments` (planned events), `goals` (Heo đất)
and `goal_allocations` (Lịch sử đút heo), with integer-VND constraints and
owner-only row-level security. Apply it with the Supabase CLI
(`supabase db push`) or by running the SQL file in the project's SQL editor.

Supabase credentials are read only by this backend:

```sh
cp services/carenta-api/.env.example services/carenta-api/.env   # then fill in values
uv run --env-file services/carenta-api/.env --project services/carenta-api uvicorn app.main:app --app-dir services/carenta-api --port 8000
```

`.env` is ignored by Git. `app/settings.py` wraps the keys in `SecretStr` so
they do not appear in logs or `repr`. The service-role key bypasses RLS: never
copy it into `apps/mobile` or an `EXPO_PUBLIC_*` variable; a test checks that the
mobile sources do not reference it.

## Phone connection

Binding to `0.0.0.0` allows another device on your **trusted development network**
to reach the API. Use the computer's LAN IPv4 address and port 8000 in the mobile
configuration, not `localhost` or `0.0.0.0`. Connect both devices to the same
network and permit this port in the local firewall if needed. Do not expose this
development service to the public Internet. Stop it with Ctrl+C when finished.

No CORS change is required for native Expo Go requests. Browser support and
production deployment are outside this increment.

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
## AI assistance and review

2026-11-04: OpenCode / GPT-6.1 Sol Pro generated this isolated template,
health contract, tests, and instructions from the approved placeholder plan.
Verification results and any remaining manual checks are reported at handoff;
human inspection and teammate approval are still required.

AI assistance for this service is recorded in `docs/ai-use-log.md` and disclosed
in each PR, as `DEFINITION_OF_DONE.md` requires.
