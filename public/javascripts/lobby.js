// Lobby: pick a handle, then Quick Play (auto-match), Create (private link) or Join (code).
(function () {
  "use strict";
  var nameEl = document.getElementById("name");
  var quickBtn = document.getElementById("quick");
  var createBtn = document.getElementById("create");
  var joinForm = document.getElementById("joinform");
  var codeEl = document.getElementById("code");
  var errEl = document.getElementById("err");

  // Restore a saved handle, or offer a fun default.
  var saved = "";
  try { saved = localStorage.getItem("jacg-name") || ""; } catch (e) {}
  if (saved) nameEl.value = saved;
  else nameEl.placeholder = "PLAYER-" + Math.floor(1000 + Math.random() * 9000);

  // Time-control chips (persisted, sent to the room on connect).
  var tcChips = document.getElementById("tcChips");
  var savedTc = "300";
  try { savedTc = localStorage.getItem("jacg-tc") || "300"; } catch (e) {}
  function setTc(v) {
    try { localStorage.setItem("jacg-tc", v); } catch (e) {}
    Array.prototype.forEach.call(tcChips.querySelectorAll(".tc-chip"), function (c) {
      c.classList.toggle("active", c.getAttribute("data-tc") === v);
    });
  }
  tcChips.addEventListener("click", function (e) {
    var chip = e.target.closest ? e.target.closest(".tc-chip") : null;
    if (chip) setTc(chip.getAttribute("data-tc"));
  });
  setTc(savedTc);

  function saveName() {
    var v = nameEl.value.trim() || nameEl.placeholder;
    try { localStorage.setItem("jacg-name", v); } catch (e) {}
    return v;
  }

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function go(code) {
    saveName();
    location.href = "/game/" + encodeURIComponent(code);
  }

  function busy(btn, label) {
    btn.dataset.label = btn.textContent;
    btn.textContent = label;
    btn.disabled = true;
  }
  function unbusy(btn) {
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
    btn.disabled = false;
  }

  quickBtn.addEventListener("click", function () {
    busy(quickBtn, "Finding a game…");
    errEl.hidden = true;
    fetch("/api/quickmatch")
      .then(function (r) { return r.json(); })
      .then(function (d) { go(d.code); })
      .catch(function () { unbusy(quickBtn); showError("Couldn't reach the server. Try again."); });
  });

  createBtn.addEventListener("click", function () {
    busy(createBtn, "Creating…");
    errEl.hidden = true;
    fetch("/api/newcode")
      .then(function (r) { return r.json(); })
      .then(function (d) { go(d.code); })
      .catch(function () { unbusy(createBtn); showError("Couldn't reach the server. Try again."); });
  });

  // Uppercase the code as it's typed.
  codeEl.addEventListener("input", function () {
    codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  joinForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var code = codeEl.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      codeEl.classList.remove("shake");
      void codeEl.offsetWidth; // restart animation
      codeEl.classList.add("shake");
      showError("Enter a valid game code (4–8 letters/numbers).");
      return;
    }
    go(code);
  });
})();
