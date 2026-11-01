# Lab 4 personal submission

Contributor: Nguyễn Phúc Khánh (25125086). Issue: [#32](https://github.com/khanhf-ng820/assistant-team07/issues/32).

## Implementation

P1–P5 and T1–T4 are implemented on `lab04/personal-api`. Chat forwards the
message/session to the existing service and adds a new 12-character hexadecimal
request ID. Feedback stays in memory, uses UTC timestamps, and requires the
configured key for listing. Weather failures without cached data return 503.
H1 and rate limiting remain with their assigned owners.

## Reproduce

From the repository root, use the separate Lab 4 environment:

```bash
cd lab04/starter
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pip install -e .
```

Copy `.env.example` to `.env` only if absent; set a local `API_ADMIN_KEY` and
keep `LLM_PROVIDER=stub`. No LLM credential is needed. Do not publish the key.

```bash
cd ../practice
../starter/.venv/bin/python -m pytest -q test_hello_api.py
cd ../starter
.venv/bin/python -m pytest -q
.venv/bin/python -m uvicorn assistant_api.main:create_app --factory --reload
```

In another terminal, from `lab04/starter`, load the local key for the supplied
curl script without printing it or putting it in shell history:

```bash
.venv/bin/python - <<'PY'
import os
import subprocess
from dotenv import load_dotenv
load_dotenv('.env', override=False)
subprocess.run(['bash', 'api-tests/curl_tests.sh'], env=os.environ.copy(), check=True)
PY
```

Inspect every printed status: the curl script itself does not enforce them.
Live weather may return 200 or 503; pytest mocks upstream responses.

## Verification

Baseline at `30d84ca`: warm-up **4 failed, 1 passed**; starter **4 failed,
19 passed, 1 skipped**. See `baseline-*.txt` (trailing whitespace trimmed).

After implementation: warm-up **5 passed**; starter **26 passed, 1 skipped**.
See `warmup-tests.txt` and `starter-tests.txt`. The additional three tests cover
distinct hexadecimal IDs, preservation of sources/degraded responses, and
session forwarding. The feedback roundtrip also checks an incorrect key.
The skipped test is the optional rate limiter. Both runs report one upstream
Starlette/AnyIO deprecation warning. No CI workflow is configured.

`curl-results.txt` records the live script, and `swagger-chat.png` shows the
actual Swagger request/response. To reproduce the screenshot, open
`http://127.0.0.1:8000/docs`, expand `POST /v1/chat`, choose **Try it out**, send
`{"message":"tuition for 18 credits and 2 retake","session_id":"demo"}`, and
capture the request plus HTTP 200 response. Do not expose the admin key.

## Pending human work

- Write the five-line [H2 reflection](reflection.md) in your own words.
- Inspect and explain the code, test evidence, and screenshot.
- Obtain teammate approval before merging; CI is unavailable, not green.
- Follow the [integration checklist](integration.md) when other PRs are ready.

## Short demo outline

1. Show the JSON request and distinguish the URL path from the POST method.
2. Explain how Pydantic validates input before `AssistantService.handle()` runs.
3. Execute chat; show the answer, sources/degraded flag, and request ID.
4. Send an empty message to demonstrate HTTP 422 and the error envelope.
5. Explain that HTTP lets other clients call the service without importing Python.
