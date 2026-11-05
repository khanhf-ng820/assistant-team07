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

- Health: `http://localhost:8000/health`
- Interactive API documentation: `http://localhost:8000/docs`
- Response: `{"status":"ok","service":"carenta-api"}`

This checks only that this process responds. There is no database, authentication,
financial logic, Gemini integration, media upload, or ledger endpoint.
`/v1/transactions` intentionally returns 404.

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

Verified on 2026-11-05: locked dependency synchronization and all three API tests
passed. The mobile TypeScript health client also reached a real local Uvicorn
process. Review follow-up: the current response always includes both fields, but
their model defaults make them optional in the generated OpenAPI schema; tighten
that schema before using it for generated financial API contracts.

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
