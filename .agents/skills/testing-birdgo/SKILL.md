---
name: Testing BirdGo (web + Android emulator)
description: How to run and E2E-test the BirdGo app (Expo SDK 51 monorepo) on Expo Web and the Android emulator, including backend, eBird token, KVM fix, mocking geolocation for follow-me/live-navigation testing, iPhone-viewport emulation, and known capture/Bird-dex/map quirks.
---

# Testing BirdGo

Monorepo: `backend/` (Node/Express eBird + iNaturalist proxy) + `mobile/` (Expo SDK 51, React Native + Web). Both maps are keyless and live in an `<iframe>` (web) / `react-native-webview` (native) — no Google Maps key needed:
- **Adventure** mode (default) = **MapLibre GL 3D** built from `mobile/src/components/mapLibreHtml.ts` (tilted first-person, building extrusions, Track/directions/Nearby-tray UI all live *inside* this HTML).
- **Classic** mode = **Leaflet + OpenStreetMap** (flat pins/popups).

Because the whole Adventure HUD is inside the iframe, most assertions need cross-document DOM work (see "Asserting things objectively").

## Backend
```
cd backend && npm install
# .env: PORT=4000, EBIRD_API_TOKEN=<token>, BIRD_ID_PROVIDER=heuristic (no OpenAI key needed)
EBIRD_API_TOKEN=<token> PORT=4000 npm run dev   # http://localhost:4000
```
Sanity: `curl "localhost:4000/api/birds/recent?lat=37.7749&lng=-122.4194"` → large SF JSON array. Defaults to San Francisco (37.7749, -122.4194).

## Web (fastest way to verify the map + pins)
```
cd mobile && npm install && npx expo start --web   # serves http://localhost:8081
```
Open `localhost:8081` in Chrome. Web dev uses `apiBaseUrl` from `app.json` (empty → falls back to `http://localhost:4000`). Green 🐦 = recent, gold ★ = notable pins; gold banner = rare bird; deny geolocation to stay centered on SF.

## Android emulator
```
# One-time toolchain lives under ~/Android/Sdk; AVD name is "birdgo" (Android 34 google_apis x86_64).
export ANDROID_HOME=$HOME/Android/Sdk; export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
emulator -avd birdgo -no-snapshot -no-audio -no-boot-anim -gpu swiftshader_indirect &
```
- **KVM fix (needed after every machine restart):** `sudo chown root:ubuntu /dev/kvm && sudo chmod 660 /dev/kvm` (the `kvm` group does not contain `ubuntu`; chowning the device grants access). Verify with a Python `os.open('/dev/kvm', os.O_RDWR)`.
- Set `mobile/app.json` `extra.apiBaseUrl` to `http://10.0.2.2:4000` for the emulator, then **revert to `""` afterward** so it isn't committed.
- Launch app in Expo Go: `adb reverse tcp:8081 tcp:8081` then `adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081" host.exp.exponent`.
- Set location to SF: `adb emu geo fix -122.4194 37.7749`. Push a test image for the picker: `adb push img.jpg /sdcard/Pictures/bird.jpg` + MEDIA_SCANNER broadcast.
- Note: `npx expo start` rewrites `mobile/tsconfig.json` and creates `mobile/expo-env.d.ts`; `git checkout` them to keep the tree clean.

## Mocking geolocation (required for opens-on-user-location, follow-me and live-navigation tests)
The VM has **no GPS/compass/camera**; without a mock the app falls back to San Francisco. Start Chrome with
`--remote-debugging-port=<port>` and drive geolocation over CDP. Five traps, all of which have burned a run:
1. **Use a persistent daemon, not one-shot CDP clients.** `Browser.grantPermissions` and
   `Emulation.setGeolocationOverride` are reverted as soon as the websocket closes, so a one-shot client
   appears to do nothing.
2. **Never call `Browser.resetPermissions` to change position.** It permanently kills the page's
   `watchPosition` subscriber, so the app looks "frozen" while your mock is actually being delivered. This
   produced a false "live navigation is broken" verdict. Use a `move` path that only re-issues
   `setGeolocationOverride`.
3. **Prove the harness before blaming the app.** Register your own
   `navigator.geolocation.watchPosition` in the page and confirm it receives each coordinate; only then
   conclude the UI is stale.
4. **Re-assert the override *after* `Page.reload`**, or the new document never sees the mock.
5. **Close duplicate app tabs.** With two tabs attached, probes read the wrong document and produce nonsense
   (e.g. "Direct 4107 km", zero-sized map rects).

Useful mock spots: Times Square `40.7580,-73.9855` (dense, ~535 merged sightings, east-coast rare species),
SF `37.7749,-122.4194`. To force the proximity toast you must move to ~150 m of a bird — the nearest NYC bird
is ~243 m away by default.

## Asserting things objectively
- **The iframe DOM is readable from the parent** (`iframe.contentDocument`), so overlap/hit-target/framing
  claims should be *measured*, not eyeballed. Offset iframe rects by the iframe's own rect to compare with
  parent-document React overlays.
- **Tap-ability needs a double check:** `document.elementFromPoint` in the *parent* (catches React overlays
  swallowing clicks) *and* `contentDocument.elementFromPoint` (catches in-map stacking). Best evidence is a
  real click plus a capture-phase listener that logs the true `event.target` — that is how "the click lands on
  the marker but no popup opens" was distinguished from "an overlay ate the click".
