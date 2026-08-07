export function buildLeafletHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
    .bird-marker, .user-marker { display: flex; align-items: center; justify-content: center; border-radius: 50%; color: white; font-size: 18px; font-weight: bold; }
    .bird-marker { width: 32px; height: 32px; background: #2f7d5b; border: 2px solid white; }
    .bird-marker.notable { background: #d99d21; }
    .user-marker { position: relative; width: 22px; height: 22px; background: #2878d1; border: 3px solid white; box-shadow: 0 0 0 2px #2878d1; }
    .user-marker::before { content: ''; position: absolute; top: 50%; left: 50%; width: 42px; height: 42px; border-radius: 50%; border: 2px solid rgba(40, 120, 209, 0.55); animation: pulse 1.8s ease-out infinite; }
    @keyframes pulse { 0% { transform: translate(-50%, -50%) scale(0.55); opacity: 0.9; } 100% { transform: translate(-50%, -50%) scale(1.45); opacity: 0; } }
    .encounter { min-width: 220px; line-height: 1.35; }
    .encounter h3 { margin: 0 0 2px; font-size: 16px; }
    .encounter .scientific { font-style: italic; color: #4c5c54; }
    .encounter .meta, .encounter .distance, .encounter .info, .encounter .field-notes { margin-top: 6px; }
    .encounter .stale { color: #7b5d27; font-weight: 700; margin-top: 6px; }
    .encounter .where, .encounter .field-notes, .encounter .info { color: #4c5c54; }
    .encounter .actions { display: flex; gap: 5px; margin-top: 9px; }
    .leaflet-popup-close-button { width: 44px !important; height: 44px !important; padding: 0; font-size: 24px; line-height: 40px !important; text-align: center; }
    .encounter button { min-height: 44px; border: 0; border-radius: 5px; padding: 8px 10px; color: white; background: #2f7d5b; font-weight: 700; cursor: pointer; }
    .encounter button:nth-child(2) { background: #2878d1; }
    .encounter button:nth-child(3) { background: #6f5aa8; }
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
      var restoringPopup = false;
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

      function markerIcon(isNotable) {
        return L.divIcon({
          className: '',
          html: '<div class="bird-marker' + (isNotable ? ' notable' : '') + '">' + (isNotable ? '★' : '🐦') + '</div>',
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

      function popupHtml(bird, userLocation) {
        var distance = haversineKm(userLocation, bird);
        var count = typeof bird.howMany === 'number' && bird.howMany > 0 ? ' • ×' + bird.howMany : '';
        return '<div class="encounter">' +
          '<h3>' + escapeHtml(bird.comName || 'Bird') + '</h3>' +
          '<div class="scientific">' + escapeHtml(bird.sciName || '') + '</div>' +
          '<div class="stale">Sighting recorded ' + escapeHtml(bird.relativeTime || 'recently') + ' — this is a past observation, not a live location.</div>' +
          '<div class="where">Where to look: ' + escapeHtml(bird.locName || 'No hotspot recorded') + count + '</div>' +
          (distance == null ? '' : '<div class="distance">' + (distance < 1 ? Math.round(distance * 1000) + ' m' : distance.toFixed(1) + ' km') + ' away · ' + Math.max(1, Math.round(distance * 1000 / 81)) + ' min walk</div>') +
          '<div class="field-notes" data-info>How to spot it: Field notes loading…</div>' +
          '<div class="actions"><button data-action="capture">Capture</button><button data-action="directions">Directions</button><button data-action="about">About</button></div>' +
          '</div>';
      }

      function attachPopupActions(popup, bird) {
        var element = popup.getElement();
        if (!element) return;
        element.querySelector('[data-action="capture"]').addEventListener('click', function () {
          postOutward({ type: 'capture', id: bird.id });
        });
        element.querySelector('[data-action="directions"]').addEventListener('click', function () {
          postOutward({ type: 'directions', latitude: bird.latitude, longitude: bird.longitude, name: bird.comName });
        });
        element.querySelector('[data-action="about"]').addEventListener('click', function () {
          postOutward({ type: 'about', speciesCode: bird.speciesCode, comName: bird.comName });
        });
        fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(bird.comName || 'Bird'))
          .then(function (response) { if (!response.ok) throw new Error('Wikipedia unavailable'); return response.json(); })
          .then(function (summary) {
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
        var restorePopupId = popupBirdId;
        var restoreMarker = null;
        if (data.userLocation) lastUserLocation = data.userLocation;
        if (data.command === 'recenter') {
          var target = data.userLocation || data.center;
          map.setView([target.latitude, target.longitude], map.getZoom() < 13 ? 13 : map.getZoom());
        }
        markers.clearLayers();
        (data.markers || []).forEach(function (bird) {
          var marker = L.marker([bird.latitude, bird.longitude], { icon: markerIcon(bird.isNotable) });
          var popup = L.popup({ maxWidth: 300 }).setContent(popupHtml(bird, lastUserLocation));
          marker.bindPopup(popup);
          marker.on('popupopen', function () {
            popupBirdId = bird.id;
            postOutward({ type: 'popup', open: true });
            attachPopupActions(popup, bird);
          });
          marker.on('popupclose', function () {
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
        }
        if (data.userLocation) {
          var userPoint = [data.userLocation.latitude, data.userLocation.longitude];
          if (userMarker) userMarker.setLatLng(userPoint);
          else userMarker = L.marker(userPoint, { icon: L.divIcon({ className: '', html: '<div class="user-marker"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false }).addTo(map);
        }
        if (firstData) {
          map.setView([data.center.latitude, data.center.longitude], 13);
          firstData = false;
        }
      }

      map.on('moveend', function () {
        if (restoringPopup) return;
        clearTimeout(moveTimer);
        moveTimer = setTimeout(function () {
          var center = map.getCenter();
          postOutward({ type: 'regionChange', latitude: center.lat, longitude: center.lng });
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
