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

### Making a true iPhone viewport legible in a screen recording
With device metrics applied to a maximized window, the app renders in a small top-left corner and the
recording is unwatchable. Two things that do **not** work: `xdotool key super+Up` (tiles to half-screen), and
the `scale` field of `setDeviceMetricsOverride` — `scale` **clips** the rendered output to the emulated size
rather than magnifying it, so you lose the bottom/right of the page.

What works is resizing the real window to phone proportions so the emulated viewport nearly fills it:
```bash
export DISPLAY=:0
wmctrl -r "Map - Google Chrome for Testing" -b remove,maximized_vert,maximized_horz
wmctrl -r "Map - Google Chrome for Testing" -e 0,60,20,405,830    # for 375x667
wmctrl -r "Map - Google Chrome for Testing" -e 0,60,8,420,1010    # for 390x844
```
The CSS viewport stays exactly 375/390 px (verify with `innerWidth`), so geometry assertions remain valid
while the recording shows a phone-shaped app. Screenshot coords map to page coords as
`screenshot = (page + windowContentOrigin) * (1024/screenWidth)`; derive the origin once from any element
whose page rect you already know, then reuse it for clicking.

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

**The single most repeated mistake in this class (it has produced a false "0 px² everywhere" five rounds in a
row): people enumerate only the *chrome* of the bottom sheet** — filter, sort, header, handle — plus the rail,
zoom group and compass. But the sheet's **own list rows (`.nb-row`) and `Go` buttons (`.nb-go`) are interactive
targets**, and they are usually what a floating parent control lands on. A matrix that omits them will report
clean while a row tap is being stolen. Two rules:
- Add `.nb-row` / `.nb-go` as targets, but **restrict them to the panel's visible box**, otherwise rows clipped
  below the sheet produce false positives against the bottom tab bar:
  ```js
  var pb = d.querySelector('#nearby-panel').getBoundingClientRect();
  var insidePanel = br => br.top >= pb.top - 1 && br.bottom <= pb.bottom + 1;
  ```
- Enumerating parent overlays by `role`/`button`/`<a>` **misses the RN action-rail buttons**, which are plain
  `div`s inside a `pointerEvents:none` wrapper. Detect them structurally:
  ```js
  var pcs = el.parentElement && getComputedStyle(el.parentElement);
  var railChild = pcs && pcs.pointerEvents === 'none' && cs.pointerEvents !== 'none';
  ```
Also check **iframe-internal** occlusion, not just parent-vs-iframe: at 375 `half` the sheet itself buried the
zoom-out and compass buttons (all five hit points resolved to `#nearby-panel` / `#rare-toggle`), which a
parent-only matrix cannot see. And re-run the matrix in **every sheet state** — a state-aware floating button
(the Capture FAB moves with `peek`/`half`) is clean in one state and overlapping in the other.

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

## Measuring overlap of **rotated** elements
When icons are positioned with `left`/`top` plus `transform: rotate()` (e.g. `.bird-edge`), the axis-aligned
`getBoundingClientRect()` **grows** with rotation: a 44×44 arrow measures 49–62 px depending on angle. Any
de-overlap logic whose minimum gap is smaller than the rotated bbox will still visually collide even though
the spacing code "worked". So always compare *bounding boxes*, not just the inline `left`/`top` centres, and
read both: `parseFloat(el.style.top)` for the intended placement and `getBoundingClientRect()` for the truth.
A gap that exactly equals the configured `minGap` is the signature of spacing logic that ran correctly but was
configured too small.

## Cross-origin evaluation (production smoke)
A CDP helper that filters targets by `localhost:8081` silently detaches the moment you navigate to
`birdgo.vercel.app` and returns `no app page attached`. Keep a separate direct-websocket evaluator that
selects the page by URL substring (`/json/list` → `webSocketDebuggerUrl` → `Runtime.evaluate` with
`returnByValue:true`) so production can be probed with the same scripts.

