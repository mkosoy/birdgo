export function speciesAudioScript(): string {
  return `      function stopBirdAudio() {
        audioRequest += 1;
        if (currentAudio) {
          try { currentAudio.pause(); } catch (error) { /* noop */ }
        }
        currentAudio = null;
        currentAudioKey = null;
        currentAudioAttribution = '';
        resetListenButtons();
      }

      function speciesGuideUrl(bird) {
        var params = new URLSearchParams();
        if (bird.sciName) params.set('sciName', bird.sciName);
        if (bird.comName) params.set('commonName', bird.comName);
        return apiBaseUrl + '/api/species/guide?' + params.toString();
      }

      function speciesGuideCacheKey(bird) {
        return String((bird.sciName || '') + '|' + (bird.comName || '')).toLowerCase();
      }

      function fetchSpeciesGuide(bird) {
        var key = speciesGuideCacheKey(bird);
        if (!guideCache[key]) {
          var request = fetch(speciesGuideUrl(bird))
            .then(function (response) { if (!response.ok) throw new Error('guide unavailable'); return response.json(); });
          guideCache[key] = request;
          request.catch(function () {
            if (guideCache[key] === request) delete guideCache[key];
          });
        }
        return guideCache[key];
      }

      function prefetchSpeciesGuide(bird) {
        fetchSpeciesGuide(bird).catch(function () { /* Listen will surface the failure if needed. */ });
      }

      function resetListenButtons() {
        document.querySelectorAll('[data-action="listen"]').forEach(function (button) {
          button.disabled = false;
          button.textContent = 'Listen';
        });
      }

      function toggleBirdAudio(bird, button, popupElement) {
        if (!button) return;
        var credit = popupElement ? popupElement.querySelector('[data-audio-credit]') : null;
        if (currentAudio && currentAudioKey === bird.id) {
          if (currentAudio.paused) {
            currentAudio.play().then(function () {
              button.textContent = 'Pause';
              if (credit && currentAudioAttribution) {
                credit.textContent = currentAudioAttribution;
                credit.classList.add('on');
              }
            }).catch(function () { button.textContent = 'Listen'; });
          } else {
            currentAudio.pause();
            button.textContent = 'Listen';
          }
          return;
        }
        stopBirdAudio();
        var requestId = audioRequest;
        button.disabled = true;
        button.textContent = 'Loading';
        fetchSpeciesGuide(bird)
          .then(function (guide) {
            if (requestId !== audioRequest) return;
            var sound = guide && Array.isArray(guide.sounds) && guide.sounds[0];
            if (!sound || !sound.url) throw new Error('no species recording');
            var audio = new Audio(sound.url);
            currentAudio = audio;
            currentAudioKey = bird.id;
            audio.addEventListener('ended', function () {
              if (currentAudio === audio) {
                currentAudio = null;
                currentAudioKey = null;
              }
              button.textContent = 'Listen';
            });
            var playbackBlocked = false;
            return audio.play().then(function () {
              if (requestId !== audioRequest) {
                audio.pause();
                return;
              }
              button.disabled = false;
              button.textContent = 'Pause';
              currentAudioAttribution = 'Audio · ' + (sound.recordist || 'Unknown recordist') + (sound.license ? ' · ' + sound.license : '');
              if (credit) {
                credit.textContent = currentAudioAttribution;
                credit.classList.add('on');
              }
            }, function (error) {
              playbackBlocked = Boolean(error && error.name === 'NotAllowedError');
              throw error;
            }).catch(function (error) {
              if (!playbackBlocked) throw error;
              if (requestId !== audioRequest) return;
              button.disabled = false;
              button.textContent = 'Tap to play';
              currentAudioAttribution = 'Audio · ' + (sound.recordist || 'Unknown recordist') + (sound.license ? ' · ' + sound.license : '');
              if (credit) {
                credit.textContent = 'Audio ready · tap again to allow playback' + (sound.license ? ' · ' + sound.license : '');
                credit.classList.add('on');
              }
            });
          })
          .catch(function () {
            if (requestId !== audioRequest) return;
            stopBirdAudio();
            button.disabled = false;
            button.textContent = 'No audio';
            if (credit) {
              credit.textContent = 'No licensed species recording is available right now.';
              credit.classList.add('on');
            }
          });
      }

`;
}
