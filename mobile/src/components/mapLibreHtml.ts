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
    .maplibregl-popup { z-index: 9 !important; }
    #nearby-panel { position: absolute; left: 8px; right: 8px; bottom: 98px; z-index: 6; background: rgba(255,255,255,.96); border-radius: 16px; box-shadow: 0 4px 18px rgba(0,0,0,.25); font-family: -apple-system, system-ui, sans-serif; overflow: hidden; max-height: 52%; display: flex; flex-direction: column; }
    #nearby-header { display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer; border-bottom: 1px solid #eee; }
    #nearby-title { font-weight: 800; color: #173c2b; font-size: 14px; flex: 1; }
    #rare-toggle { border: 1px solid #d99d21; color: #b6810f; background: #fff; border-radius: 14px; padding: 4px 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
    #rare-toggle.on { background: #d99d21; color: #fff; }
    #nearby-caret { color: #888; font-size: 13px; width: 14px; text-align: center; }
    #nearby-list { overflow-y: auto; padding: 4px; -webkit-overflow-scrolling: touch; }
    #nearby-panel.collapsed #nearby-list { display: none; }
    .nb-row { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 12px; cursor: pointer; }
    .nb-row:active { background: #f0f5f1; }
    .nb-thumb { width: 46px; height: 46px; border-radius: 50%; overflow: hidden; flex: none; background: #dbe7df; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    .nb-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .nb-info { flex: 1; min-width: 0; }
    .nb-name { font-weight: 700; color: #21362c; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nb-name .star { color: #d99d21; }
    .nb-sub { color: #5c6f65; font-size: 12px; margin-top: 1px; }
    .nb-go { border: 0; border-radius: 20px; padding: 9px 15px; background: #2f7d5b; color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; flex: none; }
    .nb-row.rare .nb-go { background: #d99d21; }
    .nb-empty { padding: 16px; text-align: center; color: #6b7d72; font-size: 13px; }
    #track-hud { position: absolute; inset: 0; z-index: 5; pointer-events: none; display: none; }
    #track-hud.on { display: block; }
    #track-arrow { position: absolute; top: 40%; left: 50%; margin: -70px 0 0 -46px; font-size: 130px; line-height: 92px; color: rgba(47,125,91,.92); text-shadow: 0 3px 10px rgba(0,0,0,.4); transition: transform .18s ease-out; }
    #track-arrow.rare { color: rgba(217,157,33,.96); }
    #track-card { position: absolute; left: 8px; right: 8px; bottom: 98px; z-index: 8; background: rgba(255,255,255,.97); border-radius: 16px; box-shadow: 0 4px 18px rgba(0,0,0,.28); padding: 12px; display: none; align-items: center; gap: 12px; pointer-events: auto; font-family: -apple-system, system-ui, sans-serif; }
    #track-card.on { display: flex; }
    #track-thumb { width: 54px; height: 54px; border-radius: 50%; overflow: hidden; flex: none; background: #dbe7df; display: flex; align-items: center; justify-content: center; font-size: 26px; }
    #track-thumb img { width: 100%; height: 100%; object-fit: cover; }
    #track-meta { flex: 1; min-width: 0; }
    #track-name { font-weight: 800; color: #173c2b; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #track-dist { color: #2f7d5b; font-weight: 700; font-size: 13px; margin-top: 2px; }
    #track-actions { display: flex; gap: 8px; flex: none; }
    #track-snap { border: 0; border-radius: 20px; padding: 10px 16px; background: #2f7d5b; color: #fff; font-weight: 800; cursor: pointer; }
    #track-snap.ready { background: #d99d21; animation: snappulse 1s infinite; }
    #track-stop { border: 0; border-radius: 20px; padding: 10px 14px; background: #eceff0; color: #445; font-weight: 700; cursor: pointer; }
    @keyframes snappulse { 0%,100%{ transform: scale(1);} 50%{ transform: scale(1.07);} }
    #snap-toast { position: absolute; left: 50%; top: 76px; transform: translateX(-50%); z-index: 8; max-width: 88%; background: rgba(217,157,33,.97); color: #fff; border: 0; border-radius: 22px; padding: 10px 16px; font-weight: 800; font-size: 13px; font-family: -apple-system, system-ui, sans-serif; box-shadow: 0 3px 12px rgba(0,0,0,.3); display: none; cursor: pointer; }
    #snap-toast.on { display: block; }
    #compass-button { position: absolute; z-index: 7; left: 50%; top: 120px; transform: translateX(-50%); border: 0; border-radius: 18px; padding: 9px 14px; color: white; background: rgba(35, 73, 53, .92); font-weight: 700; display: none; cursor: pointer; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="track-hud"><div id="track-arrow">⬆</div></div>
  <div id="nearby-panel" class="collapsed">
    <div id="nearby-header">
      <span id="nearby-title">Birds nearby</span>
      <button id="rare-toggle" type="button">★ Rare</button>
      <span id="nearby-caret">▸</span>
    </div>
    <div id="nearby-list"></div>
  </div>
  <div id="track-card">
    <div id="track-thumb"></div>
    <div id="track-meta"><div id="track-name"></div><div id="track-dist"></div></div>
    <div id="track-actions"><button id="track-snap" type="button">📸 Snap</button><button id="track-stop" type="button">✕</button></div>
  </div>
  <button id="snap-toast" type="button"></button>
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
      var arrowFrame = null;
      var trackId = null;
      var rareOnly = false;
      var panelCollapsed = true;
      var SNAP_M = 60;
      var ARRIVE_M = 30;
      var compassButton = document.getElementById('compass-button');
      var nearbyPanel = document.getElementById('nearby-panel');
      var nearbyHeader = document.getElementById('nearby-header');
      var nearbyTitle = document.getElementById('nearby-title');
      var rareToggle = document.getElementById('rare-toggle');
      var nearbyCaret = document.getElementById('nearby-caret');
      var nearbyList = document.getElementById('nearby-list');
      var trackHud = document.getElementById('track-hud');
      var trackArrow = document.getElementById('track-arrow');
      var trackCard = document.getElementById('track-card');
      var trackThumb = document.getElementById('track-thumb');
      var trackName = document.getElementById('track-name');
      var trackDist = document.getElementById('track-dist');
      var trackSnap = document.getElementById('track-snap');
      var trackStop = document.getElementById('track-stop');
      var snapToast = document.getElementById('snap-toast');

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

      var birdImageCache = {};
      function thumbInnerHtml(bird, emojiFallback) {
        var image = getBirdImage(bird);
        if (typeof image === 'string' && image) {
          return '<img src="' + escapeHtml(image) + '" alt="" />';
        }
        return emojiFallback || (bird.isNotable ? '★' : '🐦');
      }

      function getBirdImage(bird) {
        var names = [bird && bird.comName, bird && bird.sciName].filter(Boolean);
        var key = names[0] || (bird && bird.id);
        if (!key) return false;
        if (Object.prototype.hasOwnProperty.call(birdImageCache, key)) return birdImageCache[key];
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

      function fmtDist(km) {
        return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km';
      }

      function etaMin(km) {
        return Math.max(1, Math.round(km * 1000 / 81));
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

      function capture(id) {
        postOutward({ type: 'capture', id: id });
      }

      function refreshNearby() {
        if (!lastUserLocation) {
          nearbyTitle.textContent = 'Birds nearby';
          nearbyList.innerHTML = '<div class="nb-empty">Finding your location…</div>';
          snapToast.classList.remove('on');
          return;
        }
        var nearest = computeNearest();
        var filtered = rareOnly ? nearest.filter(function (entry) { return entry.bird.isNotable; }) : nearest;
        nearbyTitle.textContent = 'Birds nearby (' + filtered.length + ')';
        if (!filtered.length) {
          nearbyList.innerHTML = '<div class="nb-empty">' + (rareOnly ? 'No rare birds nearby right now.' : 'No birds nearby right now.') + '</div>';
        } else {
          nearbyList.innerHTML = filtered.slice(0, 14).map(function (entry) {
            var bird = entry.bird;
            var name = bird.comName || bird.sciName || 'Bird';
            var rareClass = bird.isNotable ? ' rare' : '';
            return '<div class="nb-row' + rareClass + '" data-bird-id="' + escapeHtml(bird.id) + '">' +
              '<div class="nb-thumb">' + thumbInnerHtml(bird) + '</div>' +
              '<div class="nb-info"><div class="nb-name">' + escapeHtml(name) + (bird.isNotable ? ' <span class="star">★</span>' : '') + '</div>' +
              '<div class="nb-sub">' + fmtDist(entry.distance) + ' · ' + etaMin(entry.distance) + ' min walk · ' + escapeHtml(bird.relativeTime || 'recently') + '</div></div>' +
              '<button class="nb-go' + rareClass + '" type="button" data-go-id="' + escapeHtml(bird.id) + '">Go</button>' +
              '</div>';
          }).join('');
        }
        if (trackId) {
          snapToast.classList.remove('on');
        } else {
          var closest = nearest[0];
          if (closest && closest.distance * 1000 <= SNAP_M) {
            var closestName = closest.bird.comName || closest.bird.sciName || 'Bird';
            snapToast.textContent = '📸 Snap ' + closestName + ' · ' + Math.round(closest.distance * 1000) + ' m';
            snapToast.classList.add('on');
            snapToast.onclick = function () { capture(closest.bird.id); };
          } else {
            snapToast.classList.remove('on');
            snapToast.onclick = null;
          }
        }
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
        if (distance != null && distance * 1000 <= ARRIVE_M) {
          trackSnap.classList.add('ready');
          trackSnap.textContent = '📸 Snap!';
          trackDist.textContent = 'You’re here! Snap it 📸';
        } else if (distance != null) {
          trackSnap.classList.remove('ready');
          trackSnap.textContent = '📸 Snap';
          trackDist.textContent = fmtDist(distance) + ' · ' + etaMin(distance) + ' min walk';
        } else {
          trackSnap.classList.remove('ready');
          trackSnap.textContent = '📸 Snap';
          trackDist.textContent = 'Finding distance…';
        }
      }

      function updateTrackArrow() {
        if (!trackId || !lastUserLocation) return;
        var bird = latestMarkers.find(function (entry) { return entry.id === trackId; });
        if (!bird) return;
        var screenAngle = (geographicBearing(lastUserLocation, bird) - map.getBearing() + 360) % 360;
        trackArrow.style.transform = 'rotate(' + screenAngle + 'deg)';
      }

      function startTrack(bird) {
        trackId = bird.id;
        follow = true;
        snapToast.classList.remove('on');
        trackHud.classList.add('on');
        trackCard.classList.add('on');
        nearbyPanel.classList.add('collapsed');
        nearbyCaret.textContent = '▸';
        panelCollapsed = true;
        if (lastUserLocation && !headingFollow) {
          map.easeTo({
            center: [lastUserLocation.longitude, lastUserLocation.latitude],
            pitch: 68,
            zoom: Math.max(map.getZoom(), 18),
            duration: 600
          });
        }
        updateTrackCard();
        updateTrackArrow();
      }

      function stopTrack() {
        trackId = null;
        trackHud.classList.remove('on');
        trackCard.classList.remove('on');
        refreshUi();
      }

      function scheduleArrow() {
        if (arrowFrame != null) return;
        arrowFrame = requestAnimationFrame(function () {
          arrowFrame = null;
          updateTrackArrow();
        });
      }

      function refreshUi() {
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
        map.flyTo({ center: [bird.longitude, bird.latitude], zoom: Math.max(map.getZoom(), 17), duration: 900 });
        map.once('moveend', function () { openBirdPopup(bird); });
      });
      nearbyHeader.addEventListener('click', function (event) {
        if (event.target === rareToggle || (event.target.closest && event.target.closest('#rare-toggle'))) return;
        panelCollapsed = !panelCollapsed;
        nearbyPanel.classList.toggle('collapsed', panelCollapsed);
        nearbyCaret.textContent = panelCollapsed ? '▸' : '▾';
      });
      rareToggle.addEventListener('click', function (event) {
        event.stopPropagation();
        rareOnly = !rareOnly;
        rareToggle.classList.toggle('on', rareOnly);
        refreshNearby();
      });
      trackSnap.addEventListener('click', function () {
        if (trackId) {
          capture(trackId);
          stopTrack();
        }
      });
      trackStop.addEventListener('click', stopTrack);

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
      map.on('move', scheduleArrow);
      map.on('rotate', scheduleArrow);
      map.on('pitch', scheduleArrow);

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
        refreshUi();
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
