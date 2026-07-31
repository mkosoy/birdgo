export function buildMapLibreHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
    body { position: relative; overflow: hidden; }
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
    #direction-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 5; overflow: hidden; }
    .direction-arrow { position: absolute; width: 86px; min-height: 42px; padding: 4px; border: 0; border-radius: 10px; color: white; font-size: 12px; line-height: 1.15; text-align: center; pointer-events: auto; cursor: pointer; transform-origin: center; }
    .direction-arrow .glyph { display: block; font-size: 25px; line-height: 22px; }
    .direction-arrow .label { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0,0,0,.65); }
    .direction-arrow.common { background: rgba(47, 125, 91, .9); }
    .direction-arrow.rare { background: rgba(217, 157, 33, .95); }
    #compass-button { position: absolute; z-index: 6; left: 50%; bottom: 24px; transform: translateX(-50%); border: 0; border-radius: 18px; padding: 9px 14px; color: white; background: rgba(35, 73, 53, .92); font-weight: 700; display: none; cursor: pointer; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="direction-overlay"></div>
  <button id="compass-button" type="button">🧭 Enable compass</button>
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
      var latestMarkers = [];
      var follow = true;
      var programmatic = false;
      var headingFollow = false;
      var orientationListening = false;
      var orientationPermission = null;
      var currentHeading = null;
      var bearingFrame = null;
      var directionFrame = null;
      var directionOverlay = document.getElementById('direction-overlay');
      var compassButton = document.getElementById('compass-button');

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
        currentHeading = (heading + 360) % 360;
        if (bearingFrame != null) return;
        bearingFrame = requestAnimationFrame(function () {
          bearingFrame = null;
          if (headingFollow && typeof currentHeading === 'number') map.setBearing(currentHeading);
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
        if (currentPopup) currentPopup.remove();
        var popup = new maplibregl.Popup({ offset: 20, maxWidth: '300px' })
          .setLngLat([bird.longitude, bird.latitude])
          .setHTML(popupHtml(bird, lastUserLocation))
          .addTo(map);
        currentPopup = popup;
        setTimeout(function () { attachPopupActions(popup, bird); }, 0);
      }

      function scheduleDirections() {
        if (directionFrame != null) return;
        directionFrame = requestAnimationFrame(function () {
          directionFrame = null;
          drawDirections();
        });
      }

      function drawDirections() {
        directionOverlay.innerHTML = '';
        if (!lastUserLocation) return;
        var width = window.innerWidth;
        var height = window.innerHeight;
        var centerX = width / 2;
        var centerY = height / 2;
        var radius = Math.min(width, height) * 0.38;
        var halfWidth = 48;
        var halfHeight = 30;
        var mapBearing = map.getBearing();
        var nearest = latestMarkers.map(function (bird) {
          return { bird: bird, distance: haversineKm(lastUserLocation, bird) };
        }).filter(function (entry) {
          return entry.distance != null;
        }).sort(function (left, right) {
          return left.distance - right.distance;
        }).slice(0, 6);
        nearest.forEach(function (entry) {
          var bird = entry.bird;
          var distance = entry.distance;
          var screenAngle = (geographicBearing(lastUserLocation, bird) - mapBearing + 360) % 360;
          var radians = screenAngle * Math.PI / 180;
          var x = Math.max(halfWidth, Math.min(width - halfWidth, centerX + Math.sin(radians) * radius));
          var y = Math.max(halfHeight, Math.min(height - halfHeight, centerY - Math.cos(radians) * radius));
          var arrow = document.createElement('button');
          arrow.type = 'button';
          arrow.className = 'direction-arrow ' + (bird.isNotable ? 'rare' : 'common');
          arrow.style.left = x + 'px';
          arrow.style.top = y + 'px';
          arrow.style.transform = 'translate(-50%, -50%)';
          var displayDistance = distance < 1
            ? Math.round(distance * 1000) + '\\u00a0m'
            : distance.toFixed(1) + ' km';
          arrow.innerHTML = '<span class="glyph" style="transform:rotate(' + (screenAngle - 90) + 'deg)">➤</span>' +
            '<span class="label">' + escapeHtml(bird.comName || 'Bird') + ' · ' + displayDistance + '</span>';
          arrow.addEventListener('click', function () {
            follow = false;
            map.flyTo({ center: [bird.longitude, bird.latitude], zoom: Math.max(map.getZoom(), 17), duration: 900 });
            map.once('moveend', function () { openBirdPopup(bird); });
          });
          directionOverlay.appendChild(arrow);
        });
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
            var sl = layer['source-layer'];
            if (layer.type === 'symbol') { map.setLayoutProperty(layer.id, 'visibility', 'none'); return; }
            if (layer.type === 'background') { map.setPaintProperty(layer.id, 'background-color', '#74c94f'); return; }
            if (layer.type === 'fill') {
              if (sl === 'water') { map.setPaintProperty(layer.id, 'fill-color', '#5cc4ea'); }
              else if (sl === 'building') { map.setLayoutProperty(layer.id, 'visibility', 'none'); }
              else {
                var cls = (layer.id || '').toLowerCase();
                var green = (cls.indexOf('wood') >= 0 || cls.indexOf('forest') >= 0 || cls.indexOf('park') >= 0 || cls.indexOf('grass') >= 0 || cls.indexOf('pitch') >= 0) ? '#57bd45' : '#74c94f';
                map.setPaintProperty(layer.id, 'fill-color', green);
                map.setPaintProperty(layer.id, 'fill-opacity', 1);
              }
              return;
            }
            if (layer.type === 'line') {
              if (sl === 'transportation') map.setPaintProperty(layer.id, 'line-color', '#ffffff');
              else if (sl === 'waterway') map.setPaintProperty(layer.id, 'line-color', '#6cc7e8');
            }
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
                'fill-extrusion-color': '#eef3ea',
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.95
              }
            });
          } catch (_) {}
        }
        map.setPitch(58);
        map.setZoom(15.5);
        map.setBearing(0);
        map.resize();
      }

      map.on('load', function () { styleAdventureMap(); });
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(function () { map.resize(); }).observe(document.getElementById('map'));
      }
      map.on('dragstart', function () { follow = false; });
      map.on('move', scheduleDirections);
      map.on('rotate', scheduleDirections);
      map.on('pitch', scheduleDirections);

      function render(data) {
        if (!data || !data.center) return;
        var previousLocation = lastUserLocation;
        if (data.userLocation) {
          lastUserLocation = data.userLocation;
          if (previousLocation && haversineKm(previousLocation, data.userLocation) > 0.003 && typeof data.heading !== 'number') {
            updateBearing(geographicBearing(previousLocation, data.userLocation));
          }
          if (data.heading != null) updateBearing(data.heading);
        }
        if (data.command === 'recenter') {
          follow = true;
          var target = data.userLocation || data.center;
          programmatic = true;
          map.easeTo({ center: [target.longitude, target.latitude], duration: 450, pitch: headingFollow ? 78 : 55, zoom: Math.max(map.getZoom(), headingFollow ? 18.5 : 15.5), bearing: headingFollow && typeof currentHeading === 'number' ? currentHeading : 0 });
          setTimeout(function () { programmatic = false; }, 600);
        } else if (data.command === 'setView') {
          headingFollow = Boolean(data.firstPerson);
          if (headingFollow) {
            map.easeTo({ pitch: 78, zoom: 18.5, duration: 700 });
            if (typeof data.heading === 'number') updateBearing(data.heading);
            enableOrientation();
          } else {
            compassButton.style.display = 'none';
            map.easeTo({ pitch: 58, zoom: 15.5, bearing: 0, duration: 700 });
          }
        } else if (data.userLocation && follow && !programmatic && (!previousLocation || haversineKm(previousLocation, data.userLocation) > 0.003)) {
          programmatic = true;
          map.easeTo({ center: [data.userLocation.longitude, data.userLocation.latitude], duration: 800 });
          setTimeout(function () { programmatic = false; }, 950);
        }
        latestMarkers = data.markers || [];
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
            openBirdPopup(bird);
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
        scheduleDirections();
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
