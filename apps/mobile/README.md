# CARENTA mobile placeholder

Expo / React Native / TypeScript / Expo Router, Android-first with iOS enabled.
Simulator and physical-device verification are separate gates. This is the small
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
- For iOS Simulator: a Mac with full Xcode, selected Xcode developer tools, an
  installed iOS Simulator runtime, and a simulator Expo Go client supporting
  SDK 58. No Apple Developer Program membership or app signing is needed for
  this simulator workflow. The iOS version on a simulated device must be
  supported by that Expo Go client.

## Install and run on Android

First start the API using [`../../services/carenta-api/README.md`](../../services/carenta-api/README.md).
Then, from the repository root:

```sh
cd apps/mobile
npm ci
```

If `apps/mobile/.env` does not exist, copy `.env.example` to `.env`. Do not
overwrite an existing `.env` or change other projects' environment files.

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
and standalone APK/IPA/native-build configuration are deliberately deferred.

## Run in the iOS Simulator on this Mac

### Manual prerequisites

1. Install full [Xcode](https://apps.apple.com/us/app/xcode/id497799835) compatible
   with this Mac; the separate Command Line Tools package is not sufficient.
2. Open Xcode and finish its first-launch setup. In **Xcode > Settings > Locations**,
   select the installed Xcode version for **Command Line Tools**.
3. In **Xcode > Settings > Components** (or **Platforms**, depending on Xcode),
   install a compatible iOS Simulator runtime. Create an iPhone simulator through
   **Window > Devices and Simulators** if none is available.
4. Check the selected tools and available simulator devices:

   ```sh
   xcode-select -p
   xcrun simctl list devices available
   ```

The developer directory should point inside the full Xcode application, not only
`/Library/Developer/CommandLineTools`; `simctl` must succeed and list an available
iPhone simulator. Do not automatically install software, change system developer
selection, upgrade macOS, enroll in paid programs, or purchase services.

See Expo's [simulator setup guide](https://docs.expo.dev/workflow/ios-simulator/).
Expo CLI can install the SDK-matching simulator Expo Go client; a simulator
download is **not** an IPA that can be installed on a physical iPhone.

### Launch and connect

Start the unchanged API using its README. From `apps/mobile/`, run:

```sh
npm run ios
```

This starts Metro and opens Expo Go in the simulator. It does **not** build a
standalone CARENTA binary. The same two tabs, capture chooser and health client
are shared with Android; no native `ios/` project or bundle identifier is needed.

An existing reachable LAN API URL also works for the simulator. If the API runs
on this same Mac, use this one-command override without overwriting `.env`:

```sh
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 npm run ios
```

Simulator loopback reaches this Mac; **a physical phone's loopback reaches the
phone itself**, not the Mac. API access from a phone instead requires a reachable
LAN/HTTPS URL. Metro's tunnel still does not tunnel the API. Stop/restart Metro
when switching the API URL; do not reuse an already-running server with stale
configuration.

If the project opens but the health check fails, verify the API is running on the
configured address/port before changing security settings. Native requests do not
need a backend CORS change. Do not disable ATS globally or add blanket cleartext
exceptions. App-config plist changes would not reconfigure an already-installed
Expo Go host.

### iOS Simulator checklist — pending until Xcode is ready

- [ ] Record the simulator device, iOS runtime and Expo Go client/SDK version.
- [ ] Launch on Thống kê; switch to Tiết kiệm and back.
- [ ] Open plus from either tab; Đóng dismisses the chooser and preserves that tab.
      iOS has no Android hardware Back button.
- [ ] Manual, receipt and voice choices stay disabled; no capture starts.
- [ ] Check status bar, home-indicator clearance, narrow layout, enlarged text,
      scroll reachability and accessibility labels in the simulator/Inspector.
- [ ] Without an API URL, see Chưa cấu hình API and a disabled check button.
- [ ] With a valid URL and running API, see API đã kết nối.
- [ ] Stop the API or use an unreachable local test address: observe failure or
      the five-second timeout; navigation remains usable. Restore the API URL,
      restart Metro if it changed, and verify retry succeeds.
- [ ] Confirm no camera, microphone or notification permission request.

Only after exercising this checklist may the result be labeled **iOS Simulator
verified**. Simulator success cannot establish physical-iPhone local-network
permission behavior, phone networking or VoiceOver/focus restoration. Those
remain separate pending device checks; the simulator does not implement Apple's
[local-network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

Before attempting a real iPhone, verify the actual SDK-58-compatible Expo Go
installation/account route using [Expo Go downloads](https://expo.dev/go) and
[Expo's current setup instructions](https://docs.expo.dev/get-started/set-up-your-environment/).
These sources have described different physical-iOS installation routes; do not
assume the App Store client supports this SDK or that enrollment/build costs are
approved. Physical-iPhone support, IPA signing, TestFlight distribution and App
Store publication are not part of this increment.

## Checks

Run inside `apps/mobile/`:

```sh
npm run typecheck
npm test -- --runInBand
npx expo install --check
npx expo export --platform ios --output-dir dist/ios
npx expo export --platform android --output-dir dist/android
```

The tests exercise real Expo Router navigation and React Native components. Only
network/native event boundaries are simulated. The platform regression test
evaluates the real public Expo configuration, rather than matching source text.
Exports are JavaScript bundles, **not installable APK/IPA files** or evidence of
simulator/physical-device runtime behavior.

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

### iOS extension — 2026-11-08

- The new regression test first failed because Expo's resolved platforms were
  only `["android"]`; configuration now enables both Android and iOS. The full
  rerun passed all 20 tests across five suites, including this regression test.
- TypeScript checking and Expo dependency compatibility passed without changing
  dependencies or lockfiles. A preservation audit across 5,363 baseline files
  (excluding generated mobile/dependency artifacts) found only the intended
  mobile config/README changes and the new configuration test.
- The initial current full-suite run exceeded its 120-second command limit. The
  earlier baseline run also had a navigation-test timeout (18 passed, one timed out).
  Host load was measured at approximately 392 across four logical CPUs during
  concurrent verification. After exports completed, a serial Jest retry with a
  600-second outer command allowance passed in 10.5 seconds with the original
  test assertions and test timeouts unchanged. The timed-out runs themselves
  are not passing evidence.
- Both `dist/ios` and `dist/android` JavaScript/Hermes exports passed (1,159 iOS
  modules and 1,153 Android modules). These are not installable IPA/APK files or
  simulator/device runtime verification.
- A read-only fresh-context static review found no introduced blocking code
  defects; the reviewer did not rerun automated checks or validate runtime.
- **Simulator/runtime acceptance is blocked:** `xcode-select -p` currently returns
  `/Library/Developer/CommandLineTools`; `xcrun --find simctl` exits 72 because
  the utility is unavailable. Full Xcode/runtime setup remains manual. Neither
  the simulator checklist nor any physical-iPhone walkthrough has been completed.

### Original Android scaffold — historical evidence

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

The original scaffold introduced only `apps/mobile/` and `services/carenta-api/`.
The iOS extension changes only the mobile config, config test and this README.
The root manifests, ignore rules, environment, old application, labs, data,
documentation and local PDF/reference files remain untouched. Stage explicit
new paths; never stage PDFs or add PDF ignore patterns.

2026-11-04: OpenCode / GPT-6.1 Sol Pro generated the placeholder routes, reusable
components, health client, tests and setup instructions from the approved plan.
Versions were resolved with Expo's compatibility tool. Human inspection and
teammate approval remain required; no human/device checks are claimed.

The user authorized an additional disclosure entry in `docs/ai-use-log.md` before
committing/pushing the iOS extension, as a narrow exception to the preservation
requirement. Include actual AI use and verification in any future PR as well.
Running the scaffold itself creates no issue, commit, push, PR, deployment or
cloud account.

2026-11-08 iOS extension: OpenCode / GPT-6.1 Sol added two-platform configuration,
an Expo-config regression test, and simulator setup/verification instructions
under the approved simulator-first plan. No backend, legacy code, dependency
versions, system settings or native security policies are changed. Actual checks
and remaining runtime prerequisites are recorded in the verification section;
human review and canonical disclosure reconciliation remain separate gates.
