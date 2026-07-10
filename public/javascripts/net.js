// Networking + UI glue for the game screen.
// Talks the JSON room protocol to the Worker, drives the board through window.Engine,
// and updates the panels/overlays. The chess rules live in app.js.
(function () {
  "use strict";

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

  var code = (location.pathname.split("/")[2] || "").toUpperCase();
  var myName = "Player";
  try { myName = (localStorage.getItem("jacg-name") || "Player").slice(0, 16); } catch (e) {}
  var ws = null;
  var mySide = null;
  var started = false;
  var over = false;
  var rejected = false;      // room full / bad link — do not reconnect
  var reconnecting = false;
  var attempts = 0;
  var MAX_ATTEMPTS = 6;
  var moveNo = 0;
  var resignArmed = false;

  // ---- validation of anything arriving from the network ----
  var SQ = /^[1-8]_[1-8]$/;
  var PIECE = /^(white|black)(King|Queen|Bishop|Knight|Rook|Pawn)[1-8]?$/;
  function validMove(m) {
    return m && (m.kind === "move" || m.kind === "castle" || m.kind === "capture") &&
      typeof m.piece === "string" && PIECE.test(m.piece) &&
      typeof m.to === "string" && SQ.test(m.to);
  }

  var FILES = ["", "a", "b", "c", "d", "e", "f", "g", "h"];
  function algebraic(sq) { var p = String(sq).split("_"); return (FILES[+p[0]] || "?") + (p[1] || ""); }
  function isWhiteKey(k) { return String(k).indexOf("white") === 0; }

  function setConn(state, text) { els.conn.className = "pill " + state; els.connText.textContent = text; }

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
    var n = document.createElement("span"); n.className = "n"; n.textContent = moveNo;
    var g = document.createElement("span"); g.className = "g " + (white ? "w" : "b"); g.innerHTML = glyph;
    var d = document.createElement("span"); d.className = "d"; d.textContent = algebraic(to); // textContent = no HTML injection
    li.appendChild(n); li.appendChild(g); li.appendChild(d);
    els.moveList.appendChild(li);
    els.moveList.scrollTop = els.moveList.scrollHeight;

    if (victimKey && victimKey !== "null" && pieces && pieces[victimKey]) {
      var tray = (white ? 0 : 1) === mySide ? els.youTray : els.oppTray;
      var span = document.createElement("span");
      span.innerHTML = pieces[victimKey].img; // static piece glyph entity
      tray.appendChild(span);
    }
  }
  window.GameUI = { record: record, turnChanged: turnChanged };

  // ---- overlays ----
  function showOverlay(o) {
    els.ovTitle.textContent = o.title || "";
    els.ovTitle.className = "ov-title wordmark" + (o.result ? " " + o.result : "");
    els.ovMsg.textContent = o.msg || "";
    els.ovInvite.hidden = !o.invite;
    els.ovActions.hidden = !o.actions;
    els.rematch.style.display = o.actions && o.rematch !== false ? "" : "none";
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
  function copyLink(btn, done) {
    var link = inviteLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () { flashCopied(btn, done); }, function () { prompt("Copy this link:", link); });
    } else { prompt("Copy this link:", link); }
  }

  function sideChip(el, side) { el.textContent = side === 0 ? "White" : "Black"; el.className = "pc-side " + (side === 0 ? "w" : "b"); }

  function setCards(whiteName, blackName) {
    els.youName.textContent = (mySide === 0 ? whiteName : blackName) + " (you)";
    els.oppName.textContent = mySide === 0 ? blackName : whiteName;
    sideChip(els.youSide, mySide);
    sideChip(els.oppSide, 1 - mySide);
  }
  function applyFlip() { els.board.classList.toggle("flip", mySide === 1); }

  function startClock() {
    if (typeof window.resetTimer === "function") window.resetTimer();
    if (typeof window.timer === "function") window.timer();
  }

  // Fresh game (first game or after rematch): rebuild the board and UI.
  function beginGame(whiteName, blackName) {
    started = true; over = false;
    hideOverlay();
    els.moveList.innerHTML = ""; els.youTray.innerHTML = ""; els.oppTray.innerHTML = ""; moveNo = 0;
    setCards(whiteName, blackName);
    applyFlip();
    window.Engine.reset(mySide); // rebuild starting position + Engine.start
    startClock();
    turnChanged();
    els.resign.disabled = false; resetResign();
    setConn("on", "Live");
  }

  // Reconnection: rebuild the board by replaying the move log.
  function resumeGame(msg) {
    started = true; over = false;
    hideOverlay();
    els.moveList.innerHTML = ""; els.youTray.innerHTML = ""; els.oppTray.innerHTML = ""; moveNo = 0;
    setCards(msg.white, msg.black);
    applyFlip();
    window.Engine.reset(mySide);
    (msg.moves || []).forEach(function (mv) {
      if (validMove(mv)) window.Engine.applyMove(mv.kind, mv.piece, mv.to);
    });
    startClock();
    turnChanged();
    els.resign.disabled = false; resetResign();
    setConn("on", "Live");
  }

  // ---- resign (two-click confirm) ----
  function resetResign() { resignArmed = false; els.resign.textContent = "Resign"; }
  els.resign.addEventListener("click", function () {
    if (over || !started) return;
    if (!resignArmed) { resignArmed = true; els.resign.textContent = "Confirm resign?"; setTimeout(resetResign, 3000); return; }
    send({ t: "resign" });
    resetResign();
  });

  // ---- sound ----
  window.__muted = false;
  els.sound.addEventListener("click", function () {
    window.__muted = !window.__muted;
    els.sound.classList.toggle("muted", window.__muted);
    els.sound.innerHTML = window.__muted ? "&#128263; Muted" : "&#128266; Sound";
  });

  els.codeLabel.textContent = code || "·····";
  els.copyInvite.addEventListener("click", function () { copyLink(els.copyInvite); });
  els.ovCopy.addEventListener("click", function () { copyLink(els.ovCopy, "Copied!"); });
  els.rematch.addEventListener("click", function () {
    send({ t: "rematch" });
    els.rematch.disabled = true;
    els.rematch.textContent = "Waiting for opponent…";
  });

  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

  function connect() {
    var proto = location.protocol === "https:" ? "wss://" : "ws://";
    var url = proto + location.host + "/ws?g=" + encodeURIComponent(code) + "&name=" + encodeURIComponent(myName);
    setConn("wait", reconnecting ? "Reconnecting…" : "Connecting");
    ws = new WebSocket(url);
    ws.addEventListener("open", function () { attempts = 0; reconnecting = false; setConn("on", "Connected"); });
    ws.addEventListener("message", function (e) {
      var m; try { m = JSON.parse(e.data); } catch (err) { return; }
      handle(m);
    });
    ws.addEventListener("close", function () {
      if (over || rejected) return;
      if (attempts < MAX_ATTEMPTS) {
        attempts++; reconnecting = true;
        setConn("wait", "Reconnecting…");
        setTimeout(connect, 1200);
      } else {
        setConn("off", "Disconnected");
        showOverlay({ title: "Disconnected", msg: "Lost connection to the game. Reload to try again.", actions: true, rematch: false });
      }
    });
    ws.addEventListener("error", function () {});
  }

  function handle(m) {
    switch (m.t) {
      case "assigned":
        mySide = m.side;
        els.youName.textContent = myName + " (you)";
        sideChip(els.youSide, mySide);
        applyFlip();
        break;

      case "waiting":
        setConn("wait", "Waiting");
        if (!started) {
          els.turn.className = "turn-banner opp";
          els.turn.textContent = "Waiting for opponent";
          els.ovCode.textContent = code;
          showOverlay({ title: "Game ready", msg: "You're in. Share this game so a friend can join:", invite: true });
        }
        break;

      case "ready":
        beginGame(m.white, m.black);
        break;

      case "resume":
        resumeGame(m);
        break;

      case "move":
        if (validMove(m)) window.Engine.applyMove(m.kind, m.piece, m.to);
        break;

      case "gameover":
        endGame(m.reason, m.winner === mySide);
        break;

      case "opponent_disconnected":
        if (over) break;
        setConn("wait", "Opponent away");
        showOverlay({ title: "Opponent dropped", msg: "Waiting for them to reconnect…" });
        break;

      case "opponent_reconnected":
        if (over) break;
        hideOverlay();
        setConn("on", "Live");
        break;

      case "opponent_left":
        if (over) break;
        over = true; started = false;
        stopClock();
        window.Engine.stop();
        els.turn.className = "turn-banner win"; els.turn.textContent = "You win";
        els.resign.disabled = true;
        showOverlay({ title: "You win!", result: "win", msg: "Your opponent left the game.", actions: true, rematch: false });
        setConn("off", "Opponent left");
        break;

      case "opponent_gone":
        // Opponent left after the game ended — no rematch is coming.
        els.rematch.disabled = true;
        els.rematch.textContent = "Opponent left";
        break;

      case "rematch_offer":
        els.rematch.textContent = "Accept rematch ✓";
        break;

      case "rematch_start":
        mySide = m.side;
        applyFlip();
        els.rematch.disabled = false; els.rematch.textContent = "Rematch";
        break;

      case "full":
        rejected = true;
        showOverlay({ title: "Game full", msg: "This game already has two players. Start your own from the lobby.", actions: true, rematch: false });
        setConn("off", "Full");
        break;
    }
  }

  function stopClock() { if (typeof window.stopTimer === "function") window.stopTimer(); }

  function endGame(reason, iWon) {
    over = true; started = false;
    stopClock();
    window.Engine.stop();
    els.resign.disabled = true; resetResign();
    els.turn.className = "turn-banner " + (iWon ? "win" : "lose");
    els.turn.textContent = iWon ? "You win" : "You lose";
    var msg = "";
    if (reason === "checkmate") msg = iWon ? "Checkmate. Well played." : "Checkmate. Better luck next time.";
    else if (reason === "resign") msg = iWon ? "Your opponent resigned." : "You resigned.";
    else if (reason === "impossible") msg = iWon ? "Your opponent made 3 illegal moves." : "You made 3 illegal moves.";
    if (!iWon) playSound("/sounds/pacman.wav");
    els.rematch.disabled = false; els.rematch.textContent = "Rematch";
    showOverlay({ title: iWon ? "You win!" : "You lose", result: iWon ? "win" : "lose", msg: msg, actions: true });
  }

  window.NET = {
    sendMove: function (kind, piece, from, to) { send({ t: "move", kind: kind, piece: piece, from: from, to: to }); },
    sendEnd: function (which) { send({ t: which }); },
    ready: function () {
      if (!/^[A-Z0-9]{4,8}$/.test(code)) {
        rejected = true;
        showOverlay({ title: "Bad link", msg: "This game link looks invalid. Head back and start a new game.", actions: true, rematch: false });
        return;
      }
      connect();
    },
  };
})();
