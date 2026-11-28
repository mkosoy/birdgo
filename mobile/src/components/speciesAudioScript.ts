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
            }).catch(function (error) {
              if (!error || error.name !== 'NotAllowedError') {
                var retryAudio = currentAudio;
                var retryFallback = retryAudio ? useFallbackForAudio(retryAudio) : null;
                if (retryFallback) {
                  retryFallback.catch(showNoAudio);
                  return;
                }
              }
              button.textContent = 'Listen';
            });
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
        var directSound = null;
        if (bird.audioUrl) {
          var probe = document.createElement('audio');
          var isFlac = String(bird.audioUrl).split('?')[0].toLowerCase().slice(-5) === '.flac';
          if (!isFlac || probe.canPlayType('audio/flac')) {
            var clipUrl = bird.audioUrl;
            if (typeof bird.audioStartTime === 'number' && typeof bird.audioEndTime === 'number' && bird.audioEndTime > bird.audioStartTime) {
              clipUrl += '#t=' + bird.audioStartTime + ',' + bird.audioEndTime;
            }
            directSound = {
              url: clipUrl,
              startTime: bird.audioStartTime,
              endTime: bird.audioEndTime,
              credit: 'Live detection audio · BirdWeather'
            };
          }
        }

        function guideSoundRequest() {
          return fetchSpeciesGuide(bird).then(function (guide) {
            var sound = guide && Array.isArray(guide.sounds) && guide.sounds[0];
            if (!sound || !sound.url) throw new Error('no species recording');
            return {
              url: sound.url,
              credit: 'Audio · ' + (sound.recordist || 'Unknown recordist') + (sound.license ? ' · ' + sound.license : '')
            };
          });
        }

        function finishAudioPlayback(audio) {
          if (currentAudio === audio) {
            currentAudio = null;
            currentAudioKey = null;
            currentAudioAttribution = '';
          }
          resetListenButtons();
        }

        function showNoAudio() {
          if (requestId !== audioRequest) return;
          stopBirdAudio();
          button.disabled = false;
          button.textContent = 'No audio';
          if (credit) {
            credit.textContent = 'No licensed species recording is available right now.';
            credit.classList.add('on');
          }
        }

        function useFallbackForAudio(audio) {
          var fallbackRequest = audio.birdgoFallbackRequest;
          if (!fallbackRequest || audio.birdgoFallbackUsed) return null;
          audio.birdgoFallbackUsed = true;
          if (currentAudio === audio) {
            currentAudio = null;
            currentAudioKey = null;
            currentAudioAttribution = '';
          }
          try { audio.pause(); } catch (error) { /* noop */ }
          return fallbackRequest().then(function (fallbackSound) {
            return playSelectedSound(fallbackSound, null);
          });
        }

        function playSelectedSound(sound, fallbackRequest) {
          if (requestId !== audioRequest) return undefined;
          var audio = new Audio(sound.url);
          audio.birdgoFallbackRequest = fallbackRequest;
          audio.birdgoFallbackUsed = false;
          currentAudio = audio;
          currentAudioKey = bird.id;
          audio.addEventListener('ended', function () { finishAudioPlayback(audio); });
          audio.addEventListener('error', function () {
            if (currentAudio !== audio) return;
            var fallback = useFallbackForAudio(audio);
            if (fallback) fallback.catch(showNoAudio);
            else showNoAudio();
          });
          if (typeof sound.startTime === 'number' && typeof sound.endTime === 'number' && sound.endTime > sound.startTime) {
            audio.addEventListener('loadedmetadata', function () {
              if (audio.currentTime < sound.startTime - 0.5 || audio.currentTime >= sound.endTime) {
                try { audio.currentTime = sound.startTime; } catch (error) { /* Some browsers expose live-detection clips as unseekable streams. */ }
              }
            });
            audio.addEventListener('timeupdate', function () {
              if (audio.currentTime >= sound.endTime - 0.05) {
                audio.pause();
                finishAudioPlayback(audio);
              }
            });
          }
          var playbackBlocked = false;
          return audio.play().then(function () {
            if (requestId !== audioRequest) {
              audio.pause();
              return undefined;
            }
            button.disabled = false;
            button.textContent = 'Pause';
            currentAudioAttribution = sound.credit;
            if (credit) {
              credit.textContent = currentAudioAttribution;
              credit.classList.add('on');
            }
            return undefined;
          }, function (error) {
            playbackBlocked = Boolean(error && error.name === 'NotAllowedError');
            throw error;
          }).catch(function (error) {
            if (!playbackBlocked) {
              var fallback = useFallbackForAudio(audio);
              if (fallback) return fallback;
              throw error;
            }
            if (requestId !== audioRequest) return undefined;
            button.disabled = false;
            button.textContent = 'Tap to play';
            currentAudioAttribution = sound.credit;
            if (credit) {
              credit.textContent = 'Audio ready · tap again to allow playback';
              credit.classList.add('on');
            }
            return undefined;
          });
        }

        var initialSoundRequest = directSound ? Promise.resolve(directSound) : guideSoundRequest();
        initialSoundRequest
          .then(function (sound) {
            return playSelectedSound(sound, directSound ? guideSoundRequest : null);
          })
          .catch(showNoAudio);
      }

`;
}
