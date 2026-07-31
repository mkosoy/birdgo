---
name: Testing BirdGo (web + Android emulator)
description: How to run and E2E-test the BirdGo app (Expo SDK 51 monorepo) on Expo Web and the Android emulator, including backend, eBird token, KVM fix, and known capture/Bird-dex quirks.
---

# Testing BirdGo

Monorepo: `backend/` (Node/Express eBird proxy) + `mobile/` (Expo SDK 51, React Native + Web). Map is keyless **Leaflet + OpenStreetMap** in an `<iframe>` (web) / `react-native-webview` (native) — no Google Maps key needed.

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

## Capture flow gotchas (verified quirks, may be fixed later)
- The identify **result card is gated behind camera permission**. On the emulator, tap "Enable camera" → grant, then "Pick from library" works and shows the result (heuristic no-hint = "Anna's Hummingbird" / "Calypte anna" / 50%). **On web there is no camera device, so "Pick from library" processes the image but never shows the result** — capture can't be fully verified on web.
- The **Bird-dex does not refresh on tab focus**: a newly captured bird only appears after reloading the app (data is persisted in AsyncStorage). Reload (or restart the app) to verify captured cards.

## Devin Secrets Needed
- eBird API token (`EBIRD_API_TOKEN`) — provided by the user for the app; no OpenAI key needed while `BIRD_ID_PROVIDER=heuristic`.