- **MapLibre's camera is unreachable:** `map` is scoped inside an IIFE in `mapLibreHtml.ts`, so
  `contentWindow.map.getZoom()` throws. Assert zoom/pitch from screenshots. A "pixel distance between two
  markers" zoom proxy is tempting but unreliable unless you pin a *stable, identified* marker pair — markers
  have no ids, so the pair silently changes between samples. Don't trust its numbers.
- **Count OSRM traffic from the network, not the UI:** listen to `Network.requestWillBeSent` and filter
  `router.project-osrm.org`. Expected budget: 1 request when Track starts, **0** during on-route movement,
  **0** inside the arrival radius, and exactly 1 when >35 m off-route (with a ~15 s failure backoff).
- **Walking ETA** must be `round(metres / 81)` (~4.9 km/h). OSRM's own `duration` is car-like (~462 m/min) and
  must never be displayed — this has regressed before.
- **First-person framing** is deliberately *low* on screen: the avatar should sit ~60–68 % down (assert
  y 55–75 % and "not clipped"). An older 10–62 % rule is obsolete.
- Force a routing failure with CDP `Network.setBlockedURLs` on `*router.project-osrm.org*`; expect a
  straight-line route, a "Direct: … min walk estimate" card and a hidden directions panel. Note the existing
  route does **not** self-heal after unblocking — stop and restart Track.

## iPhone-first / narrow-viewport testing
Chrome refuses to make a real window narrower than **500 px** CSS, so resizing with `wmctrl` cannot reach
iPhone width. Use `Emulation.setDeviceMetricsOverride` (`width:390, height:844, deviceScaleFactor:3,
mobile:true`) plus `Emulation.setTouchEmulationEnabled`, and clear it afterwards. Things that only show up at
390 px: the expanded Nearby tray consuming ~52 % of the map, species names truncating, the ETA line wrapping,
the attribution wrapping under the Capture FAB, and **0 of ~535 bird markers being visible** in first-person.

## Capture flow notes
- The keyless heuristic **no longer invents a species** (it used to confidently label a leopard "Anna's
  Hummingbird, 50 %"). With no vision key a non-bird now yields title **"Unverified photo"** and a
  **"Save unidentified photo"** button; from a pin it uses the pin's species as an unverified hint
  ("Using nearby species hint — not model-verified"). Saving shows a green
  "✓ … is now in your collection." confirmation.
- **Beware a stale web bundle** — this silently invalidates capture testing. If the UI shows strings that HEAD
  deleted, do: `pkill -f "expo start"; rm -rf mobile/.expo/web/cache mobile/node_modules/.cache;
  npx expo start --web --clear`, then verify the served bundle actually contains HEAD-only strings:
  `curl -s "http://localhost:8081/node_modules/expo/AppEntry.bundle?platform=web&dev=true" | grep -c '<string>'`.
- Web has no camera device — use "Pick from library"; the preview + result card render without camera permission (fixed in commit 627cff7; previously gated behind camera permission).
- Bird-dex refreshes on tab focus via `useFocusEffect` (fixed in 627cff7; previously required an app reload). Captures persist in AsyncStorage under `birdgo.captures` and survive walking, refreshes and >25 km area jumps.
- "Seen" placeholders live under `birdgo.seen` with a 25 km scope (`birdgo.seen-area`). Inspect them directly
  in `localStorage` — the UI alone will not reveal that stale out-of-area species are being **re-stamped** with
  the current coordinates instead of dropped (verify by checking whether listed species actually appear in the
  current `/api/birds/recent` response for that location).

## Known issues to re-check (as of commit 38121fb)
These may already be fixed; treat as "look here first" rather than fact.
- Passive camera follow can drift the avatar out of the 55–75 % band while walking (seen at y 20–41 %, and
  clipped off-screen after a manual zoom). Opening frame and the ◎ recenter button are fine — it is the
  per-fix `easeTo` in `mapLibreHtml.ts` that drifts.
- A late permission grant recovers the *data* without a reload but may leave the avatar off-screen, because
  `applyFix()` only re-frames on the **first** fix and a fallback location already counted as first.
- Tapping a `.bird-marker` may not open its popup at all (the 🐦 nearest-bird control does). Verify with a
  capture-phase click listener before assuming an overlay is at fault.
- MapLibre's own `+/−` control can be overlapped by the parent "🗺 Overhead" toggle and the full-width rare
  banner, so tapping `+` changes the view mode instead of zooming.
- Only ~2 of ~535 markers are visible in the first-person pose (zoom 17 / pitch 60) — building occlusion is
  fixed, but bird visibility is still poor, worse on mobile.
- **Android emulator:** Adventure mode has been observed rendering the 3D map, roads, buildings, user dot,
  bird markers, rare banner and Nearby tray correctly. A prior blank-tile observation was a stale/paused
  emulator artifact, not a confirmed app defect. Real GPS, compass heading and camera capture have
  **never** been verified on real hardware.

## Devin Secrets Needed
- eBird API token (`EBIRD_API_TOKEN`) — provided by the user for the app; no OpenAI key needed while `BIRD_ID_PROVIDER=heuristic`.
