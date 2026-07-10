// Play a short sound effect unless the player muted sound.
function playSound(soundfile) {
  try {
    if (window.__muted) return;
    var a = new Audio(soundfile);
    a.volume = 0.5;
    a.play().catch(function () {});
  } catch (e) {}
}
