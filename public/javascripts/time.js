var seconds = 0;
var minutes = 0;
var timerId = null;

function renderClock() {
  var el = document.getElementById("timeDiv");
  if (!el) return;
  var mm = (minutes < 10 ? "0" : "") + minutes;
  var ss = (seconds < 10 ? "0" : "") + seconds;
  el.innerHTML = mm + "." + ss;
}

function timer() {
  if (timerId) return; // already running
  timerId = setInterval(function () {
    seconds++;
    if (seconds >= 60) { seconds = 0; minutes++; }
    renderClock();
  }, 1000);
}

function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

function resetTimer() {
  seconds = 0;
  minutes = 0;
  renderClock();
}
