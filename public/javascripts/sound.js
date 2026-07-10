// Sound effects, synthesized with the WebAudio API (no audio assets to load).
// Honors window.__muted. Exposes window.Sfx and a back-compat window.playSound.
(function () {
  "use strict";
  var ctx = null;
  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    }
    return ctx;
  }
  // Browsers require a user gesture before audio can start — resume on first input.
  function resume() { var c = ac(); if (c && c.state === "suspended") c.resume(); }
  window.addEventListener("pointerdown", resume, { once: false });
  window.addEventListener("keydown", resume, { once: false });

  function tone(freq, dur, type, gain, when) {
    var c = ac();
    if (!c || window.__muted) return;
    var t = c.currentTime + (when || 0);
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.14, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  window.Sfx = {
    move: function () { tone(330, 0.07, "triangle", 0.11); },
    capture: function () { tone(200, 0.10, "sawtooth", 0.13); tone(95, 0.13, "square", 0.07, 0.02); },
    check: function () { tone(780, 0.09, "square", 0.11); tone(1040, 0.11, "square", 0.10, 0.08); },
    castle: function () { tone(300, 0.07, "triangle", 0.11); tone(440, 0.08, "triangle", 0.11, 0.08); },
    start: function () { tone(520, 0.09, "triangle", 0.11); tone(660, 0.12, "triangle", 0.11, 0.09); },
    win: function () { tone(660, 0.11, "triangle", 0.12); tone(880, 0.16, "triangle", 0.12, 0.11); },
    lose: function () { tone(300, 0.16, "sawtooth", 0.11); tone(200, 0.22, "sawtooth", 0.10, 0.13); },
    low: function () { tone(880, 0.06, "square", 0.10); },
  };

  // Back-compat: the old loss cue was playSound('/sounds/pacman.wav').
  window.playSound = function () { if (window.Sfx) window.Sfx.lose(); };
})();
