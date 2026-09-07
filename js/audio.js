/* Sound and voice.
 *
 * WebAudio beeps only — no files to load, so the whole thing still runs from a
 * pendrive with no network. Voice uses the browser's own speech synthesis and
 * silently does nothing when the machine has no Spanish voice installed.
 */
(function (global) {
  'use strict';

  var ctx = null;
  var on = true;

  function context() {
    if (!ctx) {
      var Ctor = global.AudioContext || global.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type, gain) {
    var ac = context();
    if (!ac) return;
    var osc = ac.createOscillator();
    var vol = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ac.currentTime + start);
    vol.gain.setValueAtTime(0.0001, ac.currentTime + start);
    vol.gain.exponentialRampToValueAtTime(gain || 0.18, ac.currentTime + start + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
    osc.connect(vol);
    vol.connect(ac.destination);
    osc.start(ac.currentTime + start);
    osc.stop(ac.currentTime + start + dur + 0.05);
  }

  /* Each cue has its own timbre so a child can tell them apart without looking:
   * x moves whistle sideways, y moves slide up or down. */
  var CUES = {
    xMove: function () { tone(330, 0, 0.12, 'square', 0.10); },
    yUp: function () { tone(440, 0, 0.10, 'sine'); tone(660, 0.07, 0.12, 'sine'); },
    yDown: function () { tone(440, 0, 0.10, 'sine'); tone(294, 0.07, 0.14, 'sine'); },
    pick: function () { tone(784, 0, 0.10, 'triangle'); tone(1047, 0.08, 0.16, 'triangle'); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.11, 0.22, 'triangle', 0.16); }); },
    crash: function () { tone(150, 0, 0.28, 'sawtooth', 0.14); },
    place: function () { tone(520, 0, 0.06, 'sine', 0.09); },
    remove: function () { tone(260, 0, 0.07, 'sine', 0.09); }
  };

  function play(name) {
    if (!on || !CUES[name]) return;
    try { CUES[name](); } catch (e) { /* audio is never worth breaking a lesson */ }
  }

  function speak(text) {
    if (!on || !global.speechSynthesis) return;
    try {
      global.speechSynthesis.cancel();
      var u = new global.SpeechSynthesisUtterance(text);
      u.lang = 'es-AR';
      u.rate = 0.95;
      global.speechSynthesis.speak(u);
    } catch (e) { /* no voice installed: stay quiet */ }
  }

  function setOn(value) {
    on = !!value;
    if (!on && global.speechSynthesis) global.speechSynthesis.cancel();
  }

  global.Sound = { play: play, speak: speak, setOn: setOn, isOn: function () { return on; } };
})(window);
