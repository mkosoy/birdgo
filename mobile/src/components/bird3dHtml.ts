import type { BirdRarity } from "../types";

export interface Bird3DOptions {
  commonName: string;
  rarity?: BirdRarity;
}

function serializedConfig(options: Bird3DOptions): string {
  return JSON.stringify({ ...options, rarity: options.rarity ?? "common" }).replace(/</g, "\\u003c");
}

export function buildBird3dHtml(options: Bird3DOptions): string {
  const config = serializedConfig(options);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body, #stage { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body { background: radial-gradient(circle at 50% 25%, #315a46 0%, #10231a 58%, #07110d 100%); touch-action: none; font-family: -apple-system, system-ui, sans-serif; }
    canvas { display: block; }
    .label { position: absolute; left: 10px; right: 10px; bottom: 8px; color: rgba(255,255,255,.78); font-size: 10px; line-height: 13px; text-align: center; pointer-events: none; text-shadow: 0 1px 4px #000; }
    .fallback { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; color: white; padding: 24px; text-align: center; }
  </style>
</head>
<body>
  <div id="stage"></div>
  <div id="fallback" class="fallback">3D bird preview unavailable offline.</div>
  <div class="label">Drag to inspect · stylized 3D bird, not species-accurate</div>
  <script src="https://unpkg.com/three@0.152.2/build/three.min.js"></script>
  <script>
    (function () {
      var config = ${config};
      if (!window.THREE) {
        document.getElementById('fallback').style.display = 'flex';
        return;
      }
      var THREE = window.THREE;
      var stage = document.getElementById('stage');
      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(0, 1.05, 4.2);
      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      stage.appendChild(renderer.domElement);

      function hash(value) {
        var h = 2166136261;
        for (var index = 0; index < value.length; index += 1) {
          h ^= value.charCodeAt(index);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      }
      var seed = hash((config.commonName || 'bird').toLowerCase());
      function pick(palette, offset) { return palette[(seed + offset) % palette.length]; }
      var rarityColors = {
        common: 0x7ea090,
        uncommon: 0x3ca66f,
        rare: 0x3c92e6,
        epic: 0x9563d8,
        legendary: 0xf2b734
      };
      var lowerName = (config.commonName || '').toLowerCase();
      var speciesKind = /heron|egret|crane|bittern/.test(lowerName) ? 'wader'
        : /\bowl/.test(lowerName) ? 'owl'
        : /\bhawk|eagle|falcon|osprey|kite|harrier/.test(lowerName) ? 'raptor'
        : /duck|goose|mallard|teal|merganser/.test(lowerName) ? 'waterfowl'
        : /hummingbird/.test(lowerName) ? 'hummingbird'
        : /woodpecker|flicker|sapsucker/.test(lowerName) ? 'woodpecker'
        : 'songbird';
      var naturalBodies = {
        wader: [0x6f8291, 0x88939a, 0xd8d4c7, 0x6d746c],
        owl: [0x806349, 0x6b5947, 0x9a8061, 0x5f5143],
        raptor: [0x684b32, 0x75543a, 0x4f4438, 0x8b6a45],
        waterfowl: [0x5d6c55, 0x7c6a4a, 0x526474, 0x8a7a58],
        hummingbird: [0x23775f, 0x2d8670, 0x3f7165, 0x4a756e],
        woodpecker: [0x3d4145, 0x5c5248, 0x6d5b47, 0x4a3f38],
        songbird: [0x8a704f, 0x6f7f72, 0x536f91, 0x9a7651, 0x6c6252, 0x526f95]
      };
      var naturalWings = {
        wader: [0x526675, 0x68767c, 0xbdb9aa],
        owl: [0x5c4433, 0x514438, 0x766048],
        raptor: [0x4b3425, 0x593f2c, 0x3f382f],
        waterfowl: [0x44513f, 0x5e5039, 0x3e5263],
        hummingbird: [0x1f5f50, 0x286d58, 0x315f56],
        woodpecker: [0x25292d, 0x3a342f, 0x4a3c34],
        songbird: [0x5d4937, 0x506254, 0x385777, 0x73543c]
      };
      var bodyColor = pick(naturalBodies[speciesKind] || naturalBodies.songbird, 3);
      var wingColor = pick(naturalWings[speciesKind] || naturalWings.songbird, 11);
      var bellyColor = pick([0xe6d7b7, 0xd9e5df, 0xe7c9a9, 0xd8cec0], 7);
      if (/yellow|goldfinch|warbler|meadowlark/.test(lowerName)) bellyColor = 0xe6c84f;
      if (/red|cardinal|tanager/.test(lowerName)) bodyColor = 0xa93e32;
      if (/blue|jay|bluebird/.test(lowerName) && speciesKind === "songbird") bodyColor = 0x3e6f9e;
      if (/black|crow|raven|blackbird/.test(lowerName)) bodyColor = 0x252a2c;
      if (/white|egret/.test(lowerName)) bodyColor = 0xd9ddd5;
      var rarityColor = rarityColors[config.rarity] || rarityColors.common;
      function material(color, roughness, metalness) {
        return new THREE.MeshStandardMaterial({ color: color, roughness: roughness == null ? 0.62 : roughness, metalness: metalness || 0.03 });
      }
      function mesh(geometry, mat, position, scale) {
        var item = new THREE.Mesh(geometry, mat);
        if (position) item.position.set(position[0], position[1], position[2]);
        if (scale) item.scale.set(scale[0], scale[1], scale[2]);
        item.castShadow = true;
        return item;
      }

      var bird = new THREE.Group();
      var isWader = speciesKind === 'wader';
      var isOwl = speciesKind === 'owl';
      var isRaptor = speciesKind === 'raptor';
      var isWaterfowl = speciesKind === 'waterfowl';
      var isHummingbird = speciesKind === 'hummingbird';
      var isWoodpecker = speciesKind === 'woodpecker';
      var bodyScale = isWader ? [0.58, 0.56, 1.1] : isOwl ? [0.86, 0.72, 0.9] : isWaterfowl ? [0.88, 0.58, 1.05] : isHummingbird ? [0.6, 0.52, 0.88] : [0.78, 0.62, 1.02];
      var body = mesh(new THREE.SphereGeometry(0.72, 40, 28), material(bodyColor), [0, 0, 0], bodyScale);
      var belly = mesh(new THREE.SphereGeometry(0.52, 32, 20), material(bellyColor), [0, -0.1, 0.42], [0.62, 0.48, 0.58]);
      var headY = isWader ? 0.78 : isOwl ? 0.5 : 0.48;
      var headZ = isWader ? 0.66 : 0.58;
      var headScale = isOwl ? [1.15, 1.04, 1.02] : isHummingbird ? [0.82, 0.78, 0.82] : [1, 0.95, 1];
      var head = mesh(new THREE.SphereGeometry(0.43, 36, 24), material(bodyColor), [0, headY, headZ], headScale);
      var beakRadius = isWaterfowl ? 0.2 : isRaptor ? 0.17 : isHummingbird ? 0.07 : isWader ? 0.09 : 0.15;
      var beakLength = isWader ? 0.82 : isHummingbird ? 1.05 : isRaptor ? 0.4 : isWaterfowl ? 0.36 : 0.48;
      var beakColor = isRaptor || isWader ? 0x2f2b24 : isHummingbird ? 0x25221e : 0xf0a22e;
      var beak = mesh(new THREE.ConeGeometry(beakRadius, beakLength, 24), material(beakColor, 0.48), [0, headY - 0.03, headZ + 0.39 + beakLength * 0.12], isWaterfowl ? [1.45, 0.62, 1] : undefined);
      beak.rotation.x = Math.PI / 2;
      var tail = mesh(new THREE.ConeGeometry(0.3, isWader ? 0.62 : isWaterfowl ? 0.62 : 0.9, 4), material(wingColor), [0, -0.05, -0.86], [1, 0.52, 1]);
      tail.rotation.x = -Math.PI / 2;
      tail.rotation.z = Math.PI / 4;
      bird.add(body, belly, head, beak, tail);
      if (isWader) {
        var neck = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.72, 18), material(bodyColor), [0, 0.42, 0.5]);
        neck.rotation.x = -0.28;
        bird.add(neck);
      }
      if (isRaptor) {
        var hook = mesh(new THREE.ConeGeometry(0.075, 0.2, 16), material(0x211d18, 0.45), [0, headY - 0.08, headZ + 0.7]);
        hook.rotation.x = Math.PI * 0.72;
        bird.add(hook);
      }
      if (isHummingbird) {
        var gorget = mesh(new THREE.SphereGeometry(0.12, 18, 12), new THREE.MeshStandardMaterial({ color: 0xd13f68, roughness: 0.24, metalness: 0.55, emissive: 0x310814 }), [0, 0.28, 0.72], [1.1, 0.75, 0.42]);
        bird.add(gorget);
      }
      if (isWoodpecker) {
        var crown = mesh(new THREE.SphereGeometry(0.17, 18, 12), material(0xb7352d, 0.5), [0, 0.79, 0.48], [0.9, 0.46, 0.7]);
        bird.add(crown);
      }

      var wingScale = isRaptor ? [0.22, 0.5, 1.05] : isWader ? [0.16, 0.5, 1.0] : isHummingbird ? [0.12, 0.34, 0.66] : [0.18, 0.42, 0.82];
      var leftWing = mesh(new THREE.SphereGeometry(0.48, 28, 16), material(wingColor), [-0.55, 0.03, -0.05], wingScale);
      var rightWing = mesh(new THREE.SphereGeometry(0.48, 28, 16), material(wingColor), [0.55, 0.03, -0.05], wingScale);
      leftWing.rotation.z = -0.32;
      rightWing.rotation.z = 0.32;
      bird.add(leftWing, rightWing);

      [-1, 1].forEach(function (side) {
        var eyeSize = isOwl ? 0.092 : 0.055;
        var eye = mesh(new THREE.SphereGeometry(eyeSize, 16, 12), material(0x111513, 0.3), [side * (isOwl ? 0.2 : 0.17), headY + 0.1, headZ + 0.36]);
        var shine = mesh(new THREE.SphereGeometry(0.016, 8, 8), material(0xffffff, 0.2), [side * (isOwl ? 0.18 : 0.152), headY + 0.118, headZ + 0.402]);
        var legLength = isWader ? 0.82 : isWaterfowl ? 0.25 : 0.44;
        var leg = mesh(new THREE.CylinderGeometry(0.025, 0.025, legLength, 10), material(isWader ? 0x3d342b : 0xd68d33, 0.55), [side * 0.2, -0.58 - (legLength - 0.44) / 2, 0.16]);
        bird.add(eye, shine, leg);
        if (isOwl) {
          var facialDisc = mesh(new THREE.SphereGeometry(0.14, 18, 12), material(0xd7c7a6, 0.7), [side * 0.17, headY + 0.09, headZ + 0.31], [1, 1.18, 0.24]);
          bird.add(facialDisc);
        }
      });

      var crestCount = isHummingbird || isWader ? 0 : config.rarity === 'legendary' ? 5 : config.rarity === 'epic' ? 4 : 3;
      for (var crestIndex = 0; crestIndex < crestCount; crestIndex += 1) {
        var crest = mesh(new THREE.ConeGeometry(0.055, 0.24, 10), material(rarityColor, 0.42), [(crestIndex - (crestCount - 1) / 2) * 0.09, 0.86, 0.48 - Math.abs(crestIndex - 1) * 0.025]);
        crest.rotation.x = -0.25;
        bird.add(crest);
      }

      var halo = new THREE.Mesh(
        new THREE.TorusGeometry(1.05, 0.018, 10, 80),
        new THREE.MeshBasicMaterial({ color: rarityColor, transparent: true, opacity: config.rarity === 'common' ? 0.18 : 0.46 })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = -0.82;
      scene.add(halo);

      var particles = [];
      if (config.rarity === 'epic' || config.rarity === 'legendary') {
        for (var particleIndex = 0; particleIndex < 18; particleIndex += 1) {
          var particle = mesh(new THREE.SphereGeometry(0.018 + (particleIndex % 3) * 0.006, 8, 8), new THREE.MeshBasicMaterial({ color: rarityColor }), [0, 0, 0]);
          particle.userData.angle = particleIndex * 0.72;
          particle.userData.radius = 0.9 + (particleIndex % 5) * 0.08;
          particle.userData.height = -0.35 + (particleIndex % 6) * 0.19;
          particles.push(particle);
          scene.add(particle);
        }
      }

      bird.position.y = 0.08;
      bird.rotation.x = 0.05;
      scene.add(bird);
      scene.add(new THREE.AmbientLight(0xffffff, 0.62));
      var keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
      keyLight.position.set(3, 4, 5);
      keyLight.castShadow = true;
      scene.add(keyLight);
      var rimLight = new THREE.DirectionalLight(rarityColor, 0.85);
      rimLight.position.set(-3, 1.5, -3);
      scene.add(rimLight);

      var targetRotY = -0.35;
      var targetRotX = 0.05;
      var dragging = false;
      var lastX = 0;
      var lastY = 0;
      function pointerDown(event) {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
      }
      function pointerMove(event) {
        if (!dragging) return;
        targetRotY += (event.clientX - lastX) * 0.012;
        targetRotX = Math.max(-0.75, Math.min(0.75, targetRotX + (event.clientY - lastY) * 0.007));
        lastX = event.clientX;
        lastY = event.clientY;
      }
      function pointerUp() { dragging = false; }
      stage.addEventListener('pointerdown', pointerDown);
      window.addEventListener('pointermove', pointerMove);
      window.addEventListener('pointerup', pointerUp);
      window.addEventListener('pointercancel', pointerUp);

      function resize() {
        var width = Math.max(1, stage.clientWidth);
        var height = Math.max(1, stage.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, true);
      }
      window.addEventListener('resize', resize);
      resize();

      var start = performance.now();
      function frame(now) {
        var time = (now - start) / 1000;
        if (!dragging) targetRotY += 0.004;
        bird.rotation.y += (targetRotY - bird.rotation.y) * 0.16;
        bird.rotation.x += (targetRotX - bird.rotation.x) * 0.16;
        bird.position.y = 0.08 + Math.sin(time * 2.1) * 0.045;
        var flap = Math.sin(time * 5.2) * 0.14;
        leftWing.rotation.z = -0.32 - flap;
        rightWing.rotation.z = 0.32 + flap;
        halo.rotation.z = time * 0.35;
        particles.forEach(function (particle, index) {
          var angle = particle.userData.angle + time * (0.35 + index * 0.006);
          particle.position.set(Math.cos(angle) * particle.userData.radius, particle.userData.height + Math.sin(time * 1.8 + index) * 0.035, Math.sin(angle) * particle.userData.radius);
        });
        camera.lookAt(0, 0.08, 0);
        renderer.render(scene, camera);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })();
  </script>
</body>
</html>`;
}