## Driving the image picker end-to-end
"Pick from library" opens a native GTK file dialog that computer-use cannot fill. Intercept it instead:
enable `Page.setInterceptFileChooserDialog`, click the button via `Runtime.evaluate` with `userGesture:true`,
wait for the `Page.fileChooserOpened` event, then `DOM.setFileInputFiles` with its `backendNodeId`. This makes
the whole keyless-capture → Bird-dex flow testable without a camera. Generate a deterministic non-bird image
with PIL rather than relying on a checked-in fixture.

## `Alert.alert` is a no-op on web — check this before testing any confirm-dialog feature
**`react-native-web@0.19.13` ships `class Alert { static alert() {} }`.** Any feature whose whole flow is
gated behind `Alert.alert` (confirmation dialogs, destructive-action confirms) is **completely inert on Expo
Web** — no dialog renders and the `onPress` callbacks in the button array never fire. This silently killed the
Bird-dex **Release** feature at `4cfcbc5`.

Before spending a round testing such a feature, grep for it:
```bash
grep -rn "Alert.alert" mobile/src
cat mobile/node_modules/react-native-web/dist/exports/Alert/index.js   # confirm it is still a stub
```
If the feature is `Alert`-gated, say up front that **web cannot validate it** and either test on the Android
emulator (where `Alert` is real) or ask for a cross-platform `Modal`. Do not report the downstream invariants
as passing or failing — they are *untestable*, which is a distinct result. Prove inertness objectively by
hashing the relevant `localStorage` key before and after the click rather than by eyeballing the grid.

## Clicking and dragging at an emulated viewport: use page coordinates, not screen pixels
Screen-pixel calibration (`tool_x = page_x * k + offset`) silently breaks the moment you change the emulated
viewport, and a wrong calibration reads exactly like an app defect (clicks "swallowed", controls "dead").
Dispatch real input in **page/CSS-viewport coordinates** instead, which is viewport-independent:
```python
# Input.dispatchMouseEvent via CDP, page coords
for ev in ("mousePressed", "mouseReleased"):
    send("Input.dispatchMouseEvent", {"type": ev, "x": x, "y": y,
         "button": "left", "clickCount": 1,
         "buttons": 1 if ev == "mousePressed" else 0}, session_id=sid)
```
Add a `drag` variant that presses, sends **N interpolated `mouseMoved` events**, and can **stop before
releasing** (`hold`). The hold is what lets you prove a bottom sheet is a real drag rather than a snap-on-release
button: while still held, read `panel.style.transform` (expect `translateY(-120px)` for an upward drag, sign
matching direction) and take a screenshot; then release and assert the transform clears and the state snapped.
Also recompute a moving control's rect **before every click** — the Nearby header moves between `peek` and
`half`, so a hard-coded header point silently starts landing on a list row and the "cycle" test appears stuck.

## The compositor serves stale frames after DOM-only changes
A recurring trap: the DOM shows the new state but the screenshot shows the old one, so a passing feature looks
broken (or worse, you "confirm" a stale success). Scrolling and `wmctrl -a` window activation are unreliable
fixes. What works reliably is a **1 px viewport nudge** to force a re-composite:
```bash
./cdpc metrics 375 668 3 1 && sleep 1 && ./cdpc metrics 375 667 3 1
```
Always verify a visual claim against the DOM too, and treat "screenshot unchanged but DOM changed" as a
rendering artefact to be re-forced, not as evidence.

## Staged `localStorage` fixtures must match the real record shape
Capture records use `location: {latitude, longitude}`. Hand-writing `{lat, lng}` makes `DexScreen`'s
`renderItem` throw `TypeError: Cannot read properties of undefined (reading 'toFixed')`, which unmounts the
**entire screen to an empty root — including the tab bar** (there is no error boundary, so there is no way to
navigate out). This looks exactly like a catastrophic product bug and I mis-reported it as one before checking.
**Always derive the fixture shape from a real, app-created record** (do one capture through the UI, dump
`birdgo.captures`, copy the keys) before staging anything, and re-verify a suspected crash with a known-good
record before reporting it.

