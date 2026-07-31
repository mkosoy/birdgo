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
- `BIRD_ID_PROVIDER` — optional; defaults to `heuristic`
- `HUGGINGFACE_API_KEY` — optional free provider key
- `GEMINI_API_KEY` — optional free provider key
- `OPENAI_API_KEY` — optional paid provider key
- `HF_BIRD_MODEL` — optional Hugging Face model override

On web, the API base URL is same-origin, so requests use the deployed `/api` routes.

## Bird identification

The backend supports four providers:

- **Heuristic** (default, no key): deterministic offline fallback using nearby species hints.
- **Hugging Face** (free tier): image classification using the configured Hugging Face model. Get a token at <https://huggingface.co/settings/tokens>.
- **Gemini** (free tier availability varies): Gemini 1.5 Flash vision. Get a key at <https://aistudio.google.com/app/apikey>.
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
