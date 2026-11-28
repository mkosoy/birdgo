import { speciesAudioScript } from "./speciesAudioScript";

export function buildLeafletHtml(options: { apiBaseUrl?: string } = {}): string {
  const serializedApiBaseUrl = JSON.stringify(options.apiBaseUrl ?? "");
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
    .bird-marker, .user-marker { display: flex; align-items: center; justify-content: center; border-radius: 50%; color: white; font-size: 18px; font-weight: bold; }
    @keyframes birdBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
    @keyframes skyfriendArrive { 0% { opacity: 0; filter: brightness(2.2) saturate(1.6); } 55% { opacity: 1; filter: brightness(1.45) saturate(1.35); } 100% { opacity: 1; filter: none; } }
    .bird-marker { position: relative; width: 32px; height: 32px; background: #2f7d5b; border: 2px solid white; }
    .bird-marker.notable { background: #d99d21; }
    .bird-marker.captured { background: #61776c; border-color: #a9f0bf; }
    .bird-marker.virtual { animation: skyfriendArrive .65s ease-out, birdBob 2.6s ease-in-out .7s infinite; background: linear-gradient(145deg, #7d64f2, #28b9d7); border-color: #d9fbff; box-shadow: 0 0 12px rgba(92,220,255,.72); }
    @media (prefers-reduced-motion: reduce) { .bird-marker.virtual { animation: none; } }
    .bird-marker.prismatic { animation-duration: .65s, 1.9s; background: linear-gradient(145deg, #ffd766, #7d64f2 48%, #28e0c8); border-color: #fff3bd; box-shadow: 0 0 15px rgba(255,215,102,.85); }
    .bird-marker .caught-badge, .bird-marker .skyfriend-badge, .bird-marker .audio-badge { position: absolute; right: -6px; bottom: -6px; width: 17px; height: 17px; border-radius: 50%; background: #65d184; color: #10351f; border: 1px solid white; font-size: 11px; line-height: 15px; text-align: center; font-weight: 900; }
    .bird-marker .skyfriend-badge { background: #72e7ff; color: #273075; }
    .bird-marker .audio-badge { background: #7bd7ff; color: #123c64; }
    .bird-marker.audio { background: linear-gradient(145deg, #36a8cf, #2466a7); border-color: #d8f3ff; }
    .skyfriend-tag { display: inline-block; margin-left: 6px; padding: 2px 7px; border-radius: 10px; background: linear-gradient(135deg, #735eea, #29bedd); color: white; font-size: 10px; font-weight: 900; vertical-align: middle; }
    .user-marker { position: relative; width: 22px; height: 22px; background: #2878d1; border: 3px solid white; box-shadow: 0 0 0 2px #2878d1; }
    .user-marker::before { content: ''; position: absolute; top: 50%; left: 50%; width: 42px; height: 42px; border-radius: 50%; border: 2px solid rgba(40, 120, 209, 0.55); animation: pulse 1.8s ease-out infinite; }
    @keyframes pulse { 0% { transform: translate(-50%, -50%) scale(0.55); opacity: 0.9; } 100% { transform: translate(-50%, -50%) scale(1.45); opacity: 0; } }
    .encounter { min-width: 220px; line-height: 1.35; }
    .encounter h3 { margin: 0 0 2px; font-size: 16px; }
    .encounter .encounter-head { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
    .encounter .encounter-photo { width: 42px; height: 42px; flex: 0 0 42px; border-radius: 50%; object-fit: cover; border: 2px solid #e0c364; background: #e6eee9; }
    .encounter .encounter-title { flex: 1; min-width: 0; }
    .encounter .scientific { font-style: italic; color: #4c5c54; }
    .encounter .meta, .encounter .distance, .encounter .info, .encounter .field-notes { margin-top: 6px; }
    .encounter .stale { color: #7b5d27; font-weight: 700; margin-top: 6px; }
    .encounter .where, .encounter .field-notes, .encounter .info { color: #4c5c54; }
    .encounter .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
    .encounter .audio-credit { display: none; color: #68796f; font-size: 9px; line-height: 12px; margin-top: 5px; }
    .encounter .audio-credit.on { display: block; }
    .leaflet-popup-close-button { width: 44px !important; height: 44px !important; padding: 0; font-size: 24px; line-height: 40px !important; text-align: center; }
    .leaflet-popup-content { max-height: 220px; overflow-y: auto; }
    .leaflet-control-zoom a { width: 44px !important; height: 44px !important; line-height: 42px !important; font-size: 22px; }
    .encounter button { min-height: 44px; border: 0; border-radius: 5px; padding: 8px 10px; color: white; background: #2f7d5b; font-weight: 700; cursor: pointer; }
    .encounter button:nth-child(2) { background: #2878d1; }
    .encounter button:nth-child(3) { background: #d99d21; }
    .encounter button:nth-child(4) { background: #6f5aa8; }
    #map-attribution { position: absolute; z-index: 1000; top: 112px; left: 8px; font-family: -apple-system, system-ui, sans-serif; }
    #map-attribution-toggle { width: 44px; height: 44px; border: 0; border-radius: 22px; background: rgba(255,255,255,.94); color: #34453c; box-shadow: 0 2px 8px rgba(0,0,0,.2); font-size: 20px; cursor: pointer; }
    #map-attribution-copy { display: none; width: 220px; margin-top: 6px; padding: 9px 11px; border-radius: 10px; background: rgba(255,255,255,.96); color: #34453c; box-shadow: 0 2px 10px rgba(0,0,0,.22); font-size: 11px; line-height: 15px; }
    #map-attribution.open #map-attribution-copy { display: block; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="map-attribution"><button id="map-attribution-toggle" type="button" aria-label="Show map credits">ⓘ</button><div id="map-attribution-copy">Map tiles © OpenStreetMap contributors · Walking routes © OSRM</div></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    (function () {
      var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([37.7749, -122.4194], 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      var markers = L.layerGroup().addTo(map);
      var userMarker = null;
      var firstData = true;
      var moveTimer = null;
      var lastUserLocation = null;
      var popupBirdId = null;
      var currentAudio = null;
      var currentAudioKey = null;
      var currentAudioAttribution = '';
      var audioRequest = 0;
      var guideCache = Object.create(null);
      var apiBaseUrl = ${serializedApiBaseUrl};
      var restoringPopup = false;
      var rebuildingMarkers = false;
      var latestData = null;
      var latestMarkers = [];
      var programmaticCameraMove = false;
      var userGesture = false;
      function markProgrammaticCameraMove() { programmaticCameraMove = true; }
      var attribution = document.getElementById('map-attribution');
      document.getElementById('map-attribution-toggle').addEventListener('click', function () {
        var open = attribution.classList.toggle('open');
        this.setAttribute('aria-label', open ? 'Hide map credits' : 'Show map credits');
      });

      function postOutward(payload) {
        var serialized = JSON.stringify(payload);
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(serialized);
        else if (window.parent && window.parent !== window) window.parent.postMessage(serialized, '*');
        else window.postMessage(serialized, '*');
      }

      function rareEncounter(bird) {
        return Boolean(bird && (bird.isNotable || bird.rarity === 'rare' || bird.rarity === 'epic' || bird.rarity === 'legendary'));
      }

      function birdGlyph() {
        return '<svg viewBox="0 0 64 64" width="20" height="20" aria-hidden="true"><path d="M12 39c4-13 15-23 29-23 7 0 12 3 14 8l7 3-6 4c-2 9-10 15-20 15-8 0-15-2-24-7z" fill="currentColor"/><circle cx="47" cy="24" r="2.4" fill="#234236"/><path d="M14 39 4 45l13 2z" fill="currentColor" opacity=".82"/></svg>';
      }
      function markerIcon(bird) {
        return L.divIcon({
          className: '',
          html: '<div class="bird-marker' + (bird.virtual ? ' virtual' : '') + (bird.source === 'birdweather' ? ' audio' : '') + (rareEncounter(bird) ? ' notable' : '') + (bird.captureCount ? ' captured' : '') + (bird.prismatic ? ' prismatic' : '') + '">' + birdGlyph() + (bird.captureCount ? '<span class="caught-badge">✓</span>' : bird.virtual ? '<span class="skyfriend-badge">✦</span>' : bird.source === 'birdweather' ? '<span class="audio-badge">♪</span>' : '') + '</div>',
          iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18]
        });
      }

      function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character];
        });
      }

      function haversineKm(a, b) {
        if (!a || !b) return null;
        var radians = Math.PI / 180;
        var dLat = (b.latitude - a.latitude) * radians;
        var dLng = (b.longitude - a.longitude) * radians;
        var lat1 = a.latitude * radians;
        var lat2 = b.latitude * radians;
        var value = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
        return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
      }

${speciesAudioScript()}
      function popupHtml(bird, userLocation) {
        var distance = haversineKm(userLocation, bird);
        var count = typeof bird.howMany === 'number' && bird.howMany > 0 ? ' • ×' + bird.howMany : '';
        var virtual = Boolean(bird.virtual);
        var frequencyCopy = !virtual && bird.source !== 'birdweather' && typeof bird.reportCount === 'number' && bird.reportCount > 0 ? 'Reported at ' + bird.reportCount + ' location' + (bird.reportCount === 1 ? '' : 's') + ' recently' : '';
        var prismatic = Boolean(bird.prismatic);
        var statusCopy = virtual
          ? 'Virtual learning encounter — habitat-plausible, but not a real sighting.'
          : bird.source === 'birdweather'
            ? 'Live acoustic detection · ' + escapeHtml(bird.relativeTime || 'recently') + ' — the bird may be anywhere within earshot of this station.'
            : (bird.obsValid === false ? 'Unconfirmed sighting reported ' : 'Sighting recorded ') + escapeHtml(bird.relativeTime || 'recently') + ' — this is a past observation, not a live location.';
        var captureCopy = virtual
          ? 'Collect this Skyfriend for your virtual field guide; it never counts as a real bird.'
          : bird.captureCount
            ? 'Already collected ×' + bird.captureCount + ' — recaptures still earn XP.'
            : bird.source === 'birdweather'
              ? 'Heard recently by a nearby audio station — use this as a fresh search clue, not an exact perch.'
              : 'Not collected yet — capture it to add it to your Bird-dex.';
        var actionLabel = virtual ? 'Collect' : bird.captureCount ? 'Recapture' : 'Capture';
        var photoCopy = bird.imageUrl ? '<img class="encounter-photo" loading="lazy" referrerpolicy="no-referrer" src="' + escapeHtml(bird.imageUrl) + '" alt="" />' : '';
        return '<div class="encounter">' +
          '<div class="encounter-head">' + photoCopy + '<div class="encounter-title"><h3>' + escapeHtml(bird.comName || 'Bird') + (virtual ? '<span class="skyfriend-tag">' + (prismatic ? 'Prismatic Skyfriend' : 'Skyfriend') + '</span>' : '') + '</h3>' +
          '<div class="scientific">' + escapeHtml(bird.sciName || '') + '</div></div></div>' +
          '<div class="stale">' + statusCopy + '</div>' +
          '<div class="where">Where to look: ' + escapeHtml(virtual ? 'Could occur in this habitat' : bird.locName || 'No hotspot recorded') + count + '</div>' +
          (distance == null ? '' : '<div class="distance">' + (distance < 1 ? Math.round(distance * 1000) + ' m' : distance.toFixed(1) + ' km') + ' away · ' + Math.max(1, Math.round(distance * 1000 / 81)) + ' min walk</div>') +
          (frequencyCopy ? '<div class="distance">' + frequencyCopy + '</div>' : '') +
          '<div class="distance">' + captureCopy + '</div>' +
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
        var summaryNames = [bird.sciName, bird.comName].filter(Boolean);
        function fetchSpeciesSummary(index) {
          if (index >= summaryNames.length) return Promise.reject(new Error('Wikipedia unavailable'));
          return fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(summaryNames[index]))
            .then(function (response) { if (!response.ok) throw new Error('Wikipedia unavailable'); return response.json(); })
            .catch(function (error) {
              if (index + 1 < summaryNames.length) return fetchSpeciesSummary(index + 1);
              throw error;
            });
        }
        fetchSpeciesSummary(0)
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

      function render(data) {
        if (!data || !data.center) return;
        if (Array.isArray(data.markers)) latestMarkers = data.markers;
        latestData = Object.assign({}, data, { command: null, markers: latestMarkers });
        var restorePopupId = popupBirdId;
        var restoreMarker = null;
        if (data.userLocation) lastUserLocation = data.userLocation;
        if (data.command === 'recenter') {
          var target = data.userLocation || data.center;
          markProgrammaticCameraMove();
          map.setView([target.latitude, target.longitude], map.getZoom() < 13 ? 13 : map.getZoom());
        } else if (data.command === 'closePopup') {
          popupBirdId = null;
          restorePopupId = null;
          map.closePopup();
        }
        if (firstData) {
          markProgrammaticCameraMove();
          map.setView([data.center.latitude, data.center.longitude], 13);
          firstData = false;
        }
        rebuildingMarkers = true;
        markers.clearLayers();
        rebuildingMarkers = false;
        var zoom = map.getZoom();
        var maxMarkers = zoom >= 15 ? 80 : zoom >= 13 ? 45 : 24;
        var minSpacing = zoom >= 16 ? 18 : zoom >= 15 ? 24 : zoom >= 13 ? 38 : 48;
        var visibleBounds = map.getBounds().pad(0.08);
        var referenceLocation = lastUserLocation || data.center;
        var sortedBirds = latestMarkers.slice().sort(function (left, right) {
          function score(bird) {
            var distance = haversineKm(referenceLocation, bird);
            return (distance == null ? 999 : distance) - (rareEncounter(bird) ? 0.35 : 0) - (bird.captureCount ? 0.1 : 0) - (bird.virtual ? 0.05 : 0);
          }
          return score(left) - score(right);
        });
        var coordinateGroups = {};
        sortedBirds.forEach(function (bird) {
          var coordinateKey = bird.latitude.toFixed(5) + ':' + bird.longitude.toFixed(5);
          bird._birdgoCoordinateIndex = coordinateGroups[coordinateKey] || 0;
          coordinateGroups[coordinateKey] = bird._birdgoCoordinateIndex + 1;
        });
        var chosenBirds = [];
        var chosenPoints = [];
        sortedBirds.forEach(function (bird) {
          if (chosenBirds.length >= maxMarkers && String(bird.id) !== String(restorePopupId)) return;
          var latLng = L.latLng(bird.latitude, bird.longitude);
          if (!visibleBounds.contains(latLng) && String(bird.id) !== String(restorePopupId)) return;
          var coordinateKey = bird.latitude.toFixed(5) + ':' + bird.longitude.toFixed(5);
          var coordinateCount = coordinateGroups[coordinateKey] || 1;
          if (coordinateCount > 1 && zoom >= 16) {
            var centerPoint = map.latLngToContainerPoint(latLng);
            var angle = (Math.PI * 2 * bird._birdgoCoordinateIndex / coordinateCount) - Math.PI / 2;
            var radius = Math.max(24, minSpacing + 6);
            latLng = map.containerPointToLatLng(L.point(
              centerPoint.x + Math.cos(angle) * radius,
              centerPoint.y + Math.sin(angle) * radius
            ));
          }
          var point = map.latLngToContainerPoint(latLng);
          var crowded = false;
          if (zoom < 16 && String(bird.id) !== String(restorePopupId)) {
            for (var pointIndex = 0; pointIndex < chosenPoints.length; pointIndex += 1) {
              var dx = point.x - chosenPoints[pointIndex].x;
              var dy = point.y - chosenPoints[pointIndex].y;
              if (Math.sqrt(dx * dx + dy * dy) < minSpacing) {
                crowded = true;
                break;
              }
            }
          }
          if (crowded) return;
          bird._birdgoDisplayLatitude = latLng.lat;
          bird._birdgoDisplayLongitude = latLng.lng;
          chosenBirds.push(bird);
          chosenPoints.push(point);
        });
        chosenBirds.forEach(function (bird) {
          var marker = L.marker([bird._birdgoDisplayLatitude || bird.latitude, bird._birdgoDisplayLongitude || bird.longitude], { icon: markerIcon(bird) });
          var popup = L.popup({
            maxWidth: 300,
            maxHeight: Math.max(180, window.innerHeight - 120),
            autoPanPaddingTopLeft: [10, 180],
            autoPanPaddingBottomRight: [10, 60]
          }).setContent(popupHtml(bird, lastUserLocation));
          marker.bindPopup(popup);
          marker.on('popupopen', function () {
            markProgrammaticCameraMove();
            popupBirdId = bird.id;
            postOutward({ type: 'popup', open: true });
            prefetchSpeciesGuide(bird);
            attachPopupActions(popup, bird);
          });
          marker.on('popupclose', function () {
            if (!rebuildingMarkers) stopBirdAudio();
            if (!restoringPopup) popupBirdId = null;
            postOutward({ type: 'popup', open: false });
          });
          marker.addTo(markers);
          if (restorePopupId === bird.id) restoreMarker = marker;
        });
        if (restoreMarker) {
          restoringPopup = true;
          restoreMarker.openPopup();
          setTimeout(function () { restoringPopup = false; }, 0);
        } else if (restorePopupId && currentAudioKey === restorePopupId) {
          stopBirdAudio();
        }
        if (data.userLocation) {
          var userPoint = [data.userLocation.latitude, data.userLocation.longitude];
          if (userMarker) userMarker.setLatLng(userPoint);
          else userMarker = L.marker(userPoint, { icon: L.divIcon({ className: '', html: '<div class="user-marker"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false }).addTo(map);
        }
      }

      map.on('moveend', function () {
        if (restoringPopup || programmaticCameraMove || !userGesture) {
          programmaticCameraMove = false;
          clearTimeout(moveTimer);
          return;
        }
        clearTimeout(moveTimer);
        moveTimer = setTimeout(function () {
          var center = map.getCenter();
          postOutward({ type: 'regionChange', latitude: center.lat, longitude: center.lng });
          userGesture = false;
          if (latestData) render(latestData);
        }, 250);
      });
      map.on('dragstart zoomstart', function (event) {
        userGesture = true;
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