## Verify copy per element, not against concatenated text
`document.body.innerText` / `popup.textContent` concatenation makes strict regexes fail for reasons that have
nothing to do with the app (adjacent nodes run together, e.g. a `×4` count butting against `44.2 km`). Query the
specific class (`.stale`, `.where`, `.distance`, `.field-notes`) and match each one. Dump codepoints before
concluding a mismatch — the honest-card copy legitimately uses an em-dash **U+2014** and a middot **U+00B7**,
and "wrong copy" is usually a wrong matcher. Check ETA arithmetic explicitly (`round(metres/81)`) rather than
trusting the string.

## Let the app get its position *before* the first fetch
If the geolocation mock is applied after load, the app fetches at its default centre and does **not** refetch
after the position jumps, so the tray shows the previous area's birds against the new position — e.g.
`Birds nearby (436)` with rows reading `4107.3 km away · 50708 min walk`. It self-heals on reload. Set the mock,
**then** reload, and sanity-check that row 1 reads a plausible distance before trusting any distance/sort/nav
assertion or starting a recording.

## Known issues to re-check (as of commit 89deaec)
These may already be fixed; treat as "look here first" rather than fact.

### Open at `89deaec` (newest first)
- **The state-aware Capture FAB overlaps an interactive Nearby row in `half`, at BOTH widths.** This is the
  fifth iteration of the cross-document occlusion class and the first that is *not* 375-only, so it affects
  390×844 demo framing too:
  `375: FAB [147,445,82,82] ∩ nbRow2 [12,430,351,66] = 4193 px²`;
  `390: FAB [154,622,82,82] ∩ nbRow3 [12,592,366,66] = 2942 px²`.
  A real tap on the row's visual centre **opens the Capture screen instead of the encounter card**, and the FAB
  visually covers that row's name and distance line. Look here first, and see the occlusion rules above about
  including `.nb-row`/`.nb-go`.
- **At 375 `half` the sheet buries the iframe's own zoom-out and compass buttons** (`Zoom out [237,210,44,44]`
  and `Reset bearing [237,254,44,44]`; all five hit points resolve to `#nearby-panel` / `#rare-toggle`). This is
  iframe-internal, so a parent-vs-iframe matrix reports clean. Clear at 390.
- **Release matches on species code OR normalised common name**, so it is name-based even when a code is
  present. `CaptureScreen` defaults `commonName` to `"Unidentified bird"`, so two genuinely different keyless
  saves share one name and **releasing one deletes both**. Reachable via the no-vision-key / "save unidentified
  photo" flows.
- No error boundary anywhere: one malformed capture record blanks the whole screen including the tab bar (see
  the fixture-shape section above).
- Minor: dragging the sheet down from `peek` lets the panel follow the pointer off-screen before clamping on
  release; the Capture FAB corner-touches the avatar in `peek` at 390 (89 px², avatar still hit-testable).

### Verified fixed at `89deaec` (fresh evidence; spot-check only)
Release works via a cross-platform `Modal` and is correctly species-scoped **from both the coded and uncoded
side**, with `birdgo.seen`/`birdgo.seen-area` byte-identical across a release, SEEN-silhouette fallback,
no resurrect on refocus/refetch/reload, singular `"1 photo"` on recapture, and full disappearance after an
area change. `Alert.alert` is gone from `CaptureScreen` too: blocked `*/api/identify*` yields exactly
`Identification unavailable. Check your connection and try again.` inline with no native dialog, and keyless
capture end-to-end gives `Unverified photo` → `Save unidentified photo` → inline
`✓ … is now in your collection.` with Bird-dex updating without a reload. The sheet's `full` state is gone
(cycle is strictly `peek(58) ↔ half(278)`, caret only `▸`/`⌄`, no drift over 250 ms samples) and the handle now
**tracks the pointer live**. `#sort-toggle` cycles from its right edge (the old 830 px² dead-edge is fixed).
Classic popups **survive** the `clearLayers()`/auto-pan/refetch loop (present at t+16 s, restored across churn
at 618–742 ms and 3869–4001 ms), the rare banner is suppressed while a Classic popup is open, Classic `◎` is
back at 52×52, and Classic card copy is correct per element. Compact `ⓘ` expands to full credits in both
renderers and adds 0 overlaps. Tab bar active tint is `#2f7d5b`; inactive `#34453c` on white computes 10.18:1
(AA passes). Filtering: 545 names checked, 0 offenders. Sort invariant holds non-vacuously. Production
(`birdgo.vercel.app`) smokes clean including the Release modal reading `"2 photos"`.

