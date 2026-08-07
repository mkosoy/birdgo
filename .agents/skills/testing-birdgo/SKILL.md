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

When launching the Chrome test browser for Adventure, preserve WebGL support:
```
--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist
```
Without these flags, MapLibre can fail to obtain a GL context and render a blank map with no
`.user-marker`; treat that as a browser launch problem, not an app marker or camera failure.

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
- **The on-route budget test gives false failures unless your waypoints are truly on the polyline.** Eyeballing
  "near the route" is not enough — a plausible-looking point was measured at **96 m** off-route and correctly
  triggered a reroute, which looks identical to a budget regression. Fetch the route GeoJSON yourself, compute
  each candidate's perpendicular distance to every segment, and **step only on actual polyline vertices**
  (offroute == 0.0). Re-fetch the polyline after any reroute — the old geometry is stale.
- **One `move` can deliver more than one fix** (typically 2). Before calling a reroute count a burst, log
  `window.__fixes.length` around the move: "2 fixes → 1 request" is correct behaviour, not a duplicate.
  Reroute counts are also worth repeating — a one-off burst of 3 identical requests did not reproduce in two
  controlled retries, so treat a single observation as unconfirmed.
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
mobile:true`) plus `Emulation.setTouchEmulationEnabled`, and clear it afterwards. Test **both** 390×844 and
**375×667** — the tighter height is where panels start clipping, and several defects appear at 375 but not 390.

Many layout bugs exist *only* below ~400 px, so always re-probe every state after switching metrics:
idle first-person, Nearby expanded, tracking with directions collapsed **and** expanded, popup open, and a
top message showing. Things found this way: the expanded tray showing only ~2.3 of 14 rows
(`#nearby-list` scrollHeight 1016 vs clientHeight 166) with the next row cut mid-text, species names
truncating, the track card squeezing its name/distance into a **67 px** flex column inside a 298 px card
(name ellipsized, distance wrapped to 3 lines), and only 1–2 of ~536 markers visible in first-person.

**Cross-document occlusion is the top recurring bug class at mobile width, and it is invisible to an
iframe-only overlap check.** Parent React overlays and the iframe's own HUD can occupy the same band: the
parent rare banner was measured covering **87 %** of the in-iframe `#snap-toast`, making its "Go" dead, and
the parent Capture FAB blocked the left 40 % of the popup's Directions button. Always (a) convert iframe
rects to page coords via the iframe's own rect and intersect them against parent overlays, and (b) hit-test
**several points across** a wide control, not just its centre — centre-only checks passed while the left edge
was dead. A useful confirmation: if a real click at a covered control dismisses/activates the *overlay*
instead, the overlay is on top.

`env(safe-area-inset-*)` is **0** under Chrome device emulation, so notch/home-indicator behaviour cannot be
tested natively. Simulate it (and label it as a simulation) by setting the iframe's CSS vars directly:
`iframe.contentDocument.documentElement.style.setProperty('--safe-top','47px')` and `--safe-bottom:34px`
(true iPhone 14 values), then assert the HUD shifted by exactly those amounts and remove the properties
afterwards. Correct plumbing moved the tray up 34 px and the zoom control down 47 px.

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

## Known issues to re-check (as of commit be1e947)
These may already be fixed; treat as "look here first" rather than fact.

Verified **fixed** at `be1e947` (don't re-report without fresh evidence, but they have regressed before, so
spot-check): camera follow keeping the avatar at y68 % for a whole walk; `.bird-marker` taps opening popups;
44 px zoom controls that no longer toggle the view mode; seen placeholders stamped with the *fetched* area
(`loadedArea`) so out-of-area species are dropped rather than re-stamped; late permission grant reframing
without a reload; Overhead being genuinely top-down (`pitch: 0`).

Still open at `be1e947`:
- **Mobile-only occlusion (worst class):** the parent rare banner covers ~87 % of the in-iframe `#snap-toast`
  so its "Go" is unclickable, and the parent Capture FAB blocks the left ~40 % of the popup's Directions
  button. Both are cross-document — see the occlusion recipe above.
- Track card crushes name/distance into a ~67 px flex column (name ellipsized, distance wrapped to 3 lines)
  and overlaps the route panel by ~5 px at 375–390 px.
- The three `.bird-edge` awareness arrows collide with the round controls and the Nearby/route panels, stack
  on top of each other (~37 px overlap at 390 px), and still render when zoomed out where they're redundant.
- After a **manual zoom**, follow is disabled by the `userGesture` gate, so continued walking pushes the
  avatar off-screen (measured x99.8 %, clipped) with no cue; `◎` recovers and re-arms follow. The zoom level
  itself *is* correctly preserved.
- Popup "Directions" calls `Linking.openURL` to Google Maps instead of starting the in-app route
  (`MapScreen.tsx` `onDirections`); only the tray/toast "Go" starts in-app navigation.
- Switching Adventure ↔ Classic silently discards the active Track/route with no warning.
- Popup close `×` is 20×17 px and the toast dismiss `×` is 22×44 px — both under the 44 px floor everything
  else now meets. Toast "Go" is inline text in `#snap-toast-copy`, not a discrete button.
- CaptureScreen body copy is `rgb(85,85,85)` on near-black (~2.3:1, fails WCAG AA); the heading above it was
  fixed to `rgb(215,232,218)`.
- Only ~1–2 of ~536 markers are visible in the first-person pose (zoom 17 / pitch 60) — building occlusion is
  fixed, but bird visibility is still poor, worse on mobile.
- **Android emulator:** Adventure mode has been observed rendering the 3D map, roads, buildings, user dot,
  bird markers, rare banner and Nearby tray correctly. A prior blank-tile observation was a stale/paused
  emulator artifact, not a confirmed app defect. Real GPS, compass heading and camera capture have
  **never** been verified on real hardware.

## Deployment / bundle-provenance trap
Production (`birdgo.vercel.app`) is frequently an **older export** than local dev, so never validate a fresh
fix against it. Fingerprint both before concluding anything: grep the served bundle for strings unique to the
revision under test (e.g. `recoveringFromFallback`, `loadedArea`, `bird-awareness`, `firstPersonPadding`) and
for strings the revision *deleted*. A prod bundle that has some new strings but zero occurrences of the
newest one predates that commit — test locally and say so explicitly in the report.

## Devin Secrets Needed
- eBird API token (`EBIRD_API_TOKEN`) — provided by the user for the app; no OpenAI key needed while `BIRD_ID_PROVIDER=heuristic`.
