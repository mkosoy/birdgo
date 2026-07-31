export function buildMapLibreHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
    .bird-marker, .user-marker { display: flex; align-items: center; justify-content: center; border-radius: 50%; color: white; font-size: 18px; font-weight: bold; }
    .bird-marker { width: 32px; height: 32px; background: #2f7d5b; border: 2px solid white; cursor: pointer; }
    .bird-marker.notable { background: #d99d21; }
    .user-marker { position: relative; width: 22px; height: 22px; background: #2878d1; border: 3px solid white; box-shadow: 0 0 0 2px #2878d1; }
    .user-marker::before { content: ''; position: absolute; top: 50%; left: 50%; width: 42px; height: 42px; border-radius: 50%; border: 2px solid rgba(40, 120, 209, 0.55); animation: pulse 1.8s ease-out infinite; }
    @keyframes pulse { 0% { transform: translate(-50%, -50%) scale(0.55); opacity: 0.9; } 100% { transform: translate(-50%, -50%) scale(1.45); opacity: 0; } }
    .encounter { min-width: 220px; line-height: 1.35; color: #26342d; }
    .encounter h3 { margin: 0 0 2px; font-size: 16px; }
    .encounter .scientific { font-style: italic; color: #4c5c54; }
    .encounter .meta, .encounter .distance, .encounter .info { margin-top: 6px; }
    .encounter .info { color: #4c5c54; }
    .encounter .actions { display: flex; gap: 5px; margin-top: 9px; }
    .encounter button { border: 0; border-radius: 5px; padding: 6px 8px; color: white; background: #2f7d5b; font-weight: 700; cursor: pointer; }
    .encounter button:nth-child(2) { background: #2878d1; }
    .encounter button:nth-child(3) { background: #6f5aa8; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    (function () {
      var map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/bright',
        center: [-122.4194, 37.7749],
        zoom: 13,
        pitch: 55,
        bearing: 0
      });
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      var birdMarkers = [];
      var currentPopup = null;
      var userMarker = null;
      var firstData = true;
      var moveTimer = null;
      var lastUserLocation = null;

      function postOutward(payload) {
        var serialized = JSON.stringify(payload);
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(serialized);
        else if (window.parent && window.parent !== window) window.parent.postMessage(serialized, '*');
        else window.postMessage(serialized, '*');
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
          '<div class="meta">' + escapeHtml(bird.locName || 'Unknown hotspot') + ' • ' + escapeHtml(bird.relativeTime || 'recently') + count + '</div>' +
          (distance == null ? '' : '<div class="distance">' + distance.toFixed(1) + ' km away</div>') +
          '<div class="info" data-info>About ' + escapeHtml(bird.sciName || bird.comName || 'this species') + '</div>' +
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
            if (info && summary.extract) info.textContent = String(summary.extract).slice(0, 180) + (String(summary.extract).length > 180 ? '…' : '');
          })
          .catch(function () {});
      }

      function styleAdventureMap() {
        var layers = map.getStyle().layers || [];
        layers.forEach(function (layer) {
          try {
            if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#cce8c6');
            if (layer.type === 'fill' && layer['source-layer'] === 'water') map.setPaintProperty(layer.id, 'fill-color', '#8cc9e8');
            if (layer.type === 'fill' && layer['source-layer'] === 'park') map.setPaintProperty(layer.id, 'fill-color', '#76b86b');
            if (layer.type === 'symbol' && layer.layout && layer.layout.visibility !== 'none') map.setLayoutProperty(layer.id, 'visibility', 'none');
          } catch (_) {}
        });
        if (map.getSource('openmaptiles') && !map.getLayer('birdgo-buildings-3d')) {
          try {
            map.addLayer({
              id: 'birdgo-buildings-3d',
              type: 'fill-extrusion',
              source: 'openmaptiles',
              'source-layer': 'building',
              minzoom: 14,
              paint: {
                'fill-extrusion-color': '#a9c6a1',
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.8
              }
            });
          } catch (_) {}
        }
        map.setPitch(55);
        map.setZoom(15.5);
        map.setBearing(0);
      }

      map.on('load', function () { styleAdventureMap(); });

      function render(data) {
        if (!data || !data.center) return;
        if (data.userLocation) lastUserLocation = data.userLocation;
        if (data.command === 'recenter') {
          var target = data.userLocation || data.center;
          map.easeTo({ center: [target.longitude, target.latitude], duration: 450, pitch: 55, zoom: Math.max(map.getZoom(), 15.5), bearing: 0 });
        }
        birdMarkers.forEach(function (marker) { marker.remove(); });
        birdMarkers = [];
        if (currentPopup) {
          currentPopup.remove();
          currentPopup = null;
        }
        (data.markers || []).forEach(function (bird) {
          var element = document.createElement('div');
          element.className = 'bird-marker' + (bird.isNotable ? ' notable' : '');
          element.textContent = bird.isNotable ? '★' : '🐦';
          var marker = new maplibregl.Marker({ element: element })
            .setLngLat([bird.longitude, bird.latitude])
            .addTo(map);
          element.addEventListener('click', function () {
            if (currentPopup) currentPopup.remove();
            var popup = new maplibregl.Popup({ offset: 20, maxWidth: '300px' })
              .setLngLat([bird.longitude, bird.latitude])
              .setHTML(popupHtml(bird, lastUserLocation))
              .addTo(map);
            currentPopup = popup;
            setTimeout(function () { attachPopupActions(popup, bird); }, 0);
          });
          birdMarkers.push(marker);
        });
        if (data.userLocation) {
          var userElement = document.createElement('div');
          userElement.className = 'user-marker';
          if (userMarker) userMarker.setLngLat([data.userLocation.longitude, data.userLocation.latitude]);
          else userMarker = new maplibregl.Marker({ element: userElement }).setLngLat([data.userLocation.longitude, data.userLocation.latitude]).addTo(map);
        }
        if (firstData) {
          map.setCenter([data.center.longitude, data.center.latitude]);
          firstData = false;
        }
      }

      map.on('moveend', function () {
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
