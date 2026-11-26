# BirdGo 🐦

**Pokémon Go for birdwatching.** BirdGo shows recent eBird sightings on a keyless map, lets you photograph a bird for identification, and keeps a local Bird-dex of captured and seen species.

BirdGo is single-player and defaults to San Francisco (`37.7749, -122.4194`). Collections are stored locally with AsyncStorage; there are no accounts.

## Architecture

```text
birdgo/
├── api/          Vercel serverless entrypoint
├── backend/      Node + Express + TypeScript eBird and bird-ID proxy
└── mobile/       Expo React Native + TypeScript app
```

The mobile app never contains the eBird token or bird-ID provider keys. The backend reads those values from its environment.

## Backend setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env
npm run dev
```

The local server runs at `http://localhost:4000`.

Required:

| Variable | Required | Description |
| --- | --- | --- |
| `EBIRD_API_TOKEN` | Yes | Free token from [eBird API keygen](https://ebird.org/api/keygen) |
| `PORT` | No | Defaults to `4000` |
| `BIRD_ID_PROVIDER` | No | `heuristic`, `huggingface`, `gemini`, or `openai` |
| `HUGGINGFACE_API_KEY` | For Hugging Face | Free token from [Hugging Face settings](https://huggingface.co/settings/tokens) |
| `GEMINI_API_KEY` | For Gemini | Free key from [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `OPENAI_API_KEY` | For OpenAI | Paid OpenAI API key |
| `HF_BIRD_MODEL` | No | Defaults to `dennisjooo/Birds-Classifier-EfficientNetB2` |

If the selected provider has no key or fails, the backend automatically falls back to the deterministic heuristic provider.

## Mobile setup

```bash
cd mobile
npm install
npx expo start
```

- Press `i` to open on an iOS simulator or scan the QR code with Expo Go.
- Press `a` for Android.
- On a physical device, set `expo.extra.apiBaseUrl` in `mobile/app.json` to your computer's LAN URL, such as `http://192.168.1.20:4000`.
- On the Android emulator, use `http://10.0.2.2:4000`.

### Maps

BirdGo uses a Leaflet map rendered from shared HTML:

- Native iOS and Android: Leaflet inside `react-native-webview`
- Web: Leaflet inside an iframe
- Base layer: OpenStreetMap tiles

This is keyless and does not require a Google Maps API key on iOS, Android, or web.

## Collection gameplay and 3D encounters

BirdGo stores a local trainer profile in AsyncStorage. Captures award XP by encounter rarity, model-verified identifications earn a bonus, and first-time species earn a larger discovery bonus. Releasing a species removes its photos but never removes XP already earned. The Bird-dex groups duplicate photos into species entries so duplicates still feel useful instead of cluttering the collection.

The current 3D bird is a lightweight procedural Three.js encounter model rendered inside the app. It is deliberately labeled as stylized rather than species-accurate. Unity should be an offline asset pipeline, not a runtime dependency: use the existing Unity account/editor to author or render higher-quality bird GLB models and sprites, export them into `mobile/assets/birds/`, then load those assets in the existing encounter preview. Embedding the full Unity runtime inside this Expo app would add substantial binary size, native-build complexity, and memory use without improving the map or collection loop.

## iOS and TestFlight

The Expo config uses the iOS bundle identifier `com.mkosoy.birdgo` and includes an App Store icon. Release builds use the production backend at `https://birdgo.vercel.app`; development builds still use the local backend (`http://10.0.2.2:4000` on the Android emulator and `http://localhost:4000` elsewhere). Build and upload profiles live in `mobile/eas.json`:

```bash
cd mobile
npm install
npx eas login
npm run build:testflight
npm run submit:testflight
```

Before the first upload, create the App Store Connect app record for `com.mkosoy.birdgo` and configure EAS with Apple App Store Connect credentials. The reusable automation-friendly secrets are an App Store Connect API key (`ASC_KEY_ID`, `ASC_ISSUER_ID`, and private `.p8` contents), plus an Expo access token (`EXPO_TOKEN`) for CI or a macOS Devin builder. Do not commit private key material to this repository.

## Web development and Vercel

The Expo web build uses Metro:

```bash
cd mobile
npx expo start --web
npx expo export --platform web
```

The production export is written to `mobile/dist`.

Deploy from the repository root with Vercel:

```bash
vercel
```

The repository's `vercel.json` builds the backend and Expo web export, serves `mobile/dist`, and routes `/api/*` to the Express serverless function in `api/index.ts`.

Configure these Vercel environment variables:

- `EBIRD_API_TOKEN` — required
- `BIRD_ID_PROVIDER` — optional; when unset, the backend uses Gemini/Hugging Face if a matching key is configured, otherwise `heuristic`; paid OpenAI always requires explicit opt-in
- `HUGGINGFACE_API_KEY` — optional free provider key
- `GEMINI_API_KEY` — optional free provider key
- `OPENAI_API_KEY` — optional paid provider key; requires `BIRD_ID_PROVIDER=openai`
- `HF_BIRD_MODEL` — optional Hugging Face model override
- `GEMINI_BIRD_MODEL` — optional Gemini model override

On web, the API base URL is same-origin, so requests use the deployed `/api` routes.

## Bird identification

The backend supports four providers:

- **Heuristic** (default, no key): deterministic offline fallback using nearby species hints.
- **Hugging Face** (free tier): image classification using the configured Hugging Face model. Get a token at <https://huggingface.co/settings/tokens>.
- **Gemini** (free tier): real photo identification with Gemini Flash Lite models, with quota fallback across supported Gemini models. It is enabled by `GEMINI_API_KEY` when no explicit provider is set, or by `BIRD_ID_PROVIDER=gemini`. Get a key at <https://aistudio.google.com/app/apikey>.
- **OpenAI** (paid): OpenAI vision using `gpt-4o-mini`.

Every provider returns:

```json
{
  "isBird": true,
  "commonName": "Anna's Hummingbird",
  "sciName": "Calypte anna",
  "confidence": 0.6,
  "provider": "heuristic"
}
```

The `provider` field reports the provider that actually produced the result, including when the backend falls back to `heuristic`.

## API

- `GET /api/health`
- `GET /api/birds/recent?lat=&lng=&dist=&back=`
- `GET /api/birds/notable?lat=&lng=&dist=&detail=full`
- `GET /api/taxonomy?species=`
- `POST /api/identify`

## Scripts

Backend:

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run start
```

Mobile:

```bash
npx expo start
npx tsc --noEmit
npx expo export --platform web
npx expo export --platform android
```
