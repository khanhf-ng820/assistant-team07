# CARENTA — AI Student Budget Planner

CARENTA is an AI-assisted student budget planner. This branch currently contains a runnable **mobile/API scaffold**, not the completed planner.

What exists today:

- An Expo/React Native Android app with two tabs (**Thống kê** and **Tiết kiệm**), a shared capture chooser whose capture options are disabled, and an API connection check.
- A FastAPI service that currently exposes only `GET /health`.

> **Repository status:** `apps/` and `services/` are currently untracked. Commit them before sharing this branch; a clone of the current commit will not contain the scaffold. The architecture and delivery plan is tracked at [`docs/carenta-implementation-plan.md`](docs/carenta-implementation-plan.md).

## Prerequisites

- Git
- Node.js and npm — Node **24.x** is recommended; tested with Node `24.19.0` and npm `12.0.1`
- [`uv`](https://docs.astral.sh/uv/getting-started/installation/) and Python **3.12**
- An Android phone with **Expo Go supporting SDK 58**
- The phone and development computer on the same trusted Wi-Fi network

No API keys are required for the current scaffold. Do not add real receipts, audio, personal balances, or credentials to the repository.

## Setup

These instructions apply to the current `feat/carenta-placeholder` working tree. That branch exists only on the local machine, and `apps/` and `services/` are untracked, so a fresh clone cannot reproduce this scaffold until the code is committed and the branch is pushed.

From the repository root, **install the API dependencies**:

```bash
uv sync --project services/carenta-api --locked --python 3.12
```

`uv` creates `services/carenta-api/.venv`. Do not replace the legacy root virtual environment.

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

## Run

Start the API first in a new terminal. From the repository root:

```bash
uv run --project services/carenta-api uvicorn app.main:app \
  --app-dir services/carenta-api \
  --host 0.0.0.0 \
  --port 8000
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

Scan the QR code with Expo Go on Android. On the **Thống kê** tab, tap **Kiểm tra kết nối**; a successful request displays **API đã kết nối**.

The app still opens without `.env`, but it reports that the API is not configured. If you change `.env`, restart Metro:

```bash
npm start -- --clear --lan
```

Expo's tunnel option tunnels Metro, not the local API.

### Help and status

The current scaffold is intentionally incomplete:

- **Working:** two-tab navigation, the shared plus/capture chooser, disabled capture options, and the API health check.
- **Not implemented:** manual transactions, receipt OCR, voice entry, review/confirmation, real dashboard data, reports, spending calendar, savings, AI insights, alerts, authentication, database, Supabase, and Gemini.
- **Not available:** an installable APK or iOS build. This scaffold runs through Expo Go on Android.

For setup failures, see [Troubleshooting](#troubleshooting). For planned behavior and delivery gates, read [`docs/carenta-implementation-plan.md`](docs/carenta-implementation-plan.md). Follow [`CONTRIBUTING.md`](CONTRIBUTING.md) for issues and pull requests.

## Test

Run the mobile checks from `apps/mobile`:

```bash
npm test -- --runInBand
```

Current scaffold: **4 test suites and 19 tests pass**.

Run the API tests from the repository root:

```bash
uv run --project services/carenta-api python -m pytest \
  -c services/carenta-api/pyproject.toml \
  services/carenta-api/tests -q
```

Current scaffold: **3 API tests pass**.

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
- **You need an installable app:** an APK/native build is not configured yet. The current app is an Expo Go scaffold.
