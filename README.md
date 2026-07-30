# BirdGo 🐦

**Pokémon Go for birdwatching.** As you walk around a city, a full-screen map shows birds that have recently been spotted nearby (pulled from live [eBird](https://ebird.org) data). Point your camera at a bird, and if it's identified as a real species it's added to your personal collection — your **Bird-dex**. When a rare bird is reported nearby, BirdGo alerts you.

Optimized and defaulted for **San Francisco** (`37.7749, -122.4194`).

> Single-player, no accounts. Your collection lives locally on your device.

---

## Pokémon Go UX patterns (research) → how BirdGo maps them

Before building, we studied the core Pokémon Go interaction loop and mirrored each pattern. eBird gives us *reported sightings with a location and date* (not live moving creatures), so a "spawn" in BirdGo is a recent observation rendered at its reported spot.

| Pokémon Go pattern | BirdGo equivalent | Where |
| --- | --- | --- |
| **Full-screen map centered on the player's live GPS**, avatar in the center | Full-screen map centered on your GPS location (falls back to San Francisco if location is denied). `showsUserLocation` puts your avatar in the middle. | `MapScreen` |
| **Creatures/PoIs as tappable pins** on the map | Each recent eBird observation is a bird pin labeled with the species common name and how recently it was seen ("2h ago"). Deduplicated by species + location. | `MapScreen`, `useBirds` |
| **Tapping a pin opens a capture/encounter screen** | Tapping a bird pin opens the camera, pre-filled with that species as an ID hint. A floating central **Capture** button opens the camera anytime. | `MapScreen` → `CaptureScreen` |
| **Catching adds the creature to your collection** | Take a photo → it's sent to the backend for bird identification → if it's a bird, "Add to collection" saves the photo, species name, timestamp, and location. | `CaptureScreen` |
| **Pokédex: caught vs. uncaught species with artwork & stats** | **Bird-dex**: a grid of species you've captured (your photo, common + scientific name, date, and location caught). Species seen on the map but not yet captured show as locked "?" silhouette placeholders. | `DexScreen` |
| **Proximity notifications for nearby targets** | Polls eBird's *notable/rare* observations for your area, highlights rare pins in gold, shows a prominent dismissible banner, and fires a local notification. | `MapScreen`, `useBirds` |

**The loop:** open map → see nearby birds as pins → walk/pan to a pin → photograph the bird → identify → add to your Bird-dex → chase the rare-bird alerts.

---

## Architecture

```
birdgo/
├── backend/     Node + Express + TypeScript — proxies eBird & bird ID (holds all API keys)
└── mobile/      Expo (React Native + TypeScript) — map, camera, Bird-dex
```

The mobile app **never** talks to eBird directly and **never** holds the eBird API key. All eBird (and optional vision-model) calls go through the backend, which reads keys from environment variables. This keeps the key out of the client bundle.

### Backend endpoints (`/api`)

| Endpoint | Purpose | eBird upstream |
| --- | --- | --- |
| `GET /api/health` | Liveness check | — |
| `GET /api/birds/recent?lat&lng&dist&back` | Nearby recent sightings → map pins (deduped by species+location) | `/data/obs/geo/recent` |
| `GET /api/birds/notable?lat&lng&dist&detail` | Nearby notable/rare sightings → rare alerts | `/data/obs/geo/recent/notable` |
| `GET /api/taxonomy?species` | Species names/codes (cached in-memory 24h) | `/ref/taxonomy/ebird` |
| `POST /api/identify` | Bird photo identification (see below) | — |

`lat`/`lng` default to San Francisco when omitted.

### Bird identification (`POST /api/identify`)

Pluggable provider, selected by the `BIRD_ID_PROVIDER` env var:

- **`openai`** — uses OpenAI vision (`gpt-4o-mini`) when `OPENAI_API_KEY` is set. Asks "is this a bird, and which species?" and returns structured JSON.
- **`heuristic`** (default, **no key required**) — a deterministic offline fallback so the capture flow always works out of the box. It picks a plausible species from the nearby-species hints passed by the map.

Both return the same shape: `{ isBird, commonName, sciName, confidence, provider }`.

---

## Setup

### Prerequisites
- Node.js 20+
- An [eBird API token](https://ebird.org/api/keygen) (free)
- (Optional) An OpenAI API key for real photo-based bird ID
- For the mobile app: the [Expo Go](https://expo.dev/go) app on your phone, or an Android/iOS emulator

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # then edit .env
npm run dev               # http://localhost:4000
```

Configure `backend/.env`:

| Variable | Required | Notes |
| --- | --- | --- |
| `EBIRD_API_TOKEN` | **yes** | Your eBird API token. Get one at https://ebird.org/api/keygen |
| `PORT` | no | Defaults to `4000` |
| `BIRD_ID_PROVIDER` | no | `heuristic` (default) or `openai` |
| `OPENAI_API_KEY` | only if `BIRD_ID_PROVIDER=openai` | Enables real vision-based bird ID |

> The eBird key is read **only** from the environment on the server. Never commit `.env` or paste the key into the mobile app.

### 2. Mobile app

```bash
cd mobile
npm install
npx expo start            # scan the QR code with Expo Go, or press a / i
```

Point the app at your backend by editing `mobile/app.json` → `expo.extra.apiBaseUrl`:

```jsonc
"extra": { "apiBaseUrl": "http://localhost:4000" }
```

- On a **physical device**, `localhost` won't reach your computer — use your machine's LAN IP (e.g. `http://192.168.1.20:4000`).
- On the **Android emulator**, use `http://10.0.2.2:4000`.

#### Maps
The map uses **OpenStreetMap** tiles via `UrlTile`, so it renders with **no map API key**. If you'd rather use Google Maps as the base layer, add a key in `mobile/app.json` (`ios.config.googleMapsApiKey` / `android.config.googleMaps.apiKey`) and via `expo.extra.googleMapsApiKey`. These are left blank by default — don't hardcode a real key.

---

## Error & empty states
- **No birds nearby** — map shows "No birds spotted nearby — try moving the map."
- **Location denied** — silently falls back to San Francisco with a small notice.
- **Camera denied** — explains why and offers "Pick from library" instead.
- **API failure** — tappable "Couldn't load birds. Tap to retry." banner.
- **Not a bird** — capture screen shows "That doesn't look like a bird."

## Scripts

**Backend:** `npm run dev` · `npm run build` · `npm run start` · `npm run typecheck` · `npm run lint`

**Mobile:** `npx expo start` · `npx tsc --noEmit` · `npx expo-doctor`

## Notes & limitations
- eBird returns *reported* sightings, not live moving positions; pins mark where/when a species was reported.
- The default `heuristic` identifier is a stand-in so the flow works offline — set `BIRD_ID_PROVIDER=openai` (with a key) for real photo identification.
- Collection data is stored locally on-device (AsyncStorage); there is no server-side account.