Verified **fixed** at `4cfcbc5` (don't re-report without fresh evidence, but they have regressed before, so
spot-check): camera follow keeping the avatar framed for a whole walk (x50.1 %/y57.3 % at every sample);
`.bird-marker` taps opening popups; 44 px zoom controls that no longer toggle the view mode; seen placeholders
scoped to the fetched area; late permission grant reframing without a reload; Overhead genuinely top-down;
toast↔rare-banner arbitration in Adventure; Capture FAB dimming while a popup is open; popup "Directions"
starting the **in-app** route; follow-pause messaging and ◎ re-arming follow; **the avatar is no longer hidden
behind `#route-panel` at 375×667** (`avatarInRoutePanel:false`, `trackCard ∩ routePanel = 0 px²`);
**`#track-dist` no longer ellipsizes at 375** (scrollW 148 = clientW 148); **Classic finally got the 44 px
pass** (popup buttons 70×44/85×44/59×44, close `×` exactly 44×44); `.bird-edge` awareness arrows are **gone**
entirely (`#bird-awareness` absent), which resolves the overlap/inertness findings; Nearby row copy, 38 px
thumbs and the `right:8px` gutter reclaim (**0** clipped `.nb-name`, **0** clipped `.nb-sub` at 375, was
13/14).

Historical — open at `4cfcbc5`, since **fixed** (kept because this class regresses; re-verify rather than
assume):
- **Bird-dex `Release` does nothing on web** — see the `Alert.alert` section above. `birdgo.captures` hash
  identical before/after (`1980961569` → `1980961569`).
- **The Nearby sheet's `full` snap state is broken at 375×667** and is reachable by two header taps:
  - the panel is laid out at `top:-78` so its **own header (`-68`) and drag handle (`-73`) are off-screen** —
    `headerVisibleInViewport:false`, so the user cannot collapse it again; the only escape is tapping a row.
    The `calc(100% - safe-top - 20px)` height assumes bottom-anchoring, but the panel sits above the bottom HUD.
  - **parent controls render on top of the list**: 5 of 8 visible rows covered and **3 `Go` buttons dead**
    (`elementFromPoint` → parent DIV). Use the `full` state as the first place to look for iframe/parent
    z-order bugs.
- **New cross-document occlusion at 375: the parent ◎ "Back to me" covers 39 % of the iframe `#sort-toggle`**
  (`[285,252,48,44] ∩ [307,232,52,52] = 830 px²`). Hit points at 0.7/0.9 across the toggle resolve to the
  parent; a real click on the right edge is swallowed while the left third cycles the sort. **390×844 is
  clean** — this class of bug is 375-only, so always measure at 375.
- **Classic (Leaflet) popups self-destruct after ~730 ms.** `render()` calls `markers.clearLayers()` on every
  data update, and the popup's own auto-pan fires `moveend` → `regionChange` → refetch → re-render. A
  `MutationObserver` on `.leaflet-popup-pane` shows add at t+41 ms, remove at t+774 ms. Workaround for testing:
  CDP-block `*/api/birds*` to freeze the feed, then the card renders and persists.
- **The parent rare banner overlaps the Classic popup by 11 372 px²**, covering 44 % of the card title — the
  toast↔banner arbitration was only wired into the Adventure renderer.
- **Classic has no ◎ "Back to me"**: `MapScreen.tsx` moved it inside the `mode === "adventure"` block.
- `#route-current-text` still clips at 375 (scrollW 313 vs clientW 191).
- Encounter cards still use the **old** copy (`Direct · 100 m`, `Walk est. · 1 min`) while Nearby rows use the
  new `"100 m away · 1 min walk · seen 1d ago"` — the two now disagree.
