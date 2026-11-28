import { speciesAudioScript } from "./speciesAudioScript";

export function buildMapLibreHtml(options: { apiBaseUrl?: string } = {}): string {
  const serializedApiBaseUrl = JSON.stringify(options.apiBaseUrl ?? "");
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
  <style>
    :root { --safe-top: 0px; --safe-right: 0px; --safe-bottom: 0px; --safe-left: 0px; --bottom-hud: calc(16px + var(--safe-bottom)); --track-stack: 78px; }
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
    body { position: relative; overflow: hidden; }
    #sky-gradient { position: absolute; left: 0; right: 0; top: 0; height: 36%; z-index: 2; pointer-events: none; background: linear-gradient(to bottom, rgba(108,190,238,.9), rgba(153,216,242,.38) 48%, rgba(153,216,242,0)); }
    #atmosphere-tint { position: absolute; inset: 0; z-index: 1; pointer-events: none; transition: background 700ms; }
    #weather-orb { position: absolute; top: calc(var(--safe-top) + 116px); right: 16px; z-index: 3; width: 30px; height: 30px; border-radius: 50%; pointer-events: none; background: #ffd766; box-shadow: 0 0 20px rgba(255,214,102,.62); transition: all 700ms; }
    #weather-particles { position: absolute; inset: 0; z-index: 3; pointer-events: none; opacity: 0; transition: opacity 500ms; }
    #sky-life { position: absolute; left: 0; right: 0; top: 0; height: 36%; z-index: 3; pointer-events: none; overflow: hidden; --peak-bird-opacity: .58; }
    .sky-bird { position: absolute; left: 0; top: 0; width: 34px; height: 15px; color: rgba(31,69,91,.72); opacity: 0; animation: sky-bird-cross var(--cross-duration, 28s) linear infinite; animation-delay: var(--cross-delay, 0s); will-change: transform, opacity; }
    .sky-bird svg { display: block; width: 100%; height: 100%; filter: drop-shadow(0 1px 1px rgba(255,255,255,.28)); }
    .sky-bird-one { --cross-duration: 31s; --cross-delay: -7s; --start-y: 128px; --drift-y: 18px; --bird-scale: 1.02; }
    .sky-bird-two { --cross-duration: 38s; --cross-delay: -21s; --start-y: 174px; --drift-y: -14px; --bird-scale: .78; }
    .sky-bird-three { --cross-duration: 45s; --cross-delay: -33s; --start-y: 148px; --drift-y: 9px; --bird-scale: .6; }
    body[data-period="night"] #sky-life { --peak-bird-opacity: .36; }
    body[data-period="dawn"] #sky-life, body[data-period="dusk"] #sky-life { --peak-bird-opacity: .4; }
    body[data-weather="rain"] #sky-life, body[data-weather="storm"] #sky-life, body[data-weather="fog"] #sky-life { --peak-bird-opacity: .18; }
    @keyframes sky-bird-cross {
      0% { transform: translate3d(-12vw, var(--start-y), 0) scale(var(--bird-scale)); opacity: 0; }
      9% { opacity: var(--peak-bird-opacity); }
      82% { opacity: var(--peak-bird-opacity); }
      100% { transform: translate3d(112vw, calc(var(--start-y) + var(--drift-y)), 0) scale(var(--bird-scale)); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) { .sky-bird { display: none; } }
    #map-loading { position: absolute; inset: 0; z-index: 4; pointer-events: none; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 38%, rgba(213,239,182,.94), rgba(128,196,126,.96) 52%, rgba(80,153,109,.98)); opacity: 1; transition: opacity 550ms ease; }
    #map-loading.hidden { opacity: 0; }
    #map-loading-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 22px; border-radius: 24px; color: #173c2b; font-family: -apple-system, system-ui, sans-serif; text-align: center; text-shadow: 0 1px 0 rgba(255,255,255,.45); }
    #map-loading-ring { width: 54px; height: 54px; border-radius: 50%; border: 5px solid rgba(255,255,255,.45); border-top-color: #fff; box-shadow: 0 4px 18px rgba(31,91,55,.2); animation: map-loading-spin 1.1s linear infinite; }
    #map-loading-title { font-size: 18px; font-weight: 900; letter-spacing: .1px; }
    #map-loading-subtitle { font-size: 12px; font-weight: 700; color: rgba(23,60,43,.72); }
    @keyframes map-loading-spin { to { transform: rotate(360deg); } }
    body[data-period="dawn"] #sky-gradient { background: linear-gradient(to bottom, rgba(255,157,118,.78), rgba(119,173,222,.34) 52%, rgba(153,216,242,0)); }
    body[data-period="dusk"] #sky-gradient { background: linear-gradient(to bottom, rgba(245,126,103,.82), rgba(108,111,190,.38) 52%, rgba(153,216,242,0)); }
    body[data-period="night"] #sky-gradient { background: linear-gradient(to bottom, rgba(12,24,70,.92), rgba(31,56,111,.42) 52%, rgba(31,56,111,0)); }
    body[data-period="night"] #atmosphere-tint { background: rgba(5,14,42,.25); }
    body[data-period="dawn"] #atmosphere-tint, body[data-period="dusk"] #atmosphere-tint { background: rgba(84,48,104,.10); }
    body[data-period="night"] #weather-orb { background: #e9f3ff; box-shadow: -9px 0 0 #263d78 inset, 0 0 18px rgba(211,231,255,.48); }
    body[data-weather="cloudy"] #sky-gradient, body[data-weather="fog"] #sky-gradient { background: linear-gradient(to bottom, rgba(140,171,190,.84), rgba(181,202,207,.42) 52%, rgba(181,202,207,0)); }
    body[data-weather="cloudy"] #atmosphere-tint, body[data-weather="fog"] #atmosphere-tint { background: rgba(111,132,143,.13); }
    body[data-weather="rain"] #sky-gradient, body[data-weather="storm"] #sky-gradient { background: linear-gradient(to bottom, rgba(73,105,137,.9), rgba(102,139,163,.42) 52%, rgba(102,139,163,0)); }
    body[data-weather="rain"] #atmosphere-tint, body[data-weather="storm"] #atmosphere-tint { background: rgba(35,65,92,.20); }
    body[data-weather="snow"] #sky-gradient { background: linear-gradient(to bottom, rgba(177,207,229,.88), rgba(224,238,247,.45) 52%, rgba(224,238,247,0)); }
    body[data-weather="rain"] #weather-particles, body[data-weather="storm"] #weather-particles { opacity: .24; background: repeating-linear-gradient(112deg, transparent 0 17px, rgba(196,229,255,.5) 18px 19px, transparent 20px 34px); animation: rain-fall .95s linear infinite; }
    body[data-weather="snow"] #weather-particles { opacity: .55; background-image: radial-gradient(circle, rgba(255,255,255,.95) 1.5px, transparent 2px), radial-gradient(circle, rgba(255,255,255,.75) 1px, transparent 1.6px); background-size: 74px 74px, 43px 43px; animation: snow-fall 8s linear infinite; }
    body[data-weather="fog"] #weather-particles { opacity: .28; background: linear-gradient(100deg, transparent, rgba(231,239,239,.72), transparent); animation: fog-drift 9s ease-in-out infinite alternate; }
    body[data-weather="cloudy"] #weather-orb, body[data-weather="fog"] #weather-orb { opacity: .22; }
    body[data-weather="rain"] #weather-orb, body[data-weather="storm"] #weather-orb, body[data-weather="snow"] #weather-orb { opacity: 0; }
    body[data-period="night"][data-weather="cloudy"] #sky-gradient, body[data-period="night"][data-weather="fog"] #sky-gradient { background: linear-gradient(to bottom, rgba(23,35,67,.94), rgba(49,70,102,.46) 52%, rgba(49,70,102,0)); }
    body[data-period="night"][data-weather="rain"] #sky-gradient, body[data-period="night"][data-weather="storm"] #sky-gradient { background: linear-gradient(to bottom, rgba(15,29,54,.95), rgba(35,61,86,.48) 52%, rgba(35,61,86,0)); }
    body[data-period="night"][data-weather="snow"] #sky-gradient { background: linear-gradient(to bottom, rgba(35,51,88,.94), rgba(70,94,130,.44) 52%, rgba(70,94,130,0)); }
    body[data-period="night"][data-weather="cloudy"] #atmosphere-tint, body[data-period="night"][data-weather="fog"] #atmosphere-tint, body[data-period="night"][data-weather="rain"] #atmosphere-tint, body[data-period="night"][data-weather="storm"] #atmosphere-tint, body[data-period="night"][data-weather="snow"] #atmosphere-tint { background: rgba(5,14,42,.28); }
    @keyframes rain-fall { from { background-position: 0 -30px; } to { background-position: -28px 54px; } }
    @keyframes snow-fall { from { background-position: 0 -80px, 0 -40px; } to { background-position: 24px 180px, -14px 150px; } }
    @keyframes fog-drift { from { transform: translateX(-6%); } to { transform: translateX(6%); } }
    .bird-marker, .user-marker { display: flex; align-items: center; justify-content: center; border-radius: 50%; color: white; font-size: 18px; font-weight: bold; }
    .bird-marker { position: absolute; width: 42px; height: 42px; background: linear-gradient(145deg, #39a874, #23684d); border: 3px solid white; cursor: pointer; box-shadow: 0 3px 9px rgba(0,0,0,.32); --presence-scale: 1; }
    .bird-marker::after { content: ''; position: absolute; left: calc(50% - 19px); bottom: -10px; width: 38px; height: 12px; border-radius: 50%; background: rgba(12,35,27,.42); filter: blur(1.5px); transform: scale(var(--presence-scale)); transform-origin: center; pointer-events: none; }
    @keyframes skyfriendArrive { 0% { opacity: 0; filter: brightness(2.2) saturate(1.6); } 55% { opacity: 1; filter: brightness(1.45) saturate(1.35); } 100% { opacity: 1; filter: none; } }
    @keyframes birdBob { 0%, 100% { transform: scale(var(--presence-scale, 1)) translateY(0); } 50% { transform: scale(var(--presence-scale, 1)) translateY(-2px); } }
    .bird-scale { position: absolute; inset: 0; z-index: 1; display: flex; align-items: center; justify-content: center; transform-origin: center; transition: transform .18s ease-out; transform: scale(var(--presence-scale)); }
    .bird-scale img { position: absolute; left: 2px; top: 2px; width: 36px; height: 36px; object-fit: cover; border-radius: 50%; }
    .bird-marker.presence-close { --presence-scale: 1.24; }
    .bird-marker.presence-near { --presence-scale: 1.1; }
    .bird-marker.presence-mid { --presence-scale: .92; }
    .bird-marker.presence-far { --presence-scale: .72; }
    .bird-marker.virtual .bird-scale { animation: skyfriendArrive .65s ease-out, birdBob 2.6s ease-in-out .7s infinite; }
    .bird-marker.in-range:not(.virtual) .bird-scale { animation: birdBob 2.2s ease-in-out infinite; }
    .bird-marker.virtual.presence-close { --presence-scale: 1.38; }
    .bird-marker.virtual.presence-near { --presence-scale: 1.2; }
    .bird-marker.virtual.presence-mid { --presence-scale: 1; }
    @media (prefers-reduced-motion: reduce) { .bird-marker.virtual .bird-scale, .bird-marker.in-range:not(.virtual) .bird-scale { animation: none; } }
    .bird-marker.presence-far { opacity: .78; }
    .bird-marker.in-range { box-shadow: 0 0 0 5px rgba(217,157,33,.38), 0 2px 8px rgba(0,0,0,.3); }
    .bird-marker.notable { background: linear-gradient(145deg, #efbd35, #b97d08); border-color: #fff3bd; }
    .bird-marker.captured { background: #61776c; border-color: #a9f0bf; }
    .bird-marker.virtual { background: linear-gradient(145deg, #7d64f2, #28b9d7); border-color: #d9fbff; box-shadow: 0 0 14px rgba(92,220,255,.72), 0 3px 9px rgba(0,0,0,.32); }
    .bird-marker.virtual::after { background: rgba(10,58,68,.4); }
    .bird-marker.prismatic::after { background: rgba(76,53,10,.42); }
    .bird-marker.prismatic .bird-scale { animation-duration: .65s, 1.9s; }
    .bird-marker.prismatic { background: linear-gradient(145deg, #ffd766, #7d64f2 48%, #28e0c8); border-color: #fff3bd; box-shadow: 0 0 18px rgba(255,215,102,.88), 0 3px 10px rgba(0,0,0,.34); }
    .thumb-fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .bird-scale .caught-badge, .bird-scale .skyfriend-badge, .bird-scale .audio-badge { position: absolute; right: -6px; bottom: -6px; width: 17px; height: 17px; border-radius: 50%; background: #65d184; color: #10351f; border: 1px solid white; font-size: 11px; line-height: 15px; text-align: center; font-weight: 900; }
    .bird-scale .skyfriend-badge { background: #72e7ff; color: #273075; }
    .bird-scale .audio-badge { background: #7bd7ff; color: #123c64; }
    .bird-marker.audio { background: linear-gradient(145deg, #36a8cf, #2466a7); border-color: #d8f3ff; }
    .skyfriend-tag { display: inline-block; margin-left: 6px; padding: 2px 7px; border-radius: 10px; background: linear-gradient(135deg, #735eea, #29bedd); color: white; font-size: 10px; font-weight: 900; vertical-align: middle; letter-spacing: .02em; }
    .nb-row.virtual .nb-thumb { box-shadow: 0 0 0 2px #72e7ff inset; background: linear-gradient(145deg, #ece7ff, #dffaff); }
    .nb-row.virtual .nb-name { color: #4241a0; }
    .nb-row.virtual .nb-go { background: linear-gradient(135deg, #735eea, #27aacb); }
    .nb-row.prismatic .nb-thumb { box-shadow: 0 0 0 2px #ffd766 inset, 0 0 10px rgba(255,215,102,.5); background: linear-gradient(145deg, #fff2bc, #dffaff); }
    .nb-row.prismatic .nb-name { color: #8a6210; }
    .nb-row.prismatic .nb-go { background: linear-gradient(135deg, #d6a525, #735eea); }
    .user-marker { position: absolute; width: 46px; height: 46px; background: linear-gradient(#2f8ee8,#175fb4); border: 3px solid white; box-shadow: 0 0 0 2px rgba(40,120,209,.45), 0 4px 10px rgba(0,0,0,.35); }
    .user-marker::after { content: ''; position: absolute; left: calc(50% - 21px); bottom: -11px; width: 42px; height: 13px; border-radius: 50%; background: rgba(10,35,48,.38); filter: blur(1.5px); pointer-events: none; }
    .user-marker::before { content: ''; position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; border-radius: 50%; border: 2px solid rgba(40, 120, 209, 0.55); animation: pulse 1.8s ease-out infinite; }
    @keyframes pulse { 0% { transform: translate(-50%, -50%) scale(0.55); opacity: 0.9; } 100% { transform: translate(-50%, -50%) scale(1.45); opacity: 0; } }
    .encounter { width: 242px; max-width: calc(100vw - 88px); line-height: 1.28; color: #26342d; font-size: 13px; }
    .encounter h3 { margin: 0 28px 2px 0; font-size: 17px; line-height: 21px; }
    .encounter .encounter-head { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
    .encounter .encounter-photo { width: 44px; height: 44px; flex: 0 0 44px; border-radius: 50%; object-fit: cover; border: 2px solid #e0c364; background: #e6eee9; box-shadow: 0 1px 4px rgba(0,0,0,.18); }
    .encounter .encounter-title { flex: 1; min-width: 0; }
    .encounter .encounter-title h3 { margin-right: 22px; }
    .encounter .scientific { font-style: italic; color: #64766d; font-size: 11px; }
    .encounter .meta, .encounter .distance, .encounter .info, .encounter .field-notes { margin-top: 5px; }
    .encounter .stale { color: #8b6418; font-weight: 800; margin-top: 5px; font-size: 11px; line-height: 14px; }
    .encounter .where, .encounter .field-notes, .encounter .info { color: #4c5c54; }
    .encounter .where { font-size: 12px; line-height: 15px; }
    .encounter .distance { font-size: 12px; font-weight: 750; color: #264536; }
    .encounter .field-notes { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; max-height: 45px; overflow: hidden; font-size: 11px; line-height: 15px; }
    .encounter .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
    .encounter .audio-credit { display: none; color: #68796f; font-size: 9px; line-height: 12px; margin-top: 5px; }
    .encounter .audio-credit.on { display: block; }
    .encounter button { min-height: 40px; border: 0; border-radius: 10px; padding: 6px 7px; color: white; background: #2f7d5b; font-weight: 800; font-size: 12px; cursor: pointer; box-shadow: inset 0 -2px 0 rgba(0,0,0,.12); }
    .encounter button:nth-child(2) { background: #2878d1; }
    .encounter button:nth-child(3) { background: #d99d21; }
    .encounter button:nth-child(4) { background: #6f5aa8; }
    .maplibregl-popup { z-index: 9 !important; }
    .maplibregl-popup-content { border-radius: 16px; padding: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.32); }
    .maplibregl-popup-close-button { width: 34px; height: 34px; font-size: 21px; line-height: 31px; color: #718177; }
    .maplibregl-ctrl-top-right { top: calc(var(--safe-top) + 156px); right: 84px; }
    .maplibregl-ctrl-group button { width: 44px; height: 44px; }
    #map-attribution { position: absolute; z-index: 10; bottom: calc(var(--bottom-hud) + 4px); left: 8px; font-family: -apple-system, system-ui, sans-serif; }
    #map-attribution-toggle { width: 32px; height: 32px; border: 0; border-radius: 16px; background: rgba(255,255,255,.84); color: #34453c; box-shadow: 0 2px 7px rgba(0,0,0,.18); font-size: 16px; cursor: pointer; }
    #map-attribution-copy { position: absolute; bottom: 38px; left: 0; display: none; width: 220px; padding: 9px 11px; border-radius: 10px; background: rgba(255,255,255,.96); color: #34453c; box-shadow: 0 2px 10px rgba(0,0,0,.22); font-size: 11px; line-height: 15px; }
    #map-attribution.open #map-attribution-copy { display: block; }
    #map-attribution.hidden { display: none; }
    #nearby-panel { position: absolute; left: 8px; right: 8px; bottom: var(--bottom-hud); z-index: 6; background: rgba(255,255,255,.96); border-radius: 16px; box-shadow: 0 4px 18px rgba(0,0,0,.25); font-family: -apple-system, system-ui, sans-serif; overflow: hidden; height: 58px; display: flex; flex-direction: column; transition: transform .15s ease; }
    #nearby-panel.peek { height: 58px; left: auto; width: 136px; }
    #nearby-panel.peek #rare-toggle, #nearby-panel.peek #sort-toggle { display: none; }
    #nearby-panel.peek #nearby-header { padding-left: 10px; padding-right: 8px; gap: 5px; }
    #nearby-panel.peek #nearby-title { font-size: 12px; }
    #nearby-panel.half { height: 44vh; }
    #nearby-header { display: flex; align-items: center; gap: 8px; min-height: 44px; box-sizing: border-box; padding: 6px 12px; cursor: pointer; border-bottom: 1px solid #eee; }
    #nearby-title { font-weight: 800; color: #173c2b; font-size: 14px; flex: 1; }
    #rare-toggle { min-height: 44px; border: 1px solid #d99d21; color: #b6810f; background: #fff; border-radius: 14px; padding: 4px 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
    #rare-toggle.on { background: #d99d21; color: #fff; }
    #sort-toggle { min-height: 44px; min-width: 48px; border: 1px solid #2f7d5b; color: #2f7d5b; background: #fff; border-radius: 14px; padding: 4px 7px; font-size: 11px; font-weight: 800; cursor: pointer; }
    #sort-toggle.on { background: #2f7d5b; color: #fff; }
    #nearby-caret { color: #888; font-size: 13px; width: 14px; text-align: center; }
    #nearby-list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px; -webkit-overflow-scrolling: touch; }
    #nearby-panel.collapsed #nearby-list { display: none; }
    #nearby-handle { width: 36px; height: 5px; border-radius: 4px; background: #b8c1bb; margin: 5px auto 0; flex: none; touch-action: none; }
    #nearby-panel.tracking { display: none; }
    .nb-row { display: flex; align-items: center; gap: 8px; min-height: 60px; padding: 6px 8px; border-radius: 12px; cursor: pointer; }
    .nb-row:active { background: #f0f5f1; }
    .nb-thumb { position: relative; width: 46px; height: 46px; border-radius: 50%; overflow: hidden; flex: none; background: #dbe7df; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    .nb-thumb img { position: relative; z-index: 1; width: 100%; height: 100%; object-fit: cover; }
    .nb-info { flex: 1; min-width: 0; }
    .nb-name { font-weight: 700; color: #21362c; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nb-name .star { color: #d99d21; }
    .nb-sub { color: #5c6f65; font-size: 12px; line-height: 16px; margin-top: 1px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .nb-go { min-width: 52px; min-height: 44px; box-sizing: border-box; border: 0; border-radius: 22px; padding: 9px 12px; background: #2f7d5b; color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; flex: none; }
    .nb-row.rare .nb-go { background: #d99d21; }
    .nb-empty { padding: 16px; text-align: center; color: #6b7d72; font-size: 13px; }
    #track-hud { position: absolute; inset: 0; z-index: 5; pointer-events: none; display: none; }
    #track-hud.on { display: block; }
    #track-arrow { position: absolute; top: 40%; left: 50%; margin: -70px 0 0 -46px; font-size: 104px; line-height: 92px; color: rgba(47,125,91,.92); text-shadow: 0 3px 10px rgba(0,0,0,.4); transition: transform .18s ease-out; }
    #track-arrow.rare { color: rgba(217,157,33,.96); }
    #track-card { position: absolute; left: 8px; right: 8px; bottom: var(--bottom-hud); z-index: 8; background: rgba(255,255,255,.97); border-radius: 16px; box-shadow: 0 4px 18px rgba(0,0,0,.28); padding: 10px; display: none; align-items: center; gap: 8px; pointer-events: auto; font-family: -apple-system, system-ui, sans-serif; }
    #track-card.on { display: flex; }
    #track-thumb { position: relative; width: 54px; height: 54px; border-radius: 50%; overflow: hidden; flex: none; background: #dbe7df; display: flex; align-items: center; justify-content: center; font-size: 26px; }
    #track-thumb img { position: relative; z-index: 1; width: 100%; height: 100%; object-fit: cover; }
    #track-meta { flex: 1; min-width: 0; }
    #track-name { font-weight: 800; color: #173c2b; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #track-dist { color: #2f7d5b; font-weight: 700; font-size: 13px; line-height: 17px; margin-top: 2px; min-width: 0; overflow-wrap: anywhere; }
    #track-actions { display: flex; gap: 4px; flex: none; }
    #track-snap { min-height: 44px; border: 0; border-radius: 22px; padding: 10px 10px; background: #2f7d5b; color: #fff; font-weight: 800; cursor: pointer; white-space: nowrap; }
    #track-snap.ready { background: #d99d21; animation: snappulse 1s infinite; }
    #track-snap:disabled { background: #536a5e; opacity: .58; animation: none; cursor: default; }
    #track-stop { border: 0; border-radius: 22px; min-width: 44px; min-height: 44px; padding: 10px; background: #eceff0; color: #445; font-weight: 700; cursor: pointer; }
    #route-panel { position: absolute; left: 8px; right: 84px; bottom: calc(var(--bottom-hud) + var(--track-stack) + 12px); z-index: 8; max-height: 32%; display: none; background: rgba(255,255,255,.97); border-radius: 16px; box-shadow: 0 4px 18px rgba(0,0,0,.28); overflow: hidden; font-family: -apple-system, system-ui, sans-serif; pointer-events: auto; }
    #route-panel.on { display: block; }
    #route-header { display: flex; align-items: center; gap: 10px; min-height: 52px; box-sizing: border-box; padding: 7px 12px; cursor: pointer; border-bottom: 1px solid #eee; color: #173c2b; font-size: 13px; }
    #route-header-copy { flex: 1; min-width: 0; }
    #route-current { display: flex; align-items: baseline; gap: 6px; font-weight: 800; white-space: normal; overflow: hidden; }
    #route-current-icon { flex: none; color: #2878d1; font-size: 18px; line-height: 18px; }
    #route-current-text { min-width: 0; overflow-wrap: anywhere; }
    #route-current-distance { flex: none; color: #6b7d72; font-size: 12px; }
    #route-summary { margin-top: 2px; color: #6b7d72; font-size: 11px; font-weight: 600; }
    #route-caret { color: #888; }
    #route-steps { overflow-y: auto; max-height: 220px; padding: 4px; }
    #route-panel.collapsed #route-steps { display: none; }
    .route-step { display: flex; gap: 8px; align-items: center; min-height: 44px; box-sizing: border-box; padding: 8px; border-radius: 10px; color: #5c6f65; font-size: 12px; }
    .route-step > span:nth-child(2) { min-width: 0; overflow-wrap: anywhere; }
    .route-step.current { background: #eaf3ff; color: #173c2b; font-weight: 700; }
    .route-step-icon { width: 26px; text-align: center; color: #2878d1; font-size: 22px; line-height: 22px; font-weight: 900; }
    .route-step-distance { margin-left: auto; white-space: nowrap; color: #6b7d72; font-weight: 600; }
    @keyframes snappulse { 0%,100%{ transform: scale(1);} 50%{ transform: scale(1.07);} }
    #snap-toast { position: absolute; left: 50%; top: calc(var(--safe-top) + 62px); transform: translateX(-50%); z-index: 8; max-width: min(82%, 320px); display: none; align-items: center; gap: 8px; background: rgba(217,157,33,.97); color: #fff; border: 0; border-radius: 22px; padding: 4px 10px 4px 14px; font-weight: 800; font-size: 12px; font-family: -apple-system, system-ui, sans-serif; box-shadow: 0 3px 12px rgba(0,0,0,.3); pointer-events: auto; }
    #snap-toast.on { display: flex; }
    #snap-toast-copy { display: inline-block; flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    #snap-toast-go { min-width: 44px; min-height: 44px; flex: 0 0 44px; border: 0; border-radius: 18px; padding: 8px 10px; background: rgba(255,255,255,.22); color: #fff; font-weight: 800; cursor: pointer; }
    #snap-toast-dismiss { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex: 0 0 44px; margin: -8px -10px -8px 0; border: 0; background: transparent; color: #fff; border-radius: 50%; font-size: 20px; cursor: pointer; }
    #compass-button { position: absolute; z-index: 7; right: 12px; top: calc(var(--safe-top) + 118px); width: 44px; height: 44px; border: 0; border-radius: 22px; padding: 0; color: white; background: rgba(35, 73, 53, .92); font-size: 20px; display: none; cursor: pointer; }
    @media (max-width: 600px) {
      #nearby-panel.half { height: 46vh; }
      .nb-thumb { width: 38px; height: 38px; font-size: 18px; }
      .nb-row { min-height: 56px; gap: 5px; padding: 5px 6px; }
      .nb-go { min-width: 44px; padding: 8px; }
      #route-panel { max-height: 30%; }
      #track-arrow { font-size: 86px; line-height: 78px; margin: -58px 0 0 -38px; }
      .encounter { min-width: 0; }
      .encounter .actions { gap: 6px; }
      .encounter button { flex-basis: 30%; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="atmosphere-tint"></div>
  <div id="sky-gradient"></div>
  <div id="sky-life" aria-hidden="true">
    <span class="sky-bird sky-bird-one"><svg viewBox="0 0 36 14"><path d="M2 9 Q9 1 18 9 Q27 1 34 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg></span>
    <span class="sky-bird sky-bird-two"><svg viewBox="0 0 36 14"><path d="M2 9 Q9 1 18 9 Q27 1 34 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg></span>
    <span class="sky-bird sky-bird-three"><svg viewBox="0 0 36 14"><path d="M2 9 Q9 1 18 9 Q27 1 34 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg></span>
  </div>
  <div id="weather-orb"></div>
  <div id="weather-particles"></div>
  <div id="map-loading"><div id="map-loading-card"><div id="map-loading-ring"></div><div id="map-loading-title">Scanning the canopy</div><div id="map-loading-subtitle">Loading nearby habitat</div></div></div>
  <div id="track-hud"><div id="track-arrow">⬆</div></div>
  <div id="nearby-panel" class="collapsed peek">
    <div id="nearby-handle" aria-hidden="true"></div>
    <div id="nearby-header">
      <span id="nearby-title">Birds nearby</span>
      <button id="rare-toggle" type="button">Rare</button>
      <button id="sort-toggle" type="button" aria-label="Change Nearby sort">Near</button>
      <span id="nearby-caret">▸</span>
    </div>
    <div id="nearby-list"></div>
  </div>
  <div id="track-card">
    <div id="track-thumb"></div>
    <div id="track-meta"><div id="track-name"></div><div id="track-dist"></div></div>
    <div id="track-actions"><button id="track-snap" type="button">Snap</button><button id="track-stop" type="button">✕</button></div>
  </div>
  <div id="route-panel" class="collapsed">
    <div id="route-header">
      <div id="route-header-copy">
        <div id="route-current"><span id="route-current-icon">➤</span><span id="route-current-text">Walking directions</span><span id="route-current-distance"></span></div>
        <div id="route-summary">Walking route</div>
      </div>
      <span id="route-caret">▸</span>
    </div>
    <div id="route-steps"></div>
  </div>
  <div id="snap-toast" role="status"><span id="snap-toast-copy"></span><button id="snap-toast-go" type="button">Go</button><button id="snap-toast-dismiss" type="button" aria-label="Dismiss">×</button></div>
  <button id="compass-button" type="button" aria-label="Enable compass">N</button>
  <div id="map-attribution"><button id="map-attribution-toggle" type="button" aria-label="Show map credits">i</button><div id="map-attribution-copy">MapLibre © MapLibre · Map tiles © OpenFreeMap · © OpenStreetMap contributors · Walking routes © OSRM</div></div>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    (function () {
      var adventureMapStyle = {
        version: 8,
        sources: {
          openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/backup_planet', maxzoom: 14 }
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#a9d88f' } },
          {
            id: 'landuse-urban', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
            filter: ['match', ['get', 'class'], ['residential', 'neighbourhood', 'commercial', 'industrial', 'school', 'hospital', 'suburb'], true, false],
            paint: { 'fill-color': '#b9d99d', 'fill-opacity': 0.42 }
          },
          {
            id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park',
            filter: ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false],
            paint: { 'fill-color': '#83c979', 'fill-opacity': 1 }
          },
          {
            id: 'landcover-grass', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
            filter: ['==', ['get', 'class'], 'grass'],
            paint: { 'fill-color': '#86cc79', 'fill-opacity': 1 }
          },
          {
            id: 'landcover-wood', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
            filter: ['==', ['get', 'class'], 'wood'],
            paint: { 'fill-color': '#67b96b', 'fill-opacity': 1 }
          },
          {
            id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
            paint: { 'fill-color': '#5cc4ea', 'fill-opacity': 1 }
          },
          {
            id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway',
            filter: ['match', ['get', 'class'], ['canal', 'river', 'stream'], true, false],
            paint: { 'line-color': '#6cc7e8', 'line-width': ['interpolate', ['exponential', 1.25], ['zoom'], 10, 0.7, 16, 4, 20, 8], 'line-opacity': 0.82 }
          },
          {
            id: 'highway-minor-casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
            filter: ['all', ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false]],
            paint: { 'line-color': '#c4cbb8', 'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 13, 1.2, 16, 4.5, 20, 9], 'line-opacity': 0.28 },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
          },
          {
            id: 'highway-major-casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
            filter: ['all', ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false]],
            paint: { 'line-color': '#c4cbb8', 'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 8, 1, 15, 5.5, 20, 14], 'line-opacity': 0.38 },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
          },
          {
            id: 'highway-minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
            filter: ['all', ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false]],
            paint: { 'line-color': '#f4edda', 'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 13, 0.7, 16, 3, 20, 7], 'line-opacity': 0.62 },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
          },
          {
            id: 'highway-major', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
            filter: ['all', ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false]],
            paint: { 'line-color': '#ffe1a3', 'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 8, 0.6, 15, 3.8, 20, 11], 'line-opacity': 0.84 },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
          },
          {
            id: 'highway-path', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
            filter: ['all', ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], ['==', ['get', 'class'], 'path']],
            paint: { 'line-color': '#eef0ce', 'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 14, 0.8, 18, 2.6, 20, 4.5], 'line-opacity': 0.55 },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
          },
          {
            id: 'railway', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
            filter: ['all', ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], ['match', ['get', 'class'], ['rail', 'transit'], true, false]],
            paint: { 'line-color': '#aebaa5', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 18, 2], 'line-opacity': 0.5 }
          },
          {
            id: 'building-footprint', type: 'fill', source: 'openmaptiles', 'source-layer': 'building',
            minzoom: 15,
            filter: ['!', ['has', 'hide_3d']],
            paint: { 'fill-color': '#e1dbc9', 'fill-opacity': 0.2, 'fill-outline-color': '#b9ad8f' }
          },
          {
            id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building',
            minzoom: 15,
            filter: ['!', ['has', 'hide_3d']],
            paint: {
              'fill-extrusion-color': '#e2dcc9',
              'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.4, ['*', ['coalesce', ['get', 'render_height'], 8], 0.38]],
              'fill-extrusion-base': ['*', ['coalesce', ['get', 'render_min_height'], 0], 0.38],
              'fill-extrusion-opacity': 0.3,
              'fill-extrusion-vertical-gradient': true
            }
          }
        ]
      };
      var map = new maplibregl.Map({
        container: 'map',
        style: adventureMapStyle,
        center: [-122.4194, 37.7749],
        zoom: 15.5,
        pitch: 58,
        bearing: 0,
        attributionControl: false
      });
      var mapLoading = document.getElementById('map-loading');
      var mapLoadingHidden = false;
      function hideMapLoading() {
        if (mapLoadingHidden) return;
        mapLoadingHidden = true;
        if (mapLoading) mapLoading.classList.add('hidden');
      }
      map.once('idle', hideMapLoading);
      setTimeout(hideMapLoading, 6500);
      var birdMarkers = [];
      var currentPopup = null;
      var userMarker = null;
      var userElement = null;
      var userGesture = false;
      var firstData = true;
      var moveTimer = null;
      var lastUserLocation = null;
      var latestMarkers = [];
      var follow = true;
      var programmatic = false;
      var headingFollow = false;
      var orientationListening = false;
      var orientationPermission = null;
      var currentHeading = null;
      var bearingFrame = null;
      var arrowFrame = null;
      var trackId = null;
      var currentPopupBirdId = null;
      var currentAudio = null;
      var currentAudioKey = null;
      var currentAudioAttribution = '';
      var audioRequest = 0;
      var guideCache = Object.create(null);
      var apiBaseUrl = ${serializedApiBaseUrl};
      var routeDistanceM = null;
      var routeGeometryCoordinates = [];
      var routeAlongM = 0;
      var routeOffRouteM = null;
      var routeFallback = false;
      var routeInFlight = false;
      var routeFailureAt = 0;
      var routeFailureOrigin = null;
      var routeFailureTargetKey = null;
      var routeRetryDelayMs = 15000;
      var routeSteps = [];
      var routeStepIndex = 0;
      var routePanelCollapsed = true;
      var routeSeq = 0;
      var lastRouteOrigin = null;
      var lastRouteTargetKey = null;
      var rareOnly = false;
      var sortMode = 'nearest';
      var birdsLoading = true;
      var panelState = 'peek';
      var lastMarkerRenderSignature = '';
      var lastMarkerInput = null;
      var lastMarkerInputSignature = '';
      var paddingAnimationActive = false;
      var paddingAnimationToken = 0;
      var deferredCompassHeading = null;
      var SNAP_M = 60;
      var ARRIVE_M = 30;
      var compassButton = document.getElementById('compass-button');
      var nearbyPanel = document.getElementById('nearby-panel');
      var nearbyHandle = document.getElementById('nearby-handle');
      var nearbyHeader = document.getElementById('nearby-header');
      var nearbyTitle = document.getElementById('nearby-title');
      var rareToggle = document.getElementById('rare-toggle');
      var sortToggle = document.getElementById('sort-toggle');
      var nearbyCaret = document.getElementById('nearby-caret');
      var nearbyList = document.getElementById('nearby-list');
      var lastNearbyCount = null;
      var trackHud = document.getElementById('track-hud');
      var trackArrow = document.getElementById('track-arrow');
      var trackCard = document.getElementById('track-card');
      var trackThumb = document.getElementById('track-thumb');
      var trackName = document.getElementById('track-name');
      var trackDist = document.getElementById('track-dist');
      var trackSnap = document.getElementById('track-snap');
      var trackStop = document.getElementById('track-stop');
      var routePanel = document.getElementById('route-panel');
      var routeHeader = document.getElementById('route-header');
      var routeCurrentIcon = document.getElementById('route-current-icon');
      var routeCurrentText = document.getElementById('route-current-text');
      var routeCurrentDistance = document.getElementById('route-current-distance');
      var attribution = document.getElementById('map-attribution');
      var attributionToggle = document.getElementById('map-attribution-toggle');
      var routeSummary = document.getElementById('route-summary');
      var routeCaret = document.getElementById('route-caret');
      var routeStepsElement = document.getElementById('route-steps');
      var nearbyGeometryFrame = null;
      var compassDisplayBeforeToast = null;
      function updateControlStack() {
        var zoomGroup = document.querySelector('.maplibregl-ctrl-top-right');
        if (!zoomGroup) return;
        var rootStyle = getComputedStyle(document.documentElement);
        var safeTop = parseFloat(rootStyle.getPropertyValue('--safe-top')) || 0;
        var panelStyle = getComputedStyle(nearbyPanel);
        var panelBottom = parseFloat(panelStyle.bottom) || 0;
        var panelTop = window.innerHeight - panelBottom - nearbyPanel.offsetHeight;
        var toastOpen = snapToast.classList.contains('on');
        var builtInCompass = document.querySelector('.maplibregl-ctrl-compass');
        if (toastOpen) {
          if (builtInCompass) builtInCompass.style.display = 'none';
          if (compassDisplayBeforeToast == null) compassDisplayBeforeToast = compassButton.style.display;
          compassButton.style.display = 'none';
        } else {
          if (builtInCompass) builtInCompass.style.display = '';
          if (compassDisplayBeforeToast != null) {
            compassButton.style.display = compassDisplayBeforeToast;
            compassDisplayBeforeToast = null;
          }
        }
        var zoomHeight = zoomGroup.getBoundingClientRect().height || 142;
        var compassHeight = compassButton.getBoundingClientRect().height || 44;
        var minimumTop = safeTop + 8;
        var maximumTop = panelTop - zoomHeight - 8;
        var toastRect = toastOpen ? snapToast.getBoundingClientRect() : null;
        var toastBottom = toastRect ? toastRect.bottom + 8 : minimumTop;
        var belowToastTop = Math.min(toastBottom, maximumTop);
        var aboveToastTop = toastRect ? toastRect.top - zoomHeight - 2 : minimumTop;
        var zoomTop = toastOpen && toastBottom <= maximumTop
          ? belowToastTop
          : toastOpen && aboveToastTop >= minimumTop
            ? aboveToastTop
            : Math.max(minimumTop, Math.min(safeTop + 156, maximumTop));
        zoomGroup.style.top = zoomTop + 'px';
        var compassMaximumTop = panelTop - compassHeight - 8;
        compassButton.style.top = Math.max(minimumTop, Math.min(safeTop + 214, compassMaximumTop)) + 'px';
      }
      function scheduleNearbyGeometry() {
        if (nearbyGeometryFrame != null) return;
        nearbyGeometryFrame = requestAnimationFrame(function () {
          nearbyGeometryFrame = null;
          if (nearbyPanel.style.transform) return;
          var settledPanelRect = nearbyPanel.getBoundingClientRect();
          updateControlStack();
          postOutward({
            type: 'nearbyState',
            state: panelState,
            height: settledPanelRect.height
          });
        });
      }
      attributionToggle.addEventListener('click', function () {
        var open = attribution.classList.toggle('open');
        attributionToggle.setAttribute('aria-label', open ? 'Hide map credits' : 'Show map credits');
      });
      var snapToast = document.getElementById('snap-toast');
      var snapToastCopy = document.getElementById('snap-toast-copy');
      var snapToastGo = document.getElementById('snap-toast-go');
      var snapToastDismiss = document.getElementById('snap-toast-dismiss');
      var snapToastAction = null;
      var toastReported = false;
      var followPauseReported = false;
      var programmaticCameraMove = false;
      function markProgrammaticCameraMove() { programmaticCameraMove = true; }

      function postOutward(payload) {
        var serialized = JSON.stringify(payload);
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(serialized);
        else if (window.parent && window.parent !== window) window.parent.postMessage(serialized, '*');
        else window.postMessage(serialized, '*');
      }

      function reportToast(open) {
        if (toastReported === open) return;
        toastReported = open;
        postOutward({ type: 'toast', open: open });
      }

      function setToast(open) {
        if (open && currentPopup) open = false;
        snapToast.classList.toggle('on', open);
        reportToast(open);
        scheduleNearbyGeometry();
      }

      function reportFollowPaused(paused) {
        if (followPauseReported === paused) return;
        followPauseReported = paused;
        postOutward({ type: 'follow', paused: paused });
      }

      function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character];
        });
      }

      function applySafeArea(insets) {
        var safeArea = insets || {};
        var root = document.documentElement;
        root.style.setProperty('--safe-top', Math.max(0, Number(safeArea.top) || 0) + 'px');
        root.style.setProperty('--safe-right', Math.max(0, Number(safeArea.right) || 0) + 'px');
        root.style.setProperty('--safe-bottom', Math.max(0, Number(safeArea.bottom) || 0) + 'px');
        root.style.setProperty('--safe-left', Math.max(0, Number(safeArea.left) || 0) + 'px');
      }

      function haversineKm(a, b) {
        if (!a || !b) return null;
        var radians = Math.PI / 180;
        var dLat = (b.latitude - a.latitude) * radians;
        var dLng = (((b.longitude - a.longitude) + 540) % 360 - 180) * radians;
        var lat1 = a.latitude * radians;
        var lat2 = b.latitude * radians;
        var value = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
        return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
      }

      function haversineM(a, b) {
        var distance = haversineKm(a, b);
        return distance == null ? null : distance * 1000;
      }

      function presencePolygon(center, radiusMeters) {
        var coordinates = [];
        var latitudeScale = 111320;
        var longitudeScale = Math.max(1000, latitudeScale * Math.cos(center.latitude * Math.PI / 180));
        for (var index = 0; index <= 72; index += 1) {
          var angle = index / 72 * Math.PI * 2;
          coordinates.push([
            center.longitude + Math.sin(angle) * radiusMeters / longitudeScale,
            center.latitude + Math.cos(angle) * radiusMeters / latitudeScale,
          ]);
        }
        return {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [coordinates] },
        };
      }

      function updatePresenceRadius() {
        if (!lastUserLocation) return;
        var source;
        try { source = map.getSource('presence-radius'); } catch (_) { return; }
        if (!source) return;
        source.setData({
          type: 'FeatureCollection',
          features: [presencePolygon(lastUserLocation, SNAP_M)],
        });
      }

      function projectPointOnRoute(point, coordinates) {
        if (!point || !Array.isArray(coordinates) || coordinates.length < 2) return null;
        var latRadians = point.latitude * Math.PI / 180;
        var scale = Math.cos(latRadians);
        var best = null;
        var along = 0;
        for (var index = 0; index < coordinates.length - 1; index += 1) {
          var start = coordinates[index];
          var end = coordinates[index + 1];
          if (!Array.isArray(start) || !Array.isArray(end)) continue;
          var ax = start[0] * scale;
          var ay = start[1];
          var bx = end[0] * scale;
          var by = end[1];
          var px = point.longitude * scale;
          var py = point.latitude;
          var dx = bx - ax;
          var dy = by - ay;
          var lengthSquared = dx * dx + dy * dy;
          var fraction = lengthSquared ? ((px - ax) * dx + (py - ay) * dy) / lengthSquared : 0;
          fraction = Math.max(0, Math.min(1, fraction));
          var projected = { longitude: (ax + dx * fraction) / scale, latitude: ay + dy * fraction };
          var distance = haversineM(point, projected);
          var segmentDistance = haversineM(
            { latitude: start[1], longitude: start[0] },
            { latitude: end[1], longitude: end[0] },
          ) || 0;
          if (!best || distance < best.distanceM) {
            best = {
              point: projected,
              distanceM: distance,
              alongM: along + segmentDistance * fraction,
              segmentIndex: index,
              fraction: fraction,
            };
          }
          along += segmentDistance;
        }
        return best;
      }

      function routeRemainingCoordinates(projection) {
        if (!projection || !routeGeometryCoordinates.length) return [];
        var coordinates = [[projection.point.longitude, projection.point.latitude]];
        for (var index = projection.segmentIndex + 1; index < routeGeometryCoordinates.length; index += 1) {
          coordinates.push(routeGeometryCoordinates[index]);
        }
        return coordinates;
      }

      var birdImageCache = {};
      function birdGlyph() {
        return '<svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true"><path d="M12 39c4-13 15-23 29-23 7 0 12 3 14 8l7 3-6 4c-2 9-10 15-20 15-8 0-15-2-24-7z" fill="currentColor"/><circle cx="47" cy="24" r="2.4" fill="#234236"/><path d="M14 39 4 45l13 2z" fill="currentColor" opacity=".82"/></svg>';
      }
      function safeSvgColor(value, fallback) {
        return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
      }
      function personGlyph(profile) {
        var accent = safeSvgColor(profile && profile.accentColor, '#ffffff');
        var accessory = profile && ['none', 'cap', 'visor', 'hood'].indexOf(profile.accessory) >= 0 ? profile.accessory : 'cap';
        var accessorySvg = '';
        if (accessory === 'cap') accessorySvg = '<path d="M22 15c2-7 7-10 10-10s8 3 10 10l4 2H18z" fill="' + accent + '"/>';
        else if (accessory === 'visor') accessorySvg = '<path d="M20 15h24l5 4H17z" fill="' + accent + '"/>';
        else if (accessory === 'hood') accessorySvg = '<path d="M20 27c-2-14 4-23 12-23s14 9 12 23c-3-7-6-11-12-11s-9 4-12 11z" fill="' + accent + '" opacity=".95"/>';
        return '<svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true"><circle cx="32" cy="18" r="9" fill="#f2c39b"/><circle cx="29" cy="18" r="1.1" fill="#26342d"/><circle cx="35" cy="18" r="1.1" fill="#26342d"/><path d="M29 22q3 2.4 6 0" stroke="#26342d" stroke-width="1.3" fill="none" stroke-linecap="round"/>' + accessorySvg + '<path d="M18 50c2-13 8-20 14-20s12 7 14 20z" fill="' + accent + '"/><path d="M20 34c-5 4-8 9-9 15l8 2c1-6 3-10 6-13zm24 0c5 4 8 9 9 15l-8 2c-1-6-3-10-6-13z" fill="#d8ecff"/></svg>';
      }
      function thumbInnerHtml(bird, emojiFallback) {
        var image = getBirdImage(bird);
        var fallback = emojiFallback || birdGlyph();
        if (typeof image === 'string' && image) {
          return '<span class="thumb-fallback">' + fallback + '</span><img src="' + escapeHtml(image) + '" alt="" onerror="this.remove()" />';
        }
        return fallback;
      }
      function markerInnerHtml(bird) {
        return '<span class="bird-scale">' + thumbInnerHtml(bird) + (bird.captureCount ? '<span class="caught-badge">✓</span>' : bird.virtual ? '<span class="skyfriend-badge">✦</span>' : bird.source === 'birdweather' ? '<span class="audio-badge">♪</span>' : '') + '</span>';
      }
      function refreshBirdMarkerIcons() {
        birdMarkers.forEach(function (marker) {
          if (marker && marker._birdgoBird && marker.getElement) {
            marker.getElement().innerHTML = markerInnerHtml(marker._birdgoBird);
          }
        });
      }

      function getBirdImage(bird) {
        var names = [bird && bird.comName, bird && bird.sciName].filter(Boolean);
        var key = names[0] || (bird && bird.id);
        if (!key) return false;
        if (bird && typeof bird.imageUrl === 'string' && bird.imageUrl) {
          birdImageCache[key] = bird.imageUrl;
          return bird.imageUrl;
        }
        if (Object.prototype.hasOwnProperty.call(birdImageCache, key)) {
          var cachedImage = birdImageCache[key];
          if (typeof cachedImage === 'string' && cachedImage && bird && !bird.imageUrl) bird.imageUrl = cachedImage;
          return cachedImage;
        }
        birdImageCache[key] = null;
        function tryName(index) {
          if (index >= names.length) {
            birdImageCache[key] = false;
            refreshUi();
            return;
          }
          fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(names[index]))
            .then(function (response) { if (!response.ok) throw new Error('no summary'); return response.json(); })
            .then(function (summary) {
              var image = summary.thumbnail && summary.thumbnail.source;
              if (image) {
                birdImageCache[key] = image;
                if (bird && !bird.imageUrl) bird.imageUrl = image;
                refreshUi();
              } else {
                tryName(index + 1);
              }
            })
            .catch(function () { tryName(index + 1); });
        }
        tryName(0);
        return null;
      }

      function geographicBearing(a, b) {
        var radians = Math.PI / 180;
        var lat1 = a.latitude * radians;
        var lat2 = b.latitude * radians;
        var dLng = (b.longitude - a.longitude) * radians;
        var y = Math.sin(dLng) * Math.cos(lat2);
        var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        return (Math.atan2(y, x) / radians + 360) % 360;
      }

      function updateBearing(heading) {
        if (typeof heading !== 'number' || !headingFollow) return;
        if (paddingAnimationActive) {
          deferredCompassHeading = heading;
          return;
        }
        var target = (heading + 360) % 360;
        if (typeof currentHeading !== 'number') currentHeading = target;
        else {
          var delta = ((target - currentHeading + 540) % 360) - 180;
          currentHeading = (currentHeading + delta * 0.28 + 360) % 360;
        }
        if (bearingFrame != null) return;
        bearingFrame = requestAnimationFrame(function () {
          bearingFrame = null;
          if (headingFollow && typeof currentHeading === 'number') {
            programmatic = true;
            markProgrammaticCameraMove();
            map.setBearing(currentHeading);
            programmatic = false;
          }
        });
      }

      function orientationHandler(event) {
        var heading = typeof event.webkitCompassHeading === 'number'
          ? event.webkitCompassHeading
          : event.absolute && event.alpha != null ? 360 - event.alpha : null;
        if (heading != null) updateBearing(heading);
      }

      function startOrientation() {
        if (orientationListening) return;
        if (!window.DeviceOrientationEvent) return;
        window.addEventListener('deviceorientationabsolute', orientationHandler, true);
        window.addEventListener('deviceorientation', orientationHandler, true);
        orientationListening = true;
        compassButton.style.display = 'none';
      }

      function enableOrientation() {
        var deviceOrientation = window.DeviceOrientationEvent;
        if (!deviceOrientation) return;
        if (typeof deviceOrientation.requestPermission === 'function' && orientationPermission !== 'granted') {
          compassButton.style.display = 'block';
          return;
        }
        startOrientation();
      }

      function firstPersonPadding() {
        var height = map.getContainer().clientHeight || 600;
        var targetY = height * 0.68;
        if (panelState === 'half' && !nearbyPanel.classList.contains('tracking')) {
          var sheetRatio = window.innerWidth <= 600 ? 0.46 : 0.44;
          var safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
          var nearbyTop = height - (height * sheetRatio) - 16 - safeBottom;
          targetY = Math.min(targetY, nearbyTop - 24);
        }
        if (routePanel.classList.contains('on')) {
          var routeTop = routePanel.getBoundingClientRect().top;
          if (routeTop > 0) targetY = Math.min(targetY, routeTop - 24);
        }
        return {
          top: Math.max(0, Math.round(targetY * 2 - height)),
          right: 0,
          bottom: Math.max(0, Math.round(height - targetY * 2)),
          left: 0,
        };
      }
      function animateFirstPersonPadding(duration) {
        var token = ++paddingAnimationToken;
        paddingAnimationActive = true;
        map.easeTo({ padding: firstPersonPadding(), duration: duration });
        setTimeout(function () {
          if (token !== paddingAnimationToken) return;
          paddingAnimationActive = false;
          if (deferredCompassHeading != null) {
            var heading = deferredCompassHeading;
            deferredCompassHeading = null;
            updateBearing(heading);
          }
        }, duration + 90);
      }

      function frameUser(target, duration) {
        if (!target || typeof target.latitude !== 'number' || typeof target.longitude !== 'number') return;
        markProgrammaticCameraMove();
        map.setPadding(firstPersonPadding());
        map.easeTo({
          center: [target.longitude, target.latitude],
          pitch: 60,
          zoom: 17.3,
          bearing: typeof currentHeading === 'number' ? currentHeading : map.getBearing(),
          duration: duration
        });
      }

      compassButton.addEventListener('click', function () {
        var deviceOrientation = window.DeviceOrientationEvent;
        if (!deviceOrientation || typeof deviceOrientation.requestPermission !== 'function') {
          startOrientation();
          return;
        }
        deviceOrientation.requestPermission().then(function (permission) {
          orientationPermission = permission;
          if (permission === 'granted') startOrientation();
        }).catch(function () {});
      });

      function openBirdPopup(bird) {
        stopBirdAudio();
        setToast(false);
        snapToastAction = null;
        if (currentPopup) currentPopup.remove();
        var popup = new maplibregl.Popup({ offset: 24, maxWidth: '282px', closeButton: true })
          .setLngLat([bird.longitude, bird.latitude])
          .setHTML(popupHtml(bird, lastUserLocation))
          .addTo(map);
        currentPopup = popup;
        currentPopupBirdId = bird.id;
        postOutward({ type: 'popup', open: true });
        popup.on('close', function () {
          if (currentPopup === popup) {
            stopBirdAudio();
            currentPopup = null;
            currentPopupBirdId = null;
            postOutward({ type: 'popup', open: false });
          }
        });
        prefetchSpeciesGuide(bird);
        setTimeout(function () { attachPopupActions(popup, bird); }, 0);
      }

      function fmtDist(km) {
        return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km';
      }
      function compactToast() {
        return window.innerWidth <= 400;
      }

      function etaMin(km) {
        return Math.max(1, Math.round(km * 1000 / 81));
      }

      function observationAgeHours(bird) {
        if (!bird || !bird.obsDt) return 999;
        var age = (Date.now() - new Date(bird.obsDt).getTime()) / 3600000;
        return Number.isFinite(age) ? Math.max(0, age) : 999;
      }

      function freshnessBoostKm(bird) {
        if (!bird || bird.virtual) return 0;
        if (bird.source === 'birdweather') return 1.4;
        var age = observationAgeHours(bird);
        if (age <= 12) return 0.45;
        if (age <= 36) return 0.2;
        if (age > 48) return -0.35;
        return 0;
      }

      function computeNearest() {
        return latestMarkers.map(function (bird) {
          return { bird: bird, distance: haversineKm(lastUserLocation, bird) };
        }).filter(function (entry) {
          return entry.distance != null;
        }).sort(function (left, right) {
          return left.distance - right.distance;
        });
      }

      function sortEntries(entries) {
        return entries.sort(function (left, right) {
          if (sortMode === 'recent') {
            return new Date(right.bird.obsDt || 0).getTime() - new Date(left.bird.obsDt || 0).getTime();
          }
          if (sortMode === 'rarity') {
            return Number(Boolean(right.bird.isNotable)) - Number(Boolean(left.bird.isNotable)) || left.distance - right.distance;
          }
          return left.distance - right.distance;
        });
      }

      function sortLabel() {
        return sortMode === 'recent' ? 'New' : sortMode === 'rarity' ? 'Rare' : 'Near';
      }

      function setRouteGeometry(coordinates, bird) {
        var source = map.getSource('track-route');
        if (!source || !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.some(function (coordinate) {
          return !Array.isArray(coordinate) ||
            typeof coordinate[0] !== 'number' || !Number.isFinite(coordinate[0]) ||
            typeof coordinate[1] !== 'number' || !Number.isFinite(coordinate[1]);
        })) return;
        source.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coordinates }
          }]
        });
        var color = bird && bird.isNotable ? '#d99d21' : '#1e63d0';
        if (map.getLayer('track-route-main')) map.setPaintProperty('track-route-main', 'line-color', color);
      }

      function clearDirections() {
        routeSteps = [];
        routeStepIndex = 0;
        routeCurrentIcon.textContent = '➤';
        routeCurrentText.textContent = 'Walking directions';
        routeCurrentDistance.textContent = '';
        routeSummary.textContent = 'Walking route';
        routeStepsElement.innerHTML = '';
        routePanel.classList.remove('on');
      }

      function clearRoute() {
        routeSeq += 1;
        routeDistanceM = null;
        routeGeometryCoordinates = [];
        routeAlongM = 0;
        routeOffRouteM = null;
        routeFallback = false;
        routeInFlight = false;
        clearDirections();
        lastRouteOrigin = null;
        lastRouteTargetKey = null;
        var source = map.getSource('track-route');
        if (source) source.setData({ type: 'FeatureCollection', features: [] });
      }

      function maneuverIcon(maneuver) {
        var type = maneuver && maneuver.type;
        var modifier = maneuver && maneuver.modifier;
        if (type === 'arrive') return '🏁';
        if (type === 'depart') return '➤';
        if (type === 'roundabout' || type === 'rotary') return '⟳';
        if (modifier === 'sharp right') return '⤳';
        if (modifier === 'right') return '↷';
        if (modifier === 'slight right') return '↗';
        if (modifier === 'sharp left') return '⤲';
        if (modifier === 'left') return '↶';
        if (modifier === 'slight left') return '↖';
        if (modifier === 'uturn') return '⤴';
        return '⬆';
      }

      function compassDirection(bearing) {
        if (typeof bearing !== 'number' || !Number.isFinite(bearing)) return null;
        var directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
        var index = Math.round(((bearing % 360) + 360) % 360 / 45) % 8;
        return directions[index];
      }

      function maneuverText(step) {
        var maneuver = step.maneuver || {};
        var type = maneuver.type || 'continue';
        var modifier = maneuver.modifier ? String(maneuver.modifier).replace('-', ' ') : '';
        var name = typeof step.name === 'string' ? step.name : '';
        if (type === 'arrive') return 'Arrive at the bird';
        if (type === 'depart') {
          var direction = compassDirection(maneuver.bearing_after);
          return direction ? 'Head ' + direction + (name ? ' on ' + name : '') : 'Start walking' + (name ? ' on ' + name : '');
        }
        if (type === 'roundabout' || type === 'rotary') return 'Take the roundabout' + (name ? ' onto ' + name : '');
        if (type === 'turn' || type === 'merge' || type === 'ramp' || type === 'fork' || type === 'end of road') {
          return (modifier ? modifier.charAt(0).toUpperCase() + modifier.slice(1) : 'Continue') + (name ? ' onto ' + name : '');
        }
        return (modifier ? 'Continue ' + modifier : 'Continue') + (name ? ' on ' + name : '');
      }

      function updateRouteProgress() {
        if (!routeSteps.length || !lastUserLocation) return;
        var bestIndex = routeSteps.length - 1;
        for (var index = 0; index < routeSteps.length; index += 1) {
          if (
            typeof routeSteps[index]._alongM === 'number' &&
            routeSteps[index]._alongM >= routeAlongM - 12
          ) {
            bestIndex = index;
            break;
          }
        }
        routeStepIndex = Math.max(0, bestIndex);
        var currentStep = routeSteps[routeStepIndex];
        if (currentStep) {
          var approachM = Math.max(0, (currentStep._alongM || 0) - routeAlongM);
          var previousStep = routeSteps[routeStepIndex - 1];
          var currentRoad = previousStep && previousStep.name
            ? previousStep.name
            : currentStep.name || 'the current road';
          var approachText = approachM <= 12
            ? 'Now · '
            : approachM < 80
              ? 'In ' + Math.round(approachM) + ' m · '
              : 'Continue on ' + currentRoad;
          routeCurrentIcon.textContent = maneuverIcon(currentStep.maneuver);
          routeCurrentText.textContent = approachM >= 80
            ? approachText
            : approachText + maneuverText(currentStep);
          routeCurrentDistance.textContent = fmtDist(approachM / 1000);
        }
        routeStepsElement.querySelectorAll('.route-step').forEach(function (element, index) {
          element.classList.toggle('current', index === routeStepIndex);
          element.style.display = index === routeStepIndex ? 'none' : '';
        });
        routeSummary.textContent = routeDistanceM == null
          ? 'Walking route'
          : 'Walk · ' + fmtDist(routeDistanceM / 1000) + ' · ' + etaMin(routeDistanceM / 1000) + ' min';
      }

      function renderRouteSteps(steps) {
        routeSteps = Array.isArray(steps) ? steps.filter(function (step) {
          return step && step.maneuver && Array.isArray(step.maneuver.location);
        }) : [];
        routeSteps.forEach(function (step) {
          var location = step.maneuver.location;
          var projection = projectPointOnRoute(
            { latitude: location[1], longitude: location[0] },
            routeGeometryCoordinates,
          );
          step._alongM = projection ? projection.alongM : 0;
        });
        routeStepIndex = 0;
        if (!routeSteps.length) {
          clearDirections();
          return;
        }
        routeStepsElement.innerHTML = routeSteps.map(function (step, index) {
          var distance = typeof step.distance === 'number' ? fmtDist(step.distance / 1000) : '';
          return '<div class="route-step' + (index === 0 ? ' current' : '') + '" data-step-index="' + index + '">' +
            '<span class="route-step-icon">' + escapeHtml(maneuverIcon(step.maneuver)) + '</span>' +
            '<span>' + escapeHtml(maneuverText(step)) + '</span>' +
            '<span class="route-step-distance">' + escapeHtml(distance) + '</span>' +
            '</div>';
        }).join('');
        routeSummary.textContent = routeDistanceM == null ? 'Walk route' : 'Walk · ' + fmtDist(routeDistanceM / 1000) + ' · ' + etaMin(routeDistanceM / 1000) + ' min';
        routePanel.classList.add('on');
        routePanel.classList.toggle('collapsed', routePanelCollapsed);
        routeCaret.textContent = routePanelCollapsed ? '▸' : '▾';
        if (headingFollow && lastUserLocation) frameUser(lastUserLocation, 250);
        updateRouteProgress();
      }

      function updateTrimmedRoute(bird) {
        if (!lastUserLocation || !bird) return null;
        if (routeGeometryCoordinates.length < 2) {
          routeAlongM = 0;
          routeOffRouteM = null;
          setRouteGeometry([
            [lastUserLocation.longitude, lastUserLocation.latitude],
            [bird.longitude, bird.latitude]
          ], bird);
          routeDistanceM = null;
          return null;
        }
        var projection = projectPointOnRoute(lastUserLocation, routeGeometryCoordinates);
        if (!projection) return null;
        routeAlongM = projection.alongM;
        routeOffRouteM = projection.distanceM;
        var remaining = routeRemainingCoordinates(projection);
        setRouteGeometry(remaining, bird);
        var remainingDistance = 0;
        for (var index = 0; index < remaining.length - 1; index += 1) {
          remainingDistance += haversineM(
            { latitude: remaining[index][1], longitude: remaining[index][0] },
            { latitude: remaining[index + 1][1], longitude: remaining[index + 1][0] },
          ) || 0;
        }
        routeDistanceM = remainingDistance;
        updateRouteProgress();
        return projection;
      }

      function updateRoute() {
        if (!trackId || !lastUserLocation) {
          clearRoute();
          return;
        }
        var bird = latestMarkers.find(function (entry) { return entry.id === trackId; });
        if (!bird ||
          typeof bird.latitude !== 'number' || !Number.isFinite(bird.latitude) ||
          typeof bird.longitude !== 'number' || !Number.isFinite(bird.longitude) ||
          typeof lastUserLocation.latitude !== 'number' || !Number.isFinite(lastUserLocation.latitude) ||
          typeof lastUserLocation.longitude !== 'number' || !Number.isFinite(lastUserLocation.longitude)) {
          clearRoute();
          return;
        }
        var origin = { latitude: lastUserLocation.latitude, longitude: lastUserLocation.longitude };
        var directDistanceM = haversineM(origin, bird);
        if (directDistanceM != null && directDistanceM <= ARRIVE_M) return;
        var targetKey = trackId + ':' + bird.latitude + ':' + bird.longitude;
        var targetChanged = lastRouteTargetKey !== targetKey;
        if (routeInFlight && !targetChanged) return;
        if (targetChanged) {
          routeGeometryCoordinates = [];
          routeSteps = [];
          routeStepIndex = 0;
          routeDistanceM = null;
          routeFallback = true;
          routeFailureAt = 0;
          routeFailureOrigin = null;
          routeFailureTargetKey = null;
          clearDirections();
          setRouteGeometry([
            [origin.longitude, origin.latitude],
            [bird.longitude, bird.latitude]
          ], bird);
        } else if (routeGeometryCoordinates.length >= 2) {
          updateTrimmedRoute(bird);
          if (routeOffRouteM != null && routeOffRouteM <= 35) return;
          routeGeometryCoordinates = [];
          routeFallback = true;
          clearDirections();
        } else if (
          routeFailureAt &&
          routeFailureTargetKey === targetKey &&
          Date.now() - routeFailureAt < routeRetryDelayMs &&
          routeFailureOrigin &&
          haversineM(routeFailureOrigin, origin) < 100
        ) {
          setRouteGeometry([
            [origin.longitude, origin.latitude],
            [bird.longitude, bird.latitude]
          ], bird);
          return;
        }
        routeFallback = true;
        lastRouteTargetKey = targetKey;
        routeInFlight = true;
        setRouteGeometry([
          [origin.longitude, origin.latitude],
          [bird.longitude, bird.latitude]
        ], bird);
        routeDistanceM = null;
        var sequence = ++routeSeq;
        var url = 'https://router.project-osrm.org/route/v1/foot/' +
          origin.longitude + ',' + origin.latitude + ';' + bird.longitude + ',' + bird.latitude +
          '?overview=full&geometries=geojson&steps=true';
        fetch(url)
          .then(function (response) { if (!response.ok) throw new Error('route request failed'); return response.json(); })
          .then(function (route) {
            if (sequence !== routeSeq) return;
            if (!trackId || trackId !== bird.id || route.code !== 'Ok' || !route.routes || !route.routes[0]) {
              routeInFlight = false;
              routeGeometryCoordinates = [];
              routeDistanceM = null;
              routeFailureAt = Date.now();
              routeFailureOrigin = origin;
              routeFailureTargetKey = targetKey;
              clearDirections();
              return;
            }
            var selected = route.routes[0];
            if (!selected.geometry || !Array.isArray(selected.geometry.coordinates)) {
              routeInFlight = false;
              routeGeometryCoordinates = [];
              routeDistanceM = null;
              routeFailureAt = Date.now();
              routeFailureOrigin = origin;
              routeFailureTargetKey = targetKey;
              clearDirections();
              return;
            }
            routeGeometryCoordinates = selected.geometry.coordinates;
            routeFallback = false;
            routeInFlight = false;
            routeFailureAt = 0;
            routeFailureOrigin = null;
            routeFailureTargetKey = null;
            lastRouteOrigin = origin;
            lastRouteTargetKey = targetKey;
            setRouteGeometry(routeGeometryCoordinates, bird);
            var legs = Array.isArray(selected.legs) ? selected.legs : [];
            renderRouteSteps(legs[0] && legs[0].steps);
            updateTrimmedRoute(bird);
            updateTrackCard();
          })
          .catch(function () {
            if (sequence !== routeSeq) return;
            routeInFlight = false;
            routeGeometryCoordinates = [];
            routeDistanceM = null;
            routeFailureAt = Date.now();
            routeFailureOrigin = origin;
            routeFailureTargetKey = targetKey;
            clearDirections();
          });
      }

      function capture(id) {
        postOutward({ type: 'capture', id: id });
      }

      function refreshNearby() {
        if (!lastUserLocation) {
          nearbyTitle.textContent = 'Birds nearby';
          nearbyList.innerHTML = '<div class="nb-empty">Finding your location…</div>';
          setToast(false);
          snapToastAction = null;
          return;
        }
        if (birdsLoading) {
          nearbyTitle.textContent = 'Birds nearby';
          nearbyList.innerHTML = '<div class="nb-empty">Looking for birds nearby…</div>';
          setToast(false);
          snapToastAction = null;
          return;
        }
        var nearest = computeNearest();
        var displayEntries = sortEntries(nearest.slice());
        var filtered = rareOnly ? displayEntries.filter(function (entry) { return entry.bird.isNotable; }) : displayEntries;
        lastNearbyCount = filtered.length;
        nearbyTitle.textContent = nearbyTitleText(lastNearbyCount);
        sortToggle.textContent = sortLabel();
        sortToggle.classList.toggle('on', sortMode !== 'nearest');
        if (!filtered.length) {
          nearbyList.innerHTML = '<div class="nb-empty">' + (rareOnly ? 'No rare birds nearby right now.' : 'No birds nearby right now.') + '</div>';
        } else {
          nearbyList.innerHTML = filtered.slice(0, 14).map(function (entry) {
            var bird = entry.bird;
            var name = bird.comName || bird.sciName || 'Bird';
            var rareClass = (bird.isNotable ? ' rare' : '') + (bird.virtual ? ' virtual' : '') + (bird.prismatic ? ' prismatic' : '');
            return '<div class="nb-row' + rareClass + '" data-bird-id="' + escapeHtml(bird.id) + '">' +
              '<div class="nb-thumb">' + thumbInnerHtml(bird) + '</div>' +
              '<div class="nb-info"><div class="nb-name">' + escapeHtml(name) + (bird.isNotable ? ' <span class="star">★</span>' : '') + '</div>' +
              '<div class="nb-sub">' + fmtDist(entry.distance) + ' away · ' + etaMin(entry.distance) + ' min walk · ' + (bird.virtual ? (bird.prismatic ? 'Prismatic Skyfriend' : 'Skyfriend') : (bird.source === 'birdweather' ? 'heard ' : 'seen ') + escapeHtml(bird.relativeTime || 'recently')) + (bird.captureCount ? ' · collected ×' + bird.captureCount : '') + '</div></div>' +
              '<button class="nb-go' + rareClass + '" type="button" data-go-id="' + escapeHtml(bird.id) + '">Go</button>' +
              '</div>';
          }).join('');
        }
        if (trackId) {
          setToast(false);
          snapToastAction = null;
        } else {
          var closest = nearest[0];
          if (closest && closest.distance * 1000 <= SNAP_M) {
            var closestName = closest.bird.comName || closest.bird.sciName || 'Bird';
            var closestLabel = (closest.bird.virtual ? closest.bird.prismatic ? '✦ Skyfriend ' : 'Skyfriend ' : '') + closestName;
            snapToastCopy.textContent = closestLabel + ' · ' + fmtDist(closest.distance);
            snapToastGo.textContent = closest.bird.virtual ? 'Collect' : 'Snap';
            setToast(true);
            snapToastAction = function () { capture(closest.bird.id); };
          } else if (closest && closest.distance * 1000 <= 180) {
            var nearbyName = closest.bird.comName || closest.bird.sciName || 'Bird';
            snapToastCopy.textContent = (closest.bird.virtual ? closest.bird.prismatic ? '✦ Skyfriend ' : 'Skyfriend ' : '') + nearbyName + ' · ' + fmtDist(closest.distance);
            snapToastGo.textContent = 'Go';
            setToast(true);
            snapToastAction = function () { startTrack(closest.bird); };
          } else {
            setToast(false);
            snapToastAction = null;
          }
        }
      }

      function nearbyTitleText(count) {
        return 'Birds nearby';
      }


      function habitatSearchCopy(bird) {
        var name = String((bird.comName || '') + ' ' + (bird.sciName || '')).toLowerCase();
        var prefix = bird.source === 'birdweather' ? 'At the audio station' : 'At the report area';
        var clue = 'listen first, then scan nearby cover and open sky';
        if (/\\b(?:gull|tern|sandpiper|plover|dunlin|willet|godwit|dowitcher|curlew|stilt|avocet|oystercatcher|turnstone)\\b/.test(name)) clue = 'scan water edges, mudflats, and birds flying along the shore';
        else if (/\\b(?:duck|goose|swan|grebe|loon|coot|gallinule|teal|mallard|merganser|scaup|bufflehead|canvasback|wigeon|pintail|shoveler)\\b/.test(name)) clue = 'scan open water, shoreline edges, and distant floating birds';
        else if (/\\b(?:heron|egret|bittern|ibis|spoonbill|crane|rail)\\b/.test(name)) clue = 'move quietly and scan shallow water, reeds, and marsh edges';
        else if (/\\bowl(?:s|et|ets)?\\b/.test(name)) clue = 'scan dense cover, cavities, and shaded roosts without flushing birds';
        else if (/goshawk|sparrowhawk|\\b(?:hawk|eagle|falcon|kestrel|osprey|harrier|kite|vulture|accipiter|buteo)\\b/.test(name)) clue = 'scan the sky, treetops, poles, and other exposed perches';
        else if (/\\b(?:woodpecker|flicker|sapsucker)\\b/.test(name)) clue = 'scan trunks and dead branches; listen for tapping or sharp calls';
        else if (/\\bhummingbird\\b/.test(name)) clue = 'check flowers, feeders, and tiny exposed perches';
        else if (/\\b(?:sparrow|warbler|wren|thrush|vireo|kinglet|nuthatch|chickadee|titmouse|robin|cardinal|jay|crow|blackbird|oriole|tanager|grosbeak|mockingbird|catbird|thrasher)\\b/.test(name) || /finch/.test(name)) clue = 'listen first, then scan shrubs, canopy edges, and repeated movement';
        return prefix + ' — ' + clue;
      }

      function updateTrackCard() {
        if (!trackId) return;
        var entry = latestMarkers.find(function (bird) { return bird.id === trackId; });
        if (!entry) {
          stopTrack();
          return;
        }
        var name = entry.comName || entry.sciName || 'Bird';
        trackThumb.innerHTML = thumbInnerHtml(entry);
        trackName.innerHTML = escapeHtml(name) + (entry.isNotable ? ' <span class="star">★</span>' : '');
        trackCard.classList.toggle('rare', Boolean(entry.isNotable));
        trackArrow.classList.toggle('rare', Boolean(entry.isNotable));
        var distance = haversineKm(lastUserLocation, entry);
        var snapInRange = distance != null && distance * 1000 <= SNAP_M;
        trackSnap.disabled = entry.virtual && !snapInRange;
        var trackActionLabel = entry.virtual ? (snapInRange ? 'Collect' : 'Too far') : (snapInRange ? 'Snap' : 'Log');
        if (distance != null && distance * 1000 <= ARRIVE_M) {
          if (routeSteps.length || routeGeometryCoordinates.length) clearRoute();
          trackSnap.classList.add('ready');
          trackSnap.textContent = entry.virtual ? 'Collect!' : 'Snap!';
          trackDist.textContent = entry.virtual ? 'You’re here! Collect it' : habitatSearchCopy(entry);
        } else if (distance != null && routeDistanceM != null && lastRouteTargetKey && lastRouteTargetKey.indexOf(trackId + ':') === 0) {
          trackSnap.classList.remove('ready');
          trackSnap.textContent = trackActionLabel;
          trackDist.textContent = 'Walk · ' + fmtDist(routeDistanceM / 1000) + ' · ' + etaMin(routeDistanceM / 1000) + ' min';
        } else if (distance != null) {
          trackSnap.classList.remove('ready');
          trackSnap.textContent = trackActionLabel;
          trackDist.textContent = 'Direct · ' + fmtDist(distance);
        } else {
          trackSnap.classList.remove('ready');
          trackSnap.textContent = entry.virtual ? 'Collect' : 'Snap';
          trackDist.textContent = 'Finding distance…';
        }
        updateRouteProgress();
      }

      function updateTrackArrow() {
        if (!trackId || !lastUserLocation) return;
        var bird = latestMarkers.find(function (entry) { return entry.id === trackId; });
        if (!bird) return;
        var screenAngle = (geographicBearing(lastUserLocation, bird) - map.getBearing() + 360) % 360;
        trackArrow.style.transform = 'rotate(' + screenAngle + 'deg)';
      }

      function startTrack(bird) {
        if (currentPopup) currentPopup.remove();
        trackId = bird.id;
        renderBirdMarkers(latestMarkers);
        postOutward({ type: 'tracking', open: true, id: bird.id, name: bird.comName || bird.name || 'Bird', speciesCode: bird.speciesCode, latitude: bird.latitude, longitude: bird.longitude });
        follow = true;
        clearRoute();
        setToast(false);
        trackHud.classList.add('on');
        trackCard.classList.add('on');
        nearbyPanel.classList.add('collapsed');
        nearbyPanel.classList.add('tracking');
        nearbyCaret.textContent = '▸';
        setNearbyState('peek');
        if (lastUserLocation && !headingFollow) {
          programmatic = true;
          markProgrammaticCameraMove();
          map.easeTo({
            center: [lastUserLocation.longitude, lastUserLocation.latitude],
            pitch: 60,
            zoom: 17.3,
            duration: 600
          });
          setTimeout(function () { programmatic = false; }, 700);
        }
        updateTrackCard();
        updateTrackArrow();
        updateRoute();
      }

      function stopTrack() {
        trackId = null;
        postOutward({ type: 'tracking', open: false });
        clearRoute();
        trackHud.classList.remove('on');
        trackCard.classList.remove('on');
        nearbyPanel.classList.remove('tracking');
        updateAttributionVisibility();
        refreshUi();
        if (headingFollow && lastUserLocation) frameUser(lastUserLocation, 250);
      }

      function scheduleArrow() {
        if (arrowFrame != null) return;
        arrowFrame = requestAnimationFrame(function () {
          arrowFrame = null;
          updateTrackArrow();
        });
      }

      function refreshUi() {
        refreshBirdMarkerIcons();
        refreshNearby();
        if (trackId) updateTrackCard();
        updateTrackArrow();
      }

      nearbyList.addEventListener('click', function (event) {
        var target = event.target;
        var go = target.closest ? target.closest('[data-go-id]') : null;
        var row = target.closest ? target.closest('[data-bird-id]') : null;
        var id = go ? go.getAttribute('data-go-id') : row && row.getAttribute('data-bird-id');
        var bird = latestMarkers.find(function (entry) { return String(entry.id) === String(id); });
        if (!bird) return;
        if (go) {
          event.stopPropagation();
          startTrack(bird);
          return;
        }
        follow = false;
        markProgrammaticCameraMove();
        map.flyTo({ center: [bird.longitude, bird.latitude], zoom: Math.max(map.getZoom(), 17), duration: 900 });
        map.once('moveend', function () { openBirdPopup(bird); });
      });
      nearbyHeader.addEventListener('click', function (event) {
        if (event.target === rareToggle || (event.target.closest && event.target.closest('#rare-toggle'))
          || event.target === sortToggle || (event.target.closest && event.target.closest('#sort-toggle'))) return;
        setNearbyState(panelState === 'peek' ? 'half' : 'peek');
      });
      function updateAttributionVisibility() {
        attribution.classList.toggle('hidden', panelState === 'half' || nearbyPanel.classList.contains('tracking'));
      }

      function setNearbyState(state) {
        state = state === 'half' ? 'half' : 'peek';
        panelState = state;
        nearbyPanel.classList.remove('peek', 'half', 'collapsed');
        nearbyPanel.classList.add(state);
        if (state === 'peek') nearbyPanel.classList.add('collapsed');
        nearbyCaret.textContent = state === 'peek' ? '▸' : '⌄';
        nearbyTitle.textContent = nearbyTitleText(lastNearbyCount);
        updateAttributionVisibility();
        scheduleNearbyGeometry();
        if (headingFollow) animateFirstPersonPadding(220);
      }
      var dragStartY = null;
      nearbyHandle.addEventListener('pointerdown', function (event) {
        dragStartY = event.clientY;
        nearbyHandle.setPointerCapture(event.pointerId);
        nearbyPanel.style.transition = 'none';
        event.preventDefault();
        event.stopPropagation();
      });
      nearbyHandle.addEventListener('pointermove', function (event) {
        if (dragStartY == null) return;
        var delta = Math.max(-180, Math.min(180, event.clientY - dragStartY));
        nearbyPanel.style.transform = 'translateY(' + delta + 'px)';
        event.preventDefault();
        event.stopPropagation();
      });
      nearbyHandle.addEventListener('pointerup', function (event) {
        if (dragStartY == null) return;
        var delta = event.clientY - dragStartY;
        dragStartY = null;
        nearbyPanel.style.transition = '';
        nearbyPanel.style.transform = '';
        if (delta < -35) setNearbyState('half');
        else if (delta > 35) setNearbyState('peek');
        else setNearbyState(panelState === 'peek' ? 'half' : 'peek');
        scheduleNearbyGeometry();
        event.preventDefault();
        event.stopPropagation();
      });
      nearbyHandle.addEventListener('pointercancel', function (event) {
        dragStartY = null;
        nearbyPanel.style.transition = '';
        nearbyPanel.style.transform = '';
        event.preventDefault();
        event.stopPropagation();
      });
      rareToggle.addEventListener('click', function (event) {
        event.stopPropagation();
        rareOnly = !rareOnly;
        rareToggle.classList.toggle('on', rareOnly);
        refreshNearby();
      });
      sortToggle.addEventListener('click', function (event) {
        event.stopPropagation();
        sortMode = sortMode === 'nearest' ? 'recent' : sortMode === 'recent' ? 'rarity' : 'nearest';
        refreshNearby();
      });
      trackSnap.addEventListener('click', function () {
        if (trackId && !trackSnap.disabled) capture(trackId);
      });
      trackStop.addEventListener('click', stopTrack);
      routeHeader.addEventListener('click', function () {
        routePanelCollapsed = !routePanelCollapsed;
        routePanel.classList.toggle('collapsed', routePanelCollapsed);
        routeCaret.textContent = routePanelCollapsed ? '▸' : '▾';
        if (headingFollow && lastUserLocation) frameUser(lastUserLocation, 250);
      });
      snapToastGo.addEventListener('click', function () {
        if (snapToastAction) snapToastAction();
      });
      snapToastDismiss.addEventListener('click', function () {
        setToast(false);
        snapToastAction = null;
      });

${speciesAudioScript()}
      function popupHtml(bird, userLocation) {
        var distance = haversineKm(userLocation, bird);
        var count = typeof bird.howMany === 'number' && bird.howMany > 0 ? ' • ×' + bird.howMany : '';
        var virtual = Boolean(bird.virtual);
        var frequencyCopy = !virtual && bird.source !== 'birdweather' && typeof bird.reportCount === 'number' && bird.reportCount > 0 ? 'Reported at ' + bird.reportCount + ' location' + (bird.reportCount === 1 ? '' : 's') + ' recently' : '';
        var statusCopy = virtual ? (bird.prismatic ? 'Prismatic virtual encounter' : 'Virtual learning encounter') : bird.source === 'birdweather' ? 'Live acoustic detection · ' + escapeHtml(bird.relativeTime || 'recently') : 'Past sighting · ' + escapeHtml(bird.relativeTime || 'recently');
        var captureCopy = virtual
          ? distance != null && distance > 0.06
            ? 'A habitat-plausible Skyfriend. Move within 60m to collect it for your virtual field guide — it never counts as a real bird.'
            : 'Close enough! Collecting this Skyfriend builds your virtual field guide — it never counts as a real bird.'
          : bird.captureCount
            ? 'Already collected ×' + bird.captureCount + ' — recaptures still earn XP.'
            : bird.source === 'birdweather'
              ? 'Heard recently by a nearby audio station — the bird may be anywhere within earshot, so use this as a fresh search clue.'
              : 'Not collected yet — capture it to add it to your Bird-dex.';
        var actionLabel = virtual ? 'Collect' : bird.captureCount ? 'Recapture' : 'Capture';
        var popupImage = getBirdImage(bird);
        var photoCopy = typeof popupImage === 'string' && popupImage ? '<img class="encounter-photo" loading="lazy" referrerpolicy="no-referrer" src="' + escapeHtml(popupImage) + '" alt="" />' : '';
        return '<div class="encounter">' +
          '<div class="encounter-head">' + photoCopy + '<div class="encounter-title"><h3>' + escapeHtml(bird.comName || 'Bird') + (virtual ? '<span class="skyfriend-tag">' + (bird.prismatic ? 'Prismatic Skyfriend' : 'Skyfriend') + '</span>' : '') + '</h3>' +
          '<div class="scientific">' + escapeHtml(bird.sciName || '') + '</div></div></div>' +
          '<div class="stale">' + statusCopy + '</div>' +
          '<div class="where">' + escapeHtml(virtual ? 'Could occur in this habitat' : bird.locName || 'No hotspot recorded') + count + '</div>' +
          (distance == null ? '' : '<div class="distance">' + fmtDist(distance) + ' away · ' + etaMin(distance) + ' min walk</div>') +
          (frequencyCopy ? '<div class="distance">' + frequencyCopy + '</div>' : '') +
          '<div class="distance" data-capture-copy>' + captureCopy + '</div>' +
          '<div class="field-notes" data-info>How to spot it: Field notes loading…</div>' +
          '<div class="audio-credit" data-audio-credit></div>' +
          '<div class="actions"><button data-action="capture">' + actionLabel + '</button><button data-action="directions">Directions</button><button data-action="listen">Listen</button><button data-action="about">Guide</button></div>' +
          '</div>';
      }

      function attachPopupActions(popup, bird) {
        var element = popup.getElement();
        if (!element) return;
        element.querySelector('[data-action="capture"]').addEventListener('click', function () {
          stopBirdAudio();
          postOutward({ type: 'capture', id: bird.id });
          if (bird.virtual) popup.remove();
        });
        element.querySelector('[data-action="directions"]').addEventListener('click', function () {
          postOutward({ type: 'directions', id: bird.id, latitude: bird.latitude, longitude: bird.longitude, name: bird.comName });
        });
        element.querySelector('[data-action="about"]').addEventListener('click', function () {
          stopBirdAudio();
          postOutward({ type: 'about', speciesCode: bird.speciesCode, comName: bird.comName, sciName: bird.sciName });
        });
        var listenButton = element.querySelector('[data-action="listen"]');
        if (listenButton && currentAudio && currentAudioKey === bird.id) {
          listenButton.textContent = currentAudio.paused ? 'Listen' : 'Pause';
          var activeCredit = element.querySelector('[data-audio-credit]');
          if (activeCredit && currentAudioAttribution) {
            activeCredit.textContent = currentAudioAttribution;
            activeCredit.classList.add('on');
          }
        }
        listenButton.addEventListener('click', function () {
          toggleBirdAudio(bird, this, element);
        });
        fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(bird.comName || 'Bird'))
          .then(function (response) { if (!response.ok) throw new Error('Wikipedia unavailable'); return response.json(); })
          .then(function (summary) {
            var head = element.querySelector('.encounter-head');
            var image = summary.thumbnail && summary.thumbnail.source;
            if (head && image && !head.querySelector('.encounter-photo')) {
              var photo = document.createElement('img');
              photo.className = 'encounter-photo';
              photo.alt = '';
              photo.loading = 'lazy';
              photo.referrerPolicy = 'no-referrer';
              photo.src = image;
              head.insertBefore(photo, head.firstChild);
            }
            var info = element.querySelector('[data-info]');
            if (info) {
              var extract = typeof summary.extract === 'string' ? summary.extract.trim() : '';
              info.textContent = extract
                ? 'How to spot it: ' + extract.slice(0, 240) + (extract.length > 240 ? '…' : '')
                : 'How to spot it: No field notes available.';
            }
          })
          .catch(function () {
            var info = element.querySelector('[data-info]');
            if (info) info.textContent = 'How to spot it: No field notes available.';
          });
      }

      function styleAdventureMap() {
        if (!map.getSource('presence-radius')) {
          map.addSource('presence-radius', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });
        }
        if (!map.getLayer('presence-radius-fill')) {
          map.addLayer({
            id: 'presence-radius-fill',
            type: 'fill',
            source: 'presence-radius',
            paint: {
              'fill-color': '#f2cf5b',
              'fill-opacity': 0.12
            }
          });
        }
        if (!map.getLayer('presence-radius-line')) {
          map.addLayer({
            id: 'presence-radius-line',
            type: 'line',
            source: 'presence-radius',
            paint: {
              'line-color': '#f6d66d',
              'line-width': 2,
              'line-opacity': 0.52,
              'line-dasharray': [2, 2]
            }
          });
        }
        updatePresenceRadius();
        if (!map.getSource('track-route')) {
          map.addSource('track-route', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });
        }
        if (!map.getLayer('track-route-casing')) {
          map.addLayer({
            id: 'track-route-casing',
            type: 'line',
            source: 'track-route',
            paint: {
              'line-color': '#ffffff',
              'line-width': 9,
              'line-opacity': 0.9
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
          });
        }
        if (!map.getLayer('track-route-main')) {
          map.addLayer({
            id: 'track-route-main',
            type: 'line',
            source: 'track-route',
            paint: {
              'line-color': '#1e63d0',
              'line-width': 5,
              'line-opacity': 1,
              'line-dasharray': [1.5, 1.1]
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
          });
        }
        map.resize();
      }

      map.on('load', function () {
        styleAdventureMap();
        scheduleNearbyGeometry();
        setTimeout(scheduleNearbyGeometry, 100);
        setTimeout(function () {
          var zoomGroup = document.querySelector('.maplibregl-ctrl-top-right');
          if (zoomGroup && typeof MutationObserver !== 'undefined') {
            new MutationObserver(function () {
              if (snapToast.classList.contains('on')) scheduleNearbyGeometry();
            }).observe(zoomGroup, { childList: true, subtree: true });
          }
          scheduleNearbyGeometry();
        }, 250);
        document.addEventListener('click', function (event) {
          var target = event.target;
          if (
            snapToast.classList.contains('on') &&
            target &&
            target.closest &&
            target.closest('.maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out')
          ) {
            programmaticCameraMove = true;
          }
        }, true);
        if (headingFollow && lastUserLocation && !map.isMoving() && map.getZoom() < 16.8) {
          programmatic = true;
          frameUser(lastUserLocation, 350);
          setTimeout(function () { programmatic = false; }, 450);
        }
        updateRoute();
      });
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(function () { map.resize(); }).observe(document.getElementById('map'));
        new ResizeObserver(function () { scheduleNearbyGeometry(); }).observe(nearbyPanel);
      }
      map.on('dragstart', function (event) { if (event && event.originalEvent) { userGesture = true; follow = false; reportFollowPaused(true); } });
      map.on('zoomstart', function (event) { if (!programmatic && event && event.originalEvent) { userGesture = true; follow = false; reportFollowPaused(true); } });
      map.on('rotatestart', function (event) { if (!programmatic && event && event.originalEvent) { userGesture = true; follow = false; reportFollowPaused(true); } });
      map.on('pitchstart', function (event) { if (!programmatic && event && event.originalEvent) { userGesture = true; follow = false; reportFollowPaused(true); } });
      map.on('move', scheduleArrow);
      map.on('rotate', scheduleArrow);
      map.on('pitch', scheduleArrow);


      function hashString(input) {
        var hash = 5381;
        for (var index = 0; index < input.length; index += 1) {
          hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
        }
        return String(hash);
      }

      function markerDataSignature(markers) {
        if (markers === lastMarkerInput) return lastMarkerInputSignature;
        lastMarkerInput = markers;
        lastMarkerInputSignature = hashString(JSON.stringify(markers || []));
        return lastMarkerInputSignature;
      }

      function renderBirdMarkers(markers) {
        var zoom = map.getZoom();
        var minSpacing = zoom >= 15 ? 30 : zoom >= 13 ? 48 : 64;
        var maxMarkers = zoom >= 15 ? 64 : zoom >= 13 ? 32 : 20;
        var viewportWidth = map.getContainer().clientWidth || 0;
        var viewportHeight = map.getContainer().clientHeight || 0;
        var centerLng = map.getCenter().lng;
        function wrappedLongitude(longitude) {
          return (((longitude - centerLng) + 540) % 360 - 180) + centerLng;
        }
        function markerScore(bird) {
          var distance = lastUserLocation ? haversineKm(lastUserLocation, bird) : null;
          return (distance == null ? 999 : distance) - freshnessBoostKm(bird) - (bird.isNotable ? 0.2 : 0) - (bird.captureCount ? 0.1 : 0);
        }
        var sorted = (markers || []).slice().sort(function (left, right) {
          var leftTracked = trackId && String(left.id) === String(trackId) ? 0 : 1;
          var rightTracked = trackId && String(right.id) === String(trackId) ? 0 : 1;
          if (leftTracked !== rightTracked) return leftTracked - rightTracked;
          var leftRange = lastUserLocation && haversineKm(lastUserLocation, left) != null && haversineKm(lastUserLocation, left) <= 0.06 ? 0 : 1;
          var rightRange = lastUserLocation && haversineKm(lastUserLocation, right) != null && haversineKm(lastUserLocation, right) <= 0.06 ? 0 : 1;
          if (leftRange !== rightRange) return leftRange - rightRange;
          return markerScore(left) - markerScore(right);
        });
        var edgeMargin = 30;
        var candidates = sorted.map(function (bird) {
          var isTracked = trackId && String(bird.id) === String(trackId);
          var displayLng = wrappedLongitude(bird.longitude);
          var point = map.project([displayLng, bird.latitude]);
          var centerVisible = point.x >= 0 && point.x <= viewportWidth && point.y >= 0 && point.y <= viewportHeight;
          var partiallyVisible = point.x >= -edgeMargin && point.x <= viewportWidth + edgeMargin
            && point.y >= -edgeMargin && point.y <= viewportHeight + edgeMargin;
          return { bird: bird, point: point, isTracked: isTracked, centerVisible: centerVisible, partiallyVisible: partiallyVisible };
        });
        var ordered = candidates.filter(function (entry) { return entry.isTracked || entry.centerVisible; })
          .concat(candidates.filter(function (entry) { return !entry.isTracked && !entry.centerVisible && entry.partiallyVisible; }));
        var chosen = [];
        var chosenPoints = [];
        for (var index = 0; index < ordered.length && chosen.length < maxMarkers; index += 1) {
          var entry = ordered[index];
          if (!entry.partiallyVisible && !entry.isTracked) continue;
          var crowded = false;
          if (!entry.isTracked) {
            for (var pointIndex = 0; pointIndex < chosenPoints.length; pointIndex += 1) {
              var dx = entry.point.x - chosenPoints[pointIndex].x;
              var dy = entry.point.y - chosenPoints[pointIndex].y;
              if (Math.sqrt(dx * dx + dy * dy) < minSpacing) {
                crowded = true;
                break;
              }
            }
          }
          if (crowded) continue;
          chosen.push(entry.bird);
          chosenPoints.push(entry.point);
        }
        var visualStates = chosen.map(function (bird) {
          var distance = lastUserLocation ? haversineKm(lastUserLocation, bird) : null;
          return {
            inRange: distance != null && distance <= 0.06,
            presenceClass: distance == null ? 'presence-mid' : distance <= 0.06 ? 'presence-close' : distance <= 0.12 ? 'presence-near' : distance <= 0.25 ? 'presence-mid' : 'presence-far'
          };
        });
        var signature = String(trackId || '') + '|' + markerDataSignature(markers) + '|' + JSON.stringify(chosen.map(function (bird, chosenIndex) {
          return [bird.id, visualStates[chosenIndex].presenceClass, visualStates[chosenIndex].inRange ? 1 : 0];
        }));
        if (signature === lastMarkerRenderSignature) return;
        lastMarkerRenderSignature = signature;
        birdMarkers.forEach(function (marker) { marker.remove(); });
        birdMarkers = [];
        chosen.forEach(function (bird, chosenIndex) {
          var element = document.createElement('div');
          element.className = 'bird-marker ' + visualStates[chosenIndex].presenceClass + (bird.virtual ? ' virtual' : '') + (bird.source === 'birdweather' ? ' audio' : '') + (bird.isNotable ? ' notable' : '') + (visualStates[chosenIndex].inRange ? ' in-range' : '') + (bird.captureCount ? ' captured' : '') + (bird.prismatic ? ' prismatic' : '');
          element.innerHTML = markerInnerHtml(bird);
          var marker = new maplibregl.Marker({ element: element })
            .setLngLat([wrappedLongitude(bird.longitude), bird.latitude])
            .addTo(map);
          element.style.pointerEvents = 'auto';
          element.onclick = function (event) {
            event.stopPropagation();
            openBirdPopup(bird);
          };
          marker._birdgoBird = bird;
          birdMarkers.push(marker);
        });
      }

      function applyAtmosphere(weather) {
        var hour = new Date().getHours();
        var hasApiDaylight = weather && typeof weather.isDay === 'boolean';
        var isDay = hasApiDaylight ? weather.isDay : hour >= 6 && hour < 20;
        var period = hasApiDaylight
          ? isDay ? (hour < 8 ? 'dawn' : hour >= 17 ? 'dusk' : 'day') : 'night'
          : !isDay || hour < 6 || hour >= 21 ? 'night' : hour < 8 ? 'dawn' : hour >= 17 ? 'dusk' : 'day';
        document.body.dataset.period = period;
        document.body.dataset.weather = weather && weather.condition ? weather.condition : 'clear';
      }

      function render(data) {
        if (!data || !data.center) return;
        applySafeArea(data.safeArea);
        applyAtmosphere(data.weather);
        var previousLocation = lastUserLocation;
        if (data.userLocation) {
          lastUserLocation = data.userLocation;
          if (previousLocation && haversineKm(previousLocation, data.userLocation) > 0.003 && typeof data.heading !== 'number') {
            updateBearing(geographicBearing(previousLocation, data.userLocation));
          }
          if (data.heading != null) updateBearing(data.heading);
        }
        if (Array.isArray(data.markers)) latestMarkers = data.markers;
        birdsLoading = Boolean(data.loading);
        refreshNearby();
        if (firstData) {
          var initialTarget = data.userLocation || data.center;
          markProgrammaticCameraMove();
          map.setCenter([initialTarget.longitude, initialTarget.latitude]);
          if (data.firstPerson) {
            headingFollow = true;
            programmatic = true;
            frameUser(initialTarget, 700);
            setTimeout(function () { programmatic = false; }, 800);
            enableOrientation();
          } else {
            markProgrammaticCameraMove();
            map.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 }, pitch: 0, zoom: 15.5, bearing: 0, duration: 500 });
          }
          firstData = false;
        }
        if (data.command === 'recenter') {
          follow = true;
          userGesture = false;
          reportFollowPaused(false);
          programmatic = true;
          markProgrammaticCameraMove();
          var target = lastUserLocation || data.userLocation || data.center;
          map.stop();
          if (data.firstPerson || headingFollow) {
            headingFollow = true;
            frameUser(target, 0);
            if (typeof data.heading === 'number') updateBearing(data.heading);
            enableOrientation();
          } else {
            map.easeTo({ center: [target.longitude, target.latitude], padding: { top: 0, right: 0, bottom: 0, left: 0 }, duration: 0, pitch: 0, zoom: Math.max(map.getZoom(), 15.5), bearing: 0 });
          }
          programmatic = true;
          setTimeout(function () { programmatic = false; }, 600);
        } else if (data.command === 'setView') {
          userGesture = false;
          reportFollowPaused(false);
          headingFollow = Boolean(data.firstPerson);
          programmatic = true;
          if (headingFollow) {
            frameUser(data.userLocation || lastUserLocation || data.center, 700);
            if (typeof data.heading === 'number') updateBearing(data.heading);
            enableOrientation();
          } else {
            compassButton.style.display = 'none';
            markProgrammaticCameraMove();
            map.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 }, pitch: 0, zoom: 15.5, bearing: 0, duration: 700 });
          }
          setTimeout(function () { programmatic = false; }, 800);
        } else if (data.command === 'overview') {
          follow = false;
          userGesture = false;
          headingFollow = false;
          var overviewTarget = data.userLocation || data.center;
          var overviewBirds = computeNearest().slice(0, 25);
          var bounds = new maplibregl.LngLatBounds();
          if (overviewBirds.length) {
            if (overviewTarget) bounds.extend([overviewTarget.longitude, overviewTarget.latitude]);
            overviewBirds.forEach(function (entry) {
              bounds.extend([entry.bird.longitude, entry.bird.latitude]);
            });
            markProgrammaticCameraMove();
            map.fitBounds(bounds, {
              padding: { top: 90, bottom: 200, left: 40, right: 40 },
              pitch: 0,
              bearing: 0,
              maxZoom: 16.5,
              duration: 700
            });
          } else if (overviewTarget) {
            markProgrammaticCameraMove();
            map.easeTo({ center: [overviewTarget.longitude, overviewTarget.latitude], padding: { top: 0, right: 0, bottom: 0, left: 0 }, pitch: 0, zoom: 14, bearing: 0, duration: 700 });
          }
        } else if (data.command === 'nearest') {
          var closestEntry = computeNearest()[0];
          if (closestEntry) {
            openBirdPopup(closestEntry.bird);
            startTrack(closestEntry.bird);
          }
        } else if (data.command === 'stopTrack') {
          stopTrack();
        } else if (data.command === 'closePopup') {
          if (currentPopup) currentPopup.remove();
        } else if (data.command === 'track' && data.trackTarget) {
          var exactBird = data.trackTarget.id ? latestMarkers.find(function (bird) { return String(bird.id) === String(data.trackTarget.id); }) : null;
          var targetBird = exactBird ? { bird: exactBird } : latestMarkers.reduce(function (closest, bird) {
            var candidateDistance = haversineKm(data.trackTarget, bird);
            if (!closest || candidateDistance < closest.distance) return { bird: bird, distance: candidateDistance };
            return closest;
          }, null);
          if (targetBird && targetBird.bird) startTrack(targetBird.bird);
        } else if (headingFollow && data.firstPerson && !userGesture) {
          follow = true;
        }
        if (data.userLocation && follow && !programmatic && (!previousLocation || haversineKm(previousLocation, data.userLocation) > 0.003)) {
          var followCamera = {
            center: [data.userLocation.longitude, data.userLocation.latitude],
            duration: 0
          };
          if (headingFollow) {
            map.setPadding(firstPersonPadding());
            if (typeof currentHeading === 'number') followCamera.bearing = currentHeading;
            markProgrammaticCameraMove();
            map.jumpTo(followCamera);
          } else {
            markProgrammaticCameraMove();
            map.easeTo(followCamera);
          }
        }
        if (trackId) updateRoute();
        renderBirdMarkers(latestMarkers);
        if (data.userLocation) {
          if (!userElement) {
            userElement = document.createElement('div');
            userElement.className = 'user-marker';
            userElement.style.zIndex = '30';
            userElement.style.pointerEvents = 'none';
            userElement.innerHTML = personGlyph(data.trainer);
            userMarker = new maplibregl.Marker({ element: userElement })
              .setLngLat([data.userLocation.longitude, data.userLocation.latitude])
              .addTo(map);
          } else {
            userMarker.setLngLat([data.userLocation.longitude, data.userLocation.latitude]);
          }
          var trainerGlyph = personGlyph(data.trainer);
          if (userElement.innerHTML !== trainerGlyph) userElement.innerHTML = trainerGlyph;
          if (data.trainer && data.trainer.avatarColor) userElement.style.background = data.trainer.avatarColor;
        }
        if (currentPopup && currentPopupBirdId) {
          var freshPopupBird = latestMarkers.find(function (entry) { return String(entry.id) === String(currentPopupBirdId); });
          var popupElement = currentPopup.getElement && currentPopup.getElement();
          var captureCopy = popupElement && popupElement.querySelector('[data-capture-copy]');
          if (freshPopupBird && captureCopy) {
            if (freshPopupBird.virtual) {
              var freshDistance = haversineKm(lastUserLocation, freshPopupBird);
              captureCopy.textContent = freshDistance != null && freshDistance > 0.06
                ? 'A habitat-plausible Skyfriend. Move within 60m to collect it for your virtual field guide — it never counts as a real bird.'
                : 'Close enough! Collecting this Skyfriend builds your virtual field guide — it never counts as a real bird.';
            } else {
              captureCopy.textContent = freshPopupBird.captureCount
                ? 'Already collected ×' + freshPopupBird.captureCount + ' — recaptures still earn XP.'
                : 'Not collected yet — capture it to add it to your Bird-dex.';
            }
            var captureButton = popupElement.querySelector('[data-action="capture"]');
            if (captureButton) captureButton.textContent = freshPopupBird.virtual ? 'Collect' : freshPopupBird.captureCount ? 'Recapture' : 'Capture';
          }
        }
        refreshUi();
        updatePresenceRadius();
        if (headingFollow && lastUserLocation) map.setPadding(firstPersonPadding());
      }

      map.on('moveend', function () {
        if (latestMarkers.length) renderBirdMarkers(latestMarkers);
        if (!userGesture || programmaticCameraMove || programmatic) {
          programmaticCameraMove = false;
          clearTimeout(moveTimer);
          return;
        }
        clearTimeout(moveTimer);
        moveTimer = setTimeout(function () {
          var center = map.getCenter();
          postOutward({ type: 'regionChange', latitude: center.lat, longitude: center.lng });
          userGesture = false;
        }, 250);
      });
      window.addEventListener('message', function (event) {
        var data = event.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { return; } }
        render(data);
      });
      window.__birdGoRender = render;
    })();
  </script>
</body>
</html>`;
}
