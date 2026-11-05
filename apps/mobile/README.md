# CARENTA mobile placeholder

Expo / React Native / TypeScript / Expo Router, Android-first. This is the small
foundation approved from `docs/carenta-implementation-plan.md`, not the completed
budget application or a pixel-perfect implementation of its exported designs.

## What works

- Two tabs: **Thống kê** and **Tiết kiệm**.
- Shared plus button and dismissible capture chooser. Manual, receipt, and voice
  options are disabled and explicitly labeled **Chưa triển khai**.
- On-demand API connection check on Thống kê: missing configuration, pending,
  validated success, failure, retry, five-second timeout, and cancellation on
  unmount. A failed check does not block navigation.
- Initial teal/coral colors, native system font, safe areas and scrollable content.

No real or fabricated financial values, persistence, authentication, Supabase,
Gemini, camera/microphone/notification permissions, or API credentials are included.
The icon is an Expo template asset, not the final CARENTA illustration.

## Requirements

- Node **24.3+ within the 24.x line** is recommended; the exact supported engine
  range is in `package.json` (this scaffold was checked with Node 24.19.0).
- npm; dependencies are locked in `package-lock.json`. Do not install into the
  repository root or add a root workspace manifest for this increment.
- An Android phone with **Expo Go supporting SDK 58**. Check its supported SDK;
  installing dependencies or exporting a JS bundle does not prove device support.
  Compatible Android Expo Go builds are available through <https://expo.dev/go>.
- Both phone and development computer on the same trusted network.

## Run

First start the API using [`../../services/carenta-api/README.md`](../../services/carenta-api/README.md).
Then, from the repository root:

```sh
cd apps/mobile
npm ci
cp .env.example .env
```

Edit **only** `apps/mobile/.env`: replace the example address with the computer's
LAN IPv4 address. For example, `EXPO_PUBLIC_API_URL=http://192.168.1.10:8000`.
Use the actual address, not this example, `localhost`, `127.0.0.1`, or `0.0.0.0`.
The API must bind to `0.0.0.0`; allow port 8000 through the local firewall if needed.

```sh
npm start -- --lan
```

Scan the terminal QR code with Expo Go on Android. Tap **Kiểm tra kết nối**.
Without `.env`, the app still opens and explains that the API is unconfigured.
Stop/restart Metro after changing `.env`; if stale, use `npm start -- --clear --lan`.
Expo's tunnel option tunnels Metro, **not** your local API.

`EXPO_PUBLIC_*` values are public and bundled into the app: never put Gemini keys,
database secrets, tokens, or passwords there. Local HTTP is only for this health
check on a trusted network; future deployment must use HTTPS. Browser/Web support
and standalone APK/native-build configuration are deliberately deferred.

## Checks

Run inside `apps/mobile/`:

```sh
npm run typecheck
npm test -- --runInBand
npx expo install --check
npx expo export --platform android --output-dir dist
```

The tests exercise real Expo Router navigation and React Native components. Only
network/native event boundaries are simulated. The Android export is a JavaScript
bundle, **not an installable APK** or proof of a physical-device walkthrough.

### Physical Android checklist — still requires a person/device

- [ ] Launch through compatible Expo Go; initial tab is Thống kê.
- [ ] Switch tabs; plus opens the same chooser from each; Close and Android Back
      return to the originating tab without triggering a capture.
- [ ] Verify small-screen/enlarged-text scrolling, readable tab labels, system
      insets, and screen-reader focus after closing the modal.
- [ ] With the API running, connection check succeeds.
- [ ] Stop the API: error/timeout appears, tabs still work, and retry succeeds
      after restarting the API.
- [ ] Confirm no camera/microphone/notification permission is requested.

## Verification status and known limits

Verified on 2026-11-05: clean `npm ci`, 19 mobile tests, TypeScript checking, Expo
dependency compatibility, and Android JS export passed. The actual TypeScript
health client also reached a real local Uvicorn process successfully; the separate
API suite has three passing tests. A read-only fresh-context review found no
blocking code defects; its reviewer did not independently rerun these checks.

Nonblocking review follow-ups: require both health fields in the OpenAPI schema,
increase selected Savings-label text contrast (current coral/white is 3.67:1), and
add late-response/body-completion cancellation tests. These remain deferred,
not silently treated as fixed or as proof of full accessibility compliance.

The physical-phone checklist is not claimed complete; no connected Android
device/ADB was available during setup.
The legacy root suite separately fails collection in `tests/test_eval.py` and
`tests/test_smoke.py` because `assistant` is missing. No old package or tests were
changed, and these scoped checks do not establish a passing full-repository suite.

The initial `npm audit` reports **25 transitive tooling findings: 24 moderate and
1 low, no high/critical**. They involve the Expo/Jest dependency chains (glob,
minimatch, deepmerge). Suggested automatic remediations include incompatible
SDK/Jest downgrades; `npm audit fix --force` was not used. Recheck before release,
review upstream fixes, and do not run tooling against untrusted paths/patterns.

## Preservation and AI assistance

Only new `apps/mobile/` and `services/carenta-api/` files belong to this increment.
The root manifests, ignore rules, environment, old application, labs, data,
documentation and local PDF/reference files remain untouched. Stage explicit
new paths; never stage PDFs or add PDF ignore patterns.

2026-11-04: OpenCode / GPT-6.1 Sol Pro generated the placeholder routes, reusable
components, health client, tests and setup instructions from the approved plan.
Versions were resolved with Expo's compatibility tool. Human inspection and
teammate approval remain required; no human/device checks are claimed.

The existing `docs/ai-use-log.md` is unchanged under the preservation requirement.
Before committing/publishing, separately authorize reconciliation of that
canonical log and include actual AI use and verification in the PR. No issue,
commit, push, PR, deployment or cloud account is created by running this scaffold.
