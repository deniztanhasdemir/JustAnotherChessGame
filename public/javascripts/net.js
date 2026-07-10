// Networking + UI glue for the game screen.
// Talks the JSON room protocol to the Worker, and drives the board through
// window.Engine and the panels/overlays directly. The chess rules live in app.js.
(function () {
  "use strict";

  // ---- element handles ----
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    conn: $("conn"), connText: $("connText"),
    codeLabel: $("codeLabel"), copyInvite: $("copyInvite"),
    turn: $("turn"), board: $("board"),
    oppName: $("oppName"), oppSide: $("oppSide"), oppTray: $("oppTray"),
    youName: $("youName"), youSide: $("youSide"), youTray: $("youTray"),
    moveList: $("moveList"), impossible: $("impossibleCounter"),
    resign: $("resignBtn"), sound: $("soundBtn"),
    overlay: $("overlay"), ovTitle: $("ovTitle"), ovMsg: $("ovMsg"),
    ovInvite: $("ovInvite"), ovCode: $("ovCode"), ovCopy: $("ovCopy"),
    ovActions: $("ovActions"), rematch: $("rematchBtn"),
  };

  // ---- state ----
  var code = (location.pathname.split("/")[2] || "").toUpperCase();
  var myName = "Player";
  try { myName = (localStorage.getItem("jacg-name") || "Player").slice(0, 16); } catch (e) {}
  var ws = null;
  var mySide = null;      // 0 white, 1 black
  var started = false;    // both players present
  var over = false;
  var clockStarted = false;
  var moveNo = 0;
  var resignArmed = false;

  var FILES = ["", "a", "b", "c", "d", "e", "f", "g", "h"];
  function algebraic(sq) { var p = String(sq).split("_"); return FILES[+p[0]] + p[1]; }
  function isWhiteKey(k) { return String(k).indexOf("white") === 0; }

  // ---- connection status pill ----
  function setConn(state, text) {
    els.conn.className = "pill " + state; // on | off | wait
    els.connText.textContent = text;
  }

  // ---- turn banner (called by the engine after every move) ----
  function turnChanged() {
    if (over || !started) return;
    if (window.canPlay) { els.turn.className = "turn-banner you"; els.turn.textContent = "Your move"; }
    else { els.turn.className = "turn-banner opp"; els.turn.textContent = "Opponent's move"; }
  }

  // ---- move history + captured trays (called by the engine's move/capture) ----
  function record(mover, from, to, victimKey) {
    var white = isWhiteKey(mover);
    var pieces = window.main && window.main.variables.pieces;
    var glyph = pieces && pieces[mover] ? pieces[mover].img : "";
    moveNo++;
    var li = document.createElement("li");
    li.innerHTML = '<span class="n">' + moveNo + '</span>' +
      '<span class="g ' + (white ? "w" : "b") + '">' + glyph + '</span>' +
      '<span class="d">' + algebraic(to) + '</span>';
    els.moveList.appendChild(li);
    els.moveList.scrollTop = els.moveList.scrollHeight;

    if (victimKey && victimKey !== "null" && pieces && pieces[victimKey]) {
      var vGlyph = pieces[victimKey].img;
      var moverSide = white ? 0 : 1;
      var tray = moverSide === mySide ? els.youTray : els.oppTray;
      var span = document.createElement("span");
      span.innerHTML = vGlyph;
      tray.appendChild(span);
    }
  }
  window.GameUI = { record: record, turnChanged: turnChanged };

  // ---- overlays ----
  function showOverlay(opts) {
    els.ovTitle.textContent = opts.title || "";
    els.ovTitle.className = "ov-title wordmark" + (opts.result ? " " + opts.result : "");
    els.ovMsg.textContent = opts.msg || "";
    els.ovInvite.hidden = !opts.invite;
    els.ovActions.hidden = !opts.actions;
    if (opts.rematch === false) els.rematch.style.display = "none";
    else if (opts.actions) els.rematch.style.display = "";
    els.overlay.hidden = false;
  }
  function hideOverlay() { els.overlay.hidden = true; }

  function inviteLink() { return location.origin + "/game/" + code; }

  function flashCopied(btn, done) {
    var old = btn.textContent;
    btn.textContent = done || "Copied!";
    btn.classList.add("copied");
    setTimeout(function () { btn.textContent = old; btn.classList.remove("copied"); }, 1400);
  }
  function copyLink(btn, doneLabel) {
    var link = inviteLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () { flashCopied(btn, doneLabel); }, function () { prompt("Copy this link:", link); });
    } else { prompt("Copy this link:", link); }
  }

  // ---- side / player cards ----
  function sideChip(el, side) {
    el.textContent = side === 0 ? "White" : "Black";
    el.className = "pc-side " + (side === 0 ? "w" : "b");
  }

  function beginGame(whiteName, blackName) {
    started = true; over = false;
    hideOverlay();
    var myName2 = mySide === 0 ? whiteName : blackName;
    var oppName2 = mySide === 0 ? blackName : whiteName;
    els.youName.textContent = myName2 + " (you)";
    els.oppName.textContent = oppName2;
    sideChip(els.youSide, mySide);
    sideChip(els.oppSide, 1 - mySide);
    if (mySide === 1) els.board.classList.add("flip");
    else els.board.classList.remove("flip");
    window.Engine.start(mySide);
    turnChanged();
    els.resign.disabled = false;
    resetResign();
    if (!clockStarted && typeof window.timer === "function") { window.timer(); clockStarted = true; }
    setConn("on", "Live");
  }

  // ---- resign (two-click confirm) ----
  function resetResign() { resignArmed = false; els.resign.textContent = "Resign"; els.resign.classList.remove("armed"); }
  els.resign.addEventListener("click", function () {
    if (over || !started) return;
    if (!resignArmed) { resignArmed = true; els.resign.textContent = "Confirm resign?"; setTimeout(resetResign, 3000); return; }
    send({ t: "resign" });
    resetResign();
  });

  // ---- sound toggle ----
  window.__muted = false;
  els.sound.addEventListener("click", function () {
    window.__muted = !window.__muted;
    els.sound.classList.toggle("muted", window.__muted);
    els.sound.innerHTML = window.__muted ? "&#128263; Muted" : "&#128266; Sound";
  });

  // ---- copy buttons ----
  els.codeLabel.textContent = code || "·····";
  els.copyInvite.addEventListener("click", function () { copyLink(els.copyInvite); });
  els.ovCopy.addEventListener("click", function () { copyLink(els.ovCopy, "Copied!"); });
  els.rematch.addEventListener("click", function () {
    send({ t: "rematch" });
    els.rematch.disabled = true;
    els.rematch.textContent = "Waiting for opponent…";
  });

  // ---- socket ----
  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

  function connect() {
    var proto = location.protocol === "https:" ? "wss://" : "ws://";
    var url = proto + location.host + "/ws?g=" + encodeURIComponent(code) + "&name=" + encodeURIComponent(myName);
    setConn("wait", "Connecting");
    ws = new WebSocket(url);
    ws.addEventListener("open", function () { setConn("on", "Connected"); });
    ws.addEventListener("message", function (e) {
      var m; try { m = JSON.parse(e.data); } catch (err) { return; }
      handle(m);
    });
    ws.addEventListener("close", function () {
      if (over) return;
      setConn("off", "Disconnected");
      showOverlay({ title: "Disconnected", msg: "Lost connection to the game.", actions: true, rematch: false });
    });
    ws.addEventListener("error", function () { setConn("off", "Connection error"); });
  }

  function handle(m) {
    switch (m.t) {
      case "assigned":
        mySide = m.side;
        els.youName.textContent = myName + " (you)";
        sideChip(els.youSide, mySide);
        if (mySide === 1) els.board.classList.add("flip");
        break;

      case "waiting":
        setConn("wait", "Waiting");
        els.turn.className = "turn-banner opp";
        els.turn.textContent = "Waiting for opponent";
        els.ovCode.textContent = code;
        showOverlay({ title: "Game ready", msg: "You're in. Share this game so a friend can join:", invite: true });
        break;

      case "ready":
        beginGame(m.white, m.black);
        break;

      case "move":
        window.Engine.applyMove(m.kind, m.piece, m.to);
        break;

      case "gameover":
        endGame(m.reason, m.winner === mySide);
        break;

      case "opponent_left":
        if (over) break;
        over = true; started = false;
        window.Engine.stop();
        els.turn.className = "turn-banner win";
        els.turn.textContent = "You win";
        els.resign.disabled = true;
        showOverlay({ title: "You win!", result: "win", msg: "Your opponent left the game.", actions: true, rematch: false });
        setConn("off", "Opponent left");
        break;

      case "rematch_offer":
        els.rematch.textContent = "Accept rematch ✓";
        els.rematch.classList.add("btn-primary");
        break;

      case "rematch_start":
        doRematch(m.side);
        break;

      case "full":
        showOverlay({ title: "Game full", msg: "This game already has two players. Start your own from the lobby.", actions: true, rematch: false });
        setConn("off", "Full");
        break;
    }
  }

  function endGame(reason, iWon) {
    over = true; started = false;
    window.Engine.stop();
    els.resign.disabled = true;
    resetResign();
    els.turn.className = "turn-banner " + (iWon ? "win" : "lose");
    els.turn.textContent = iWon ? "You win" : "You lose";
    var msg = "";
    if (reason === "checkmate") msg = iWon ? "Checkmate. Well played." : "Checkmate. Better luck next time.";
    else if (reason === "resign") msg = iWon ? "Your opponent resigned." : "You resigned.";
    else if (reason === "impossible") msg = iWon ? "Your opponent made 3 illegal moves." : "You made 3 illegal moves.";
    if (!iWon) playSound("/sounds/pacman.wav");
    els.rematch.disabled = false;
    els.rematch.textContent = "Rematch";
    els.rematch.classList.add("btn-primary");
    showOverlay({ title: iWon ? "You win!" : "You lose", result: iWon ? "win" : "lose", msg: msg, actions: true });
  }

  function doRematch(newSide) {
    mySide = newSide;
    over = false;
    moveNo = 0;
    els.moveList.innerHTML = "";
    els.youTray.innerHTML = "";
    els.oppTray.innerHTML = "";
    els.rematch.disabled = false;
    if (typeof window.seconds !== "undefined") { window.seconds = 0; window.minutes = 0; }
    // player cards get refreshed by the "ready" that follows rematch_start
    if (mySide === 1) els.board.classList.add("flip"); else els.board.classList.remove("flip");
    window.Engine.reset(mySide);
    started = true;
    turnChanged();
    els.resign.disabled = false;
    hideOverlay();
  }

  // Called by app.js once the board is set up and the engine is ready.
  window.NET = {
    sendMove: function (kind, piece, from, to) { send({ t: "move", kind: kind, piece: piece, from: from, to: to }); },
    sendEnd: function (which) { send({ t: which }); }, // "checkmate" | "impossible"
    ready: function () {
      if (!/^[A-Z0-9]{4,8}$/.test(code)) {
        showOverlay({ title: "Bad link", msg: "This game link looks invalid. Head back and start a new game.", actions: true, rematch: false });
        return;
      }
      connect();
    },
  };
})();
