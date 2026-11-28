# CARENTA API Service

Independent Python 3.12/FastAPI service for CARENTA budget planner.
Implements the 100% deterministic budget calculation engine (zero LLM math) and Phase 1 REST endpoints (Issue #43), plus Supabase JWT verification and structured error envelopes (Issue #46).

## Features

- **Safe-to-Spend (Tiền còn lại, UC04):** Deterministic derivation from income, fixed costs, and protected savings.
- **Dynamic Daily Budget & Recovery (Hạn mức trong ngày & UC05):** Auto-recalculates subsequent daily limits when overspending occurs.
- **Savings Goal Projection:** Suggests daily savings contribution rate based on remaining target and deadline.
- **Transaction CRUD:** Supports paginated and date-filtered reads and idempotent writes (`idempotency_key`).
- **JWT Verification & Request Correlation:** Verifies Supabase Bearer JWTs on `/api/v1/auth/me` (`app/auth.py`), supports explicit opt-in Local Dev Mode when Supabase env vars are unset, and attaches `X-Request-ID` + structured `{ "error": { "code", "message", "request_id" } }` error responses (`app/errors.py`).
- **Dual Routing:** Endpoints are accessible via both `/api/v1` and `/v1`.

## Endpoints

- `GET /health`: Public service health check (`{"status":"ok","service":"carenta-api"}`).
- `GET /api/v1/auth/me` (and `/v1/auth/me`): Authenticated Student Identity probe (`app/auth.py`).
- `GET /api/v1/transactions` (and `/v1/transactions`): List transactions with date and kind filtering.
- `POST /api/v1/transactions`: Create a transaction (requires `idempotency_key`, returns 409 when the key is reused with a different amount, kind, category, date, or note).
- `GET /api/v1/budget/summary`: Budget summary including Safe-to-Spend, daily allowance, and recovered subsequent limits.
- `GET /api/v1/goals`: List saving goals.
- `POST /api/v1/goal` (alias `POST /api/v1/goals`): Create the single active goal. Rejects client-supplied balances (422) and returns 409 if a goal is already active, so saved money is never dropped.
- `GET /api/v1/goal`: Get current active goal.
- `PATCH /api/v1/goal`: Update goal parameters while preserving allocated savings.
- `POST /api/v1/goal/allocate`: Allocate virtual savings into goal. Moves value out of `savings_reserved` first (plan §7); only the part above the reserve lowers Safe-to-Spend.
- `POST /api/v1/budget/config`: Set `opening_balance`, `unpaid_commitments`, `savings_reserved` (Phase 1 development helper).
- `POST /api/v1/capture/ocr` (also `/v1/captures/receipt`): Extract a draft from a receipt or a Vietnamese bank-transfer screenshot.

Interactive OpenAPI documentation is available at `http://localhost:8000/docs`.

## Run from repository root

```sh
uv sync --project services/carenta-api --locked --python 3.12
uv run --project services/carenta-api --env-file services/carenta-api/.env uvicorn app.main:app --app-dir services/carenta-api --host 0.0.0.0 --port 8000
```

Phase 1 financial routes enforce `get_current_identity` and isolate state per `Student Identity` (`user_id`) inside `InMemoryRepository` (mirroring `#42`'s `owner_id` invariants); live Supabase Postgres persistence is tracked separately. `days_remaining` is derived from `today` in Asia/Ho_Chi_Minh (inclusive to month-end); use the `days_remaining` query parameter on `/budget/summary` to override it per request.

For unauthenticated LAN testing without Supabase env vars configured, set `CARENTA_LOCAL_DEV_AUTH=true` in `.env` (automatically ignored whenever `SUPABASE_URL` or `SUPABASE_JWT_SECRET` is set).

## Receipt OCR (issue #48)

Set `GEMINI_API_KEY` in the ignored backend `.env` before starting Uvicorn.
`GEMINI_RECEIPT_MODEL` defaults to `gemini-3.5-flash-lite`. Use a signed-in
session or explicit LAN Local Dev Mode to call the endpoint.

The JSON request contains a single `image_base64` string for a JPEG or PNG of
up to 5 MB. FastAPI checks the content and dimensions, removes image metadata,
then sends an inline image to Gemini with a 20-second deadline. The response
contains a draft with integer VND amount, description, category, date or
timestamp, and extraction estimates. Fields without clear evidence are `null`.
The OCR request does not create a ledger transaction or store the image.
Valid uploads reserve one extraction attempt before calling Gemini. An account
gets 10 attempts per Vietnam calendar day, with a ceiling of 100 attempts per
API process across all accounts and route aliases. Local Dev Mode shares an
account quota. Limits return `429 OCR_RATE_LIMITED` and reset at midnight
Vietnam time. Counters are held in memory and also reset on process restart.

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
they do not appear in logs or `repr`. `load_supabase_settings()` intentionally
requires all three DB/admin variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`), whereas JWT-only API authentication uses
`app/auth.py` (`load_auth_config()`) and starts cleanly with `SUPABASE_URL`
(or `SUPABASE_JWT_SECRET`) alone; in secret-only mode (without
`SUPABASE_URL`), issuer (`iss`) validation is skipped because the expected
issuer is derived from `SUPABASE_URL`. The service-role key bypasses RLS: never
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

The explicit configuration isolates these tests from the legacy root suite.
They exercise the real ASGI application through HTTPX, without a listening server
or external services. Verified on 2026-11-05 (placeholder baseline), 2026-11-21
(JWT auth + structured error envelope + `GET /api/v1/auth/me`), and alongside
merged #42/#43/#70 changes.

The existing root tests are separately blocked by `ModuleNotFoundError: assistant`
in `tests/test_eval.py` and `tests/test_smoke.py`. This template does not fix that
package mismatch; passing API tests are not a passing repository baseline.

## AI assistance and review

2026-11-04: OpenCode / GPT-6.1 Sol Pro generated this isolated template,
health contract, tests, and instructions from the approved placeholder plan.
Verification results and any remaining manual checks are reported at handoff;
human inspection and teammate approval are still required.

AI assistance for this service is recorded in `docs/ai-use-log.md` and disclosed
in each PR, as `DEFINITION_OF_DONE.md` requires.