- The sheet handle is a **real directional drag** (up peek→half, down half→peek, which a click-cycle could not
  do) but it **does not follow the pointer**; it only snaps on release, so it feels unphysical.
- A blocked bird feed degrades to `Couldn't load birds. Tap to retry.` but the map behind renders **blank white**.
- Bottom-nav inactive label is `rgb(142,142,143)` on white = 3.27:1, fails AA.
- Switching Adventure ↔ Classic silently discards the active Track/route — **known and accepted**, do not
  re-report as new.
- Only ~1–2 of ~536 markers are visible in the first-person pose (zoom 17 / pitch 60) — building occlusion is
  fixed, but bird visibility is still poor, worse on mobile.
- A large location jump (NYC→SF) via `move` updated the avatar but did **not** trigger a data re-fetch; a
  reload was required. An independent `watchPosition` registered at that moment returned no fix, so this may
  be a CDP-override artifact rather than an app bug — treat as inconclusive until reproduced.
- **Android emulator:** Adventure mode has been observed rendering the 3D map, roads, buildings, user dot,
  bird markers, rare banner and Nearby tray correctly. A prior blank-tile observation was a stale/paused
  emulator artifact, not a confirmed app defect. Real GPS, compass heading and camera capture have
  **never** been verified on real hardware.

## Verifying "display sort must not change the geometric closest" invariants
`mapLibreHtml.ts` keeps `computeNearest()` (always distance-sorted) separate from
`sortEntries(nearest.slice())` (display order). To test the invariant **non-vacuously**, place the mock so the
displayed first row and the true nearest genuinely differ — under `↕ Rare` with a common bird at ~100 m, the
list tops out at a 938 m rare bird while the toast must still name the 100 m one. If the two agree, the test
proves nothing: re-place the mock until they diverge, and say so. Recompute distances yourself with haversine
from `latestMarkers` + the mocked position rather than trusting the rendered strings, then check **all** of the
toast subject, the 🐦 closest-bird button, and the snap gate.

## Synthetic drags: what works and what silently doesn't
With touch emulation on, synthetic mouse drags **do** drive custom pointer-event handlers (the sheet's
`#nearby-handle` drag works and is directional), but they **did not** drive MapLibre's canvas pan or a native
`overflow-y` scroll — both produced zero movement from the same input path. Don't conclude "pan is broken"
from this; it is most likely a touch-emulation artifact. Use the **scroll wheel** to prove a list is scrollable
and isolated, and note map-pan-by-drag as inconclusive rather than failed. Also hit-test your drag start *and
end* points first — a drag that begins on the canvas but ends inside a toast or the sheet header explains a
surprising no-op.

## Deployment / bundle-provenance trap
Production (`birdgo.vercel.app`) has often been an **older export** than local dev, so fingerprint both before
concluding anything. **Only string literals, CSS/StyleSheet literals and DOM ids/classNames are reliable
fingerprints** — local variable and function names (`recoveringFromFallback`, `loadedArea`) are *minified away*
in the production export, and treating their absence as "stale bundle" produced a false claim once. Use markers
like `snap-toast-go`, `captureButtonDimmed`, `Camera follow paused`, `c9ddce`, plus a count of strings the
revision **deleted** (e.g. `maps/dir` should be 0).

The local bundle URL is not `/index.bundle` (that returns a ~4 KB Expo resolution error). Read the served HTML
for the real entry, currently:
`http://localhost:8081/node_modules/expo/AppEntry.bundle?platform=web&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app`

Also make sure only **one** Expo dev server is running (a second on `:8083` served a stale bundle to an
attached page and cost real time) — `pkill -f "expo start"` then start one with `--clear`, and confirm the
browser page is on the port you think it is.

A quick production DOM smoke is often more convincing than bundle greps: check `snap-toast-go`/
`snap-toast-dismiss` resolve to `BUTTON`, `.maplibregl-popup-close-button` computes to `44px`, and
`#nearby-panel` max-height is `42%`.

## Devin Secrets Needed
- eBird API token (`EBIRD_API_TOKEN`) — provided by the user for the app; no OpenAI key needed while `BIRD_ID_PROVIDER=heuristic`.
