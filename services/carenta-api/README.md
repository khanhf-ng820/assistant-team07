# CARENTA placeholder API

Independent Python 3.12/FastAPI project. It does not import or modify the
campus-office assistant or the lab exercises.

## Run from the repository root

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) and Python
3.12, then:

```sh
uv sync --project services/carenta-api --locked --python 3.12
uv run --project services/carenta-api uvicorn app.main:app --app-dir services/carenta-api --host 0.0.0.0 --port 8000
```

`uv` creates `services/carenta-api/.venv`; do not activate or replace the existing
root virtual environment. Dependencies are recorded in `uv.lock`.

- Health: `http://localhost:8000/health` (public)
- Authenticated identity probe: `http://localhost:8000/api/v1/auth/me` (and `/v1/auth/me`)
- Interactive API documentation: `http://localhost:8000/docs`
- Health response: `{"status":"ok","service":"carenta-api"}`

Issue #46 adds server-side Supabase JWT verification (`app/auth.py`) and structured `{ "error": { "code", "message", "request_id" } }` error responses with `X-Request-ID` tracing (`app/errors.py`). Copy `services/carenta-api/.env.example` to `services/carenta-api/.env` and pass `--env-file services/carenta-api/.env` when running `uv run`:

```sh
uv run --project services/carenta-api --env-file services/carenta-api/.env uvicorn app.main:app --app-dir services/carenta-api --host 0.0.0.0 --port 8000
```

For unauthenticated LAN testing without Supabase env vars configured, set `CARENTA_LOCAL_DEV_AUTH=true` in `.env` (automatically ignored whenever `SUPABASE_URL` or `SUPABASE_JWT_SECRET` is set). Financial ledger, budget, and database endpoints live in sibling Phase 1 issues (#42/#43).

## Phone connection

Binding to `0.0.0.0` allows another device on your **trusted development network**
to reach the API. Use the computer's LAN IPv4 address and port 8000 in the mobile
configuration, not `localhost` or `0.0.0.0`. Connect both devices to the same
network and permit this port in the local firewall if needed. Do not expose this
development service to the public Internet. Stop it with Ctrl+C when finished.

No CORS change is required for native Expo Go requests. Browser support and
production deployment are outside this increment.

## Tests

From the repository root:

```sh
uv run --project services/carenta-api python -m pytest -c services/carenta-api/pyproject.toml services/carenta-api/tests -q
```

The explicit configuration isolates these tests from the legacy root suite.
They exercise the real ASGI application through HTTPX, without a listening server
or external services.

Verified on 2026-11-05 (placeholder baseline: 3 tests) and extended for Issue #46 on 2026-11-21 (JWT auth + structured error envelope + `GET /api/v1/auth/me`, exercised through ASGI HTTPX tests). Note: OpenAPI schema for `HealthResponse` still uses field defaults (`status="ok"`, `service="carenta-api"`).

The existing root tests are separately blocked by `ModuleNotFoundError: assistant`
in `tests/test_eval.py` and `tests/test_smoke.py`. This template does not fix that
package mismatch; passing API tests are not a passing repository baseline.

## AI assistance and review

2026-11-04: OpenCode / GPT-6.1 Sol Pro generated this isolated template,
health contract, tests, and instructions from the approved placeholder plan.
Verification results and any remaining manual checks are reported at handoff;
human inspection and teammate approval are still required.

Existing files, including `docs/ai-use-log.md`, must remain unchanged for this
increment. Before committing/publishing, obtain authorization to reconcile the
canonical AI-use log requirement and include this assistance in the PR. Do not
label this contribution “AI use: None.”
