# CARENTA — AI Student Budget Planner

CARENTA is an AI-assisted student budget planner. This branch currently contains a runnable **mobile/API scaffold**, not the completed planner.

What exists today:

- An Expo/React Native mobile app (Android and iOS via Expo Go) with two tabs (**Thống kê** and **Tiết kiệm**), a shared capture chooser whose capture options are still disabled, an API connection check, typed Phase 1 API contracts (`apps/mobile/src/api/`), encrypted session storage via `expo-secure-store` (`apps/mobile/src/auth/`), optional Supabase sign-in gate (`Local Dev Mode` when unconfigured), and a read-only Offline Fallback cache.
- A FastAPI service exposing `GET /health`, server-side Supabase JWT verification (`AUTH_REQUIRED` / `AUTH_TOKEN_EXPIRED` / `AUTH_SERVICE_UNAVAILABLE` structured errors + `X-Request-ID`), and `GET /api/v1/auth/me` (`/v1/auth/me`).

> **Repository status:** Follow [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`GLOSSARY.md`](GLOSSARY.md). The architecture and delivery plan is tracked at [`docs/carenta-implementation-plan.md`](docs/carenta-implementation-plan.md), and architectural decisions live under [`docs/adr/`](docs/adr/).

## Prerequisites

- Git
- Node.js and npm — Node **24.x** is recommended; tested with Node `24.19.0` and npm `12.0.1`
- [`uv`](https://docs.astral.sh/uv/getting-started/installation/) and Python **3.12**
- An Android phone or iPhone with **Expo Go supporting SDK 58**
- The phone and development computer on the same trusted Wi-Fi network

For **Local Dev Mode** over LAN, no Supabase keys are required (`CARENTA_LOCAL_DEV_AUTH=true` in `services/carenta-api/.env` when testing protected routes locally without Supabase). When Supabase Auth is enabled, configure `services/carenta-api/.env` and optional `EXPO_PUBLIC_SUPABASE_*` values in `apps/mobile/.env`. Do not add real receipts, audio, personal balances, or credentials to the repository.

## Setup

From the repository root, **install the API dependencies**:

```bash
uv sync --project services/carenta-api --locked --python 3.12
```

`uv` creates `services/carenta-api/.venv`. Do not replace the legacy root virtual environment. Copy `services/carenta-api/.env.example` to `services/carenta-api/.env` if running with Supabase JWT validation or `CARENTA_LOCAL_DEV_AUTH=true`.

**Install the mobile dependencies**:

```bash
cd apps/mobile
npm ci
cp .env.example .env
```

Edit `apps/mobile/.env` and replace the example address with your computer's LAN IPv4 address:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000
```

Find the address on macOS with:

```bash
ipconfig getifaddr en0
```

Use the real address, not `localhost`, `127.0.0.1`, or `0.0.0.0`. Values prefixed with `EXPO_PUBLIC_` are public and bundled into the app; never put secrets there. `.env` is ignored by Git.

### Interactive setup wizard

Run the guided environment wizard [`scripts/setup-carenta-env.sh`](scripts/setup-carenta-env.sh) from the repository root to populate local LAN and optional Supabase settings safely:

```bash
./scripts/setup-carenta-env.sh
```

The wizard writes `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the optional backend-only `SUPABASE_SERVICE_ROLE_KEY` consumed by `services/carenta-api/app/settings.py`, plus `CARENTA_LOCAL_DEV_AUTH` and optional `SUPABASE_JWT_SECRET` for the authentication middleware introduced in Issue #46 (PR #68).

## Run

Start the API first in a new terminal. From the repository root:

```bash
uv run --project services/carenta-api --env-file services/carenta-api/.env \
  uvicorn app.main:app --app-dir services/carenta-api --host 0.0.0.0 --port 8000
```

Verify it in another terminal:

```bash
curl http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok","service":"carenta-api"}
```

Interactive API documentation is available at <http://127.0.0.1:8000/docs>.

Then start the mobile app:

```bash
cd apps/mobile
npm start -- --lan
```

Connect your device:
- **Android**: Scan the QR code directly with the Expo Go app.
- **iOS**: Scan the QR code using the native **Camera app** (tap the banner to open in Expo Go), or open Expo Go and enter the `exp://...` URL manually.
- **iOS Simulator (macOS)**: For local simulated devices (requires full Xcode), see [`apps/mobile/README.md`](apps/mobile/README.md).

On the **Thống kê** tab, tap **Kiểm tra kết nối**; a successful request displays **API đã kết nối**.

The app still opens without `.env`, but it reports that the API is not configured. If you change `.env`, restart Metro:

```bash
npm start -- --clear --lan
```

Expo's tunnel option tunnels Metro, not the local API.

### Help and status

The current scaffold + integration layer:

- **Working:** two-tab navigation, the shared plus/capture chooser, disabled capture options, API health check, typed Phase 1 mobile API client contracts, encrypted mobile Supabase Auth state / Local Dev Mode, FastAPI JWT verification (`GET /api/v1/auth/me`), structured error envelopes, and user-scoped read-only Offline Fallback cache.
- **Not implemented in this branch:** manual transaction UI, receipt OCR, voice entry, review/confirmation, live ledger/budget database endpoints (tracked in sibling Phase 1–3 issues #42/#43/#45+), Gemini insights, and push alerts.
- **Not available:** an installable standalone APK or IPA. This app runs through Expo Go on Android and iOS.

For setup failures, see [Troubleshooting](#troubleshooting). For planned behavior and delivery gates, read [`docs/carenta-implementation-plan.md`](docs/carenta-implementation-plan.md). Follow [`CONTRIBUTING.md`](CONTRIBUTING.md) for issues and pull requests.

## Test

Run the mobile checks from `apps/mobile`:

```bash
npm run typecheck
BROWSERSLIST=defaults npm test -- --runInBand
```

Run the API tests from the repository root:

```bash
uv run --project services/carenta-api python -m pytest \
  -c services/carenta-api/pyproject.toml \
  services/carenta-api/tests -q
```

Running `pytest` at the repository root targets the unrelated legacy assistant and fails with `ModuleNotFoundError: assistant`. Use the scoped commands above as the CARENTA baseline.

## Evaluate

CARENTA does not have an accuracy benchmark yet. Evaluate the current scaffold with:

```bash
cd apps/mobile
npm run typecheck
npx expo install --check
```

Also verify that `GET /health` returns the expected JSON and that `/docs` lists the health endpoint. The planned receipt, voice, financial, authorization, latency, and usability acceptance targets are documented in [`docs/carenta-implementation-plan.md`](docs/carenta-implementation-plan.md); they are targets, not results.

Physical-device checks, an installable APK, and the future OCR/voice evaluations remain outstanding.

## Project structure

- `apps/mobile/`: Expo/React Native/TypeScript mobile app.
- `services/carenta-api/`: independent Python 3.12/FastAPI service.
- `docs/carenta-implementation-plan.md`: CARENTA architecture, scope, assignments, and delivery plan.
- `docs/`: supporting project documentation.
- `CONTRIBUTING.md`, `DEFINITION_OF_DONE.md`, `REVIEW_CHECKLIST.md`: contribution and review rules.
- Legacy, unrelated material: `src/assistant-core/`, `tests/`, `eval/`, `data/offices.csv`, `ui/`, and `lab02/`–`lab04/`.

There is no root npm workspace. Install and run mobile commands only inside `apps/mobile`.

## Troubleshooting

- **The phone cannot reach the API:** confirm Uvicorn is running with `--host 0.0.0.0`, `.env` contains the computer's LAN IPv4 address, both devices are on the same network, and port 8000 is allowed through the firewall.
- **The app still shows the old API address:** stop Metro and restart with `npm start -- --clear --lan`.
- **Expo Go rejects the project:** install an Expo Go build that supports **SDK 58** from <https://expo.dev/go>.
- **`uv` is not installed:** install it from the link in [Prerequisites](#prerequisites); `uv sync` can provision Python 3.12.
- **Port 8000 is already in use:** choose another port in the Uvicorn command and update `EXPO_PUBLIC_API_URL` to match.
- **You see `No module named assistant`:** you are running the legacy root assistant. It is not part of CARENTA; use the scoped mobile and API commands above.
- **You need an installable app:** an APK/IPA native build is not configured yet. The current app is an Expo Go scaffold.
