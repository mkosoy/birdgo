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
    .user-marker { width: 22px; height: 22px; background: #2878d1; border: 3px solid white; box-shadow: 0 0 0 2px #2878d1; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    (function () {
      var map = L.map('map', { zoomControl: true }).setView([37.7749, -122.4194], 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      var markers = L.layerGroup().addTo(map);
      var userMarker = null;
      var firstData = true;
      var moveTimer = null;

      function postOutward(payload) {
        var serialized = JSON.stringify(payload);
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(serialized);
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage(serialized, '*');
        } else {
          window.postMessage(serialized, '*');
        }
      }

      function markerIcon(isNotable) {
        return L.divIcon({
          className: '',
          html: '<div class="bird-marker' + (isNotable ? ' notable' : '') + '">' + (isNotable ? '★' : '🐦') + '</div>',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -18]
        });
      }

      function render(data) {
        if (!data || !data.center) return;
        markers.clearLayers();
        (data.markers || []).forEach(function (bird) {
          var marker = L.marker([bird.latitude, bird.longitude], { icon: markerIcon(bird.isNotable) });
          marker.bindPopup('<strong>' + escapeHtml(bird.comName || 'Bird') + '</strong><br>' + escapeHtml(bird.relativeTime || 'recently'));
          marker.on('click', function () {
            postOutward({ type: 'markerPress', id: bird.id, comName: bird.comName });
          });
          marker.addTo(markers);
        });
        if (data.userLocation) {
          var userPoint = [data.userLocation.latitude, data.userLocation.longitude];
          if (userMarker) userMarker.setLatLng(userPoint);
          else userMarker = L.marker(userPoint, { icon: L.divIcon({ className: '', html: '<div class="user-marker"></div>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map);
        }
        if (firstData) {
          map.setView([data.center.latitude, data.center.longitude], 13);
          firstData = false;
        }
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (character) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character];
        });
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
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (_) { return; }
        }
        render(data);
      });
      window.__birdGoRender = render;
    })();
  </script>
</body>
</html>`;
}
