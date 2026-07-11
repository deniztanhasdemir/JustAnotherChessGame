// Networking + UI glue for the game screen.
// Talks the JSON room protocol to the Worker, drives the board through window.Engine,
// and updates the panels/overlays. The chess rules live in app.js.
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    conn: $("conn"), connText: $("connText"),
    codeLabel: $("codeLabel"), copyInvite: $("copyInvite"),
    turn: $("turn"), board: $("board"), ranks: $("ranks"), files: $("files"),
    oppName: $("oppName"), oppSide: $("oppSide"), oppTray: $("oppTray"), oppClock: $("oppClock"),
    youName: $("youName"), youSide: $("youSide"), youTray: $("youTray"), youClock: $("youClock"),
    moveList: $("moveList"), impossible: $("impossibleCounter"), copyPgn: $("copyPgn"),
    resign: $("resignBtn"), sound: $("soundBtn"), draw: $("drawBtn"), newGame: $("newGameBtn"),
    emoteBar: $("emoteBar"), emoteToast: $("emoteToast"),
    drawPrompt: $("drawPrompt"), drawAccept: $("drawAccept"), drawDecline: $("drawDecline"),
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
  var rejected = false;
  var spectator = false;
  var reconnecting = false;
  var attempts = 0;
  var MAX_ATTEMPTS = 6;
  var resignArmed = false;

  var sanMoves = [];          // SAN-ish tokens, for the move list + PGN
  var whiteNameG = "White", blackNameG = "Black", resultG = "*";

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

  // ---- coordinate labels (flip with the board) ----
  function buildCoords(flipped) {
    var ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    var files = flipped ? ["h", "g", "f", "e", "d", "c", "b", "a"] : ["a", "b", "c", "d", "e", "f", "g", "h"];
    if (els.ranks) els.ranks.innerHTML = ranks.map(function (n) { return "<span>" + n + "</span>"; }).join("");
    if (els.files) els.files.innerHTML = files.map(function (c) { return "<span>" + c + "</span>"; }).join("");
  }

  // ---- turn banner ----
  function turnChanged() {
    if (over || !started) return;
    if (spectator) {
      var t = window.main && window.main.variables.turn;
      els.turn.className = "turn-banner";
      els.turn.textContent = (t === "b" ? "Black" : "White") + " to move";
      return;
    }
    if (window.canPlay) { els.turn.className = "turn-banner you"; els.turn.textContent = "Your move"; }
    else { els.turn.className = "turn-banner opp"; els.turn.textContent = "Opponent's move"; }
  }

  // ---- SAN move list + captured trays (called by the engine's move/capture) ----
  function pieceLetter(k) {
    if (/King/.test(k)) return "K";
    if (/Queen/.test(k)) return "Q";
    if (/Rook/.test(k)) return "R";
    if (/Bishop/.test(k)) return "B";
    if (/Knight/.test(k)) return "N";
    return "";
  }
  function toSan(mover, from, to, isCapture) {
    var ff = +String(from).split("_")[0], tf = +String(to).split("_")[0];
    if (/King/.test(mover) && Math.abs(tf - ff) === 2) return "O-O";
    if (/King/.test(mover) && Math.abs(tf - ff) === 3) return "O-O-O";
    var letter = pieceLetter(mover);
    var cap = isCapture ? ((letter === "" ? FILES[ff] : "") + "x") : "";
    return letter + cap + algebraic(to);
  }
  function renderMoves() {
    els.moveList.innerHTML = "";
    for (var i = 0; i < sanMoves.length; i += 2) {
      var li = document.createElement("li");
      var n = document.createElement("span"); n.className = "n"; n.textContent = (i / 2 + 1) + ".";
      var w = document.createElement("span"); w.className = "san w"; w.textContent = sanMoves[i] || "";
      var b = document.createElement("span"); b.className = "san b"; b.textContent = sanMoves[i + 1] || "";
      li.appendChild(n); li.appendChild(w); li.appendChild(b);
      els.moveList.appendChild(li);
    }
    els.moveList.scrollTop = els.moveList.scrollHeight;
  }
  function record(mover, from, to, victimKey) {
    if (window.__suppressRecord) return; // the castling rook move is folded into "O-O"
    var white = isWhiteKey(mover);
    var pieces = window.main && window.main.variables.pieces;
    var capture = victimKey && victimKey !== "null";
    sanMoves.push(toSan(mover, from, to, capture));
    renderMoves();
    if (capture && pieces && pieces[victimKey]) {
      var moverSide = white ? 0 : 1;
      var tray = (spectator ? moverSide === 0 : moverSide === mySide) ? els.youTray : els.oppTray;
      var span = document.createElement("span");
      span.innerHTML = pieces[victimKey].img; // static piece glyph entity
      tray.appendChild(span);
    }
  }
  window.GameUI = { record: record, turnChanged: turnChanged };

  function buildPGN() {
    var tags =
      '[Event "Just Another Chess Game"]\n' +
      '[Site "' + location.host + '"]\n' +
      '[White "' + whiteNameG + '"]\n' +
      '[Black "' + blackNameG + '"]\n' +
      '[Result "' + resultG + '"]\n\n';
    var body = "";
    for (var i = 0; i < sanMoves.length; i += 2) {
      body += (i / 2 + 1) + ". " + sanMoves[i] + (sanMoves[i + 1] ? " " + sanMoves[i + 1] : "") + " ";
    }
    return tags + body.trim() + (resultG !== "*" ? " " + resultG : "");
  }

  // ---- overlays ----
  function showOverlay(o) {
    els.ovTitle.textContent = o.title || "";
    els.ovTitle.className = "ov-title wordmark" + (o.result ? " " + o.result : "");
    els.ovMsg.textContent = o.msg || "";
    els.ovInvite.hidden = !o.invite;
    els.ovActions.hidden = !o.actions;
    els.rematch.style.display = o.actions && o.rematch !== false ? "" : "none";
    if (els.newGame) { els.newGame.disabled = false; els.newGame.textContent = "New opponent"; }
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
  function copyText(text, btn, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flashCopied(btn, done); }, function () { prompt("Copy:", text); });
    } else { prompt("Copy:", text); }
  }

  function sideChip(el, side) { el.textContent = side === 0 ? "White" : "Black"; el.className = "pc-side " + (side === 0 ? "w" : "b"); }
  function setCards(whiteName, blackName) {
    whiteNameG = whiteName; blackNameG = blackName;
    if (spectator) {
      els.youName.textContent = whiteName;
      els.oppName.textContent = blackName;
      sideChip(els.youSide, 0);
      sideChip(els.oppSide, 1);
    } else {
      els.youName.textContent = (mySide === 0 ? whiteName : blackName) + " (you)";
      els.oppName.textContent = mySide === 0 ? blackName : whiteName;
      sideChip(els.youSide, mySide);
      sideChip(els.oppSide, 1 - mySide);
    }
  }
  function applyFlip() {
    var flipped = mySide === 1;
    els.board.classList.toggle("flip", flipped);
    buildCoords(flipped);
    if (window.Board3D) window.Board3D.setSide(mySide);
  }

  // ---- clocks (the Durable Object is authoritative; we just display + tick locally) ----
  var clock = { tc: 0, spent: { 0: 0, 1: 0 }, active: 0, running: false, syncAt: 0 };
  var clockTimer = null;
  function onClock(m) {
    if (m.tc != null) clock.tc = m.tc;
    if (m.spent) clock.spent = m.spent;
    if (m.active != null) clock.active = m.active;
    clock.running = !!m.running;
    clock.syncAt = Date.now();
    renderClocks();
    if (clock.running && !clockTimer) clockTimer = setInterval(renderClocks, 250);
    if (!clock.running && clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }
  function liveSpent(side) {
    var s = clock.spent[side] || 0;
    if (clock.running && clock.active === side) s += Date.now() - clock.syncAt;
    return s;
  }
  function fmtClock(ms) {
    if (ms < 0) ms = 0;
    var t = Math.ceil(ms / 1000), mm = Math.floor(t / 60), ss = t % 60;
    return (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
  }
  function renderClocks() {
    for (var side = 0; side < 2; side++) {
      var el = (spectator ? side === 0 : side === mySide) ? els.youClock : els.oppClock;
      if (!el) continue;
      var spent = liveSpent(side);
      var timed = clock.tc > 0;
      el.textContent = timed ? fmtClock(clock.tc * 1000 - spent) : fmtClock(spent);
      var isActive = clock.running && clock.active === side && !over;
      el.classList.toggle("active", isActive);
      el.classList.toggle("low", timed && isActive && clock.tc * 1000 - spent < 10000);
      el.classList.toggle("untimed", !timed);
    }
  }
  function stopClockLocal() {
    clock.running = false;
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    renderClocks();
  }

  function resetBoardUI() {
    els.moveList.innerHTML = ""; els.youTray.innerHTML = ""; els.oppTray.innerHTML = "";
    sanMoves = []; resultG = "*";
  }

  function beginGame(m) {
    started = true; over = false;
    hideOverlay();
    resetBoardUI();
    setCards(m.white, m.black);
    applyFlip();
    window.Engine.reset(mySide);
    onClock(m);
    turnChanged();
    if (!spectator) { els.resign.disabled = false; els.draw.disabled = false; els.draw.textContent = "Offer draw"; }
    els.drawPrompt.hidden = true; resetResign();
    setConn("on", "Live");
    if (window.Sfx) Sfx.start();
  }

  function resumeGame(msg) {
    started = true; over = false;
    hideOverlay();
    resetBoardUI();
    setCards(msg.white, msg.black);
    applyFlip();
    window.Engine.reset(mySide);
    (msg.moves || []).forEach(function (mv) {
      if (validMove(mv)) window.Engine.applyMove(mv.kind, mv.piece, mv.to);
    });
    onClock(msg);
    turnChanged();
    if (!spectator) { els.resign.disabled = false; els.draw.disabled = false; els.draw.textContent = "Offer draw"; }
    els.drawPrompt.hidden = true; resetResign();
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
  els.copyInvite.addEventListener("click", function () { copyText(inviteLink(), els.copyInvite); });
  els.ovCopy.addEventListener("click", function () { copyText(inviteLink(), els.ovCopy, "Copied!"); });
  if (els.copyPgn) els.copyPgn.addEventListener("click", function () {
    if (!sanMoves.length) return;
    copyText(buildPGN(), els.copyPgn, "Copied!");
  });
  els.rematch.addEventListener("click", function () {
    send({ t: "rematch" });
    els.rematch.disabled = true;
    els.rematch.textContent = "Waiting for opponent…";
  });

  // ---- spectator / draw / emotes / new opponent ----
  function enterSpectator() {
    spectator = true;
    document.body.classList.add("spectating");
    els.resign.style.display = "none";
    els.draw.style.display = "none";
  }
  function showToast(text) {
    var d = document.createElement("div");
    d.className = "emote-bubble";
    d.textContent = text;
    els.emoteToast.appendChild(d);
    setTimeout(function () { d.classList.add("out"); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 320); }, 2400);
  }
  var EMOTE_LABELS = { gg: "GG 👏", nice: "Nice! 👍", oops: "Oops 😅", wow: "Wow 😮", hi: "Hi 👋", gl: "GL 🤝" };
  function showEmote(e, from) {
    var name = from === 0 ? whiteNameG : from === 1 ? blackNameG : "";
    showToast((name ? name + ": " : "") + (EMOTE_LABELS[e] || e));
  }
  function reasonText(reason, winner) {
    if (reason === "checkmate") return "Checkmate.";
    if (reason === "resign") return (winner === 0 ? blackNameG : whiteNameG) + " resigned.";
    if (reason === "time") return (winner === 0 ? blackNameG : whiteNameG) + " ran out of time.";
    if (reason === "impossible") return "Three illegal moves.";
    return "";
  }
  function endDraw() {
    over = true; started = false;
    stopClockLocal(); window.Engine.stop();
    els.resign.disabled = true; els.draw.disabled = true; els.drawPrompt.hidden = true; resetResign();
    resultG = "1/2-1/2";
    els.turn.className = "turn-banner"; els.turn.textContent = "Draw";
    if (window.Sfx) Sfx.low();
    showOverlay({ title: "Draw", msg: "Draw by agreement.", actions: true, rematch: spectator ? false : true });
  }
  els.draw.addEventListener("click", function () {
    if (over || !started || spectator) return;
    send({ t: "draw_offer" });
    els.draw.disabled = true; els.draw.textContent = "Draw offered";
  });
  els.drawAccept.addEventListener("click", function () { send({ t: "draw_accept" }); els.drawPrompt.hidden = true; });
  els.drawDecline.addEventListener("click", function () { send({ t: "draw_decline" }); els.drawPrompt.hidden = true; });
  els.emoteBar.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".emote") : null;
    if (b) send({ t: "emote", e: b.getAttribute("data-e") });
  });
  els.newGame.addEventListener("click", function () {
    els.newGame.disabled = true; els.newGame.textContent = "Finding…";
    fetch("/api/quickmatch").then(function (r) { return r.json(); }).then(function (d) { location.href = "/game/" + d.code; })
      .catch(function () { els.newGame.disabled = false; els.newGame.textContent = "New opponent"; });
  });

  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

  function connect() {
    var proto = location.protocol === "https:" ? "wss://" : "ws://";
    var tc = "0";
    try { tc = localStorage.getItem("jacg-tc") || "0"; } catch (e) {}
    var url = proto + location.host + "/ws?g=" + encodeURIComponent(code) +
      "&name=" + encodeURIComponent(myName) + "&tc=" + encodeURIComponent(tc);
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
        if (mySide === 2) enterSpectator();
        else { els.youName.textContent = myName + " (you)"; sideChip(els.youSide, mySide); }
        applyFlip();
        break;
      case "waiting":
        setConn("wait", "Waiting");
        onClock(m);
        if (!started) {
          els.turn.className = "turn-banner opp";
          els.turn.textContent = "Waiting for opponent";
          els.ovCode.textContent = code;
          showOverlay({ title: "Game ready", msg: "You're in. Share this game so a friend can join:", invite: true });
        }
        break;
      case "ready":
        beginGame(m);
        break;
      case "resume":
        resumeGame(m);
        break;
      case "move":
        if (validMove(m)) window.Engine.applyMove(m.kind, m.piece, m.to);
        break;
      case "clock":
        onClock(m);
        break;
      case "gameover":
        if (m.winner === -1) endDraw(m.reason);
        else endGame(m.reason, m.winner === mySide, m.winner);
        break;
      case "draw_offer":
        if (!over && !spectator) els.drawPrompt.hidden = false;
        break;
      case "draw_decline":
        showToast("Draw declined");
        els.draw.disabled = false; els.draw.textContent = "Offer draw";
        break;
      case "emote":
        showEmote(m.e, m.from);
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
        stopClockLocal(); window.Engine.stop();
        els.resign.disabled = true; els.draw.disabled = true; els.drawPrompt.hidden = true;
        if (spectator) {
          els.turn.className = "turn-banner"; els.turn.textContent = "Game over";
          showOverlay({ title: "Game over", msg: "A player left the game.", actions: true, rematch: false });
          setConn("off", "Ended");
          break;
        }
        resultG = mySide === 0 ? "1-0" : "0-1";
        els.turn.className = "turn-banner win"; els.turn.textContent = "You win";
        if (window.Sfx) Sfx.win();
        showOverlay({ title: "You win!", result: "win", msg: "Your opponent left the game.", actions: true, rematch: false });
        setConn("off", "Opponent left");
        break;
      case "opponent_gone":
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

  function endGame(reason, iWon, winner) {
    over = true; started = false;
    stopClockLocal(); window.Engine.stop();
    els.resign.disabled = true; els.draw.disabled = true; els.drawPrompt.hidden = true; resetResign();
    resultG = winner === 0 ? "1-0" : "0-1";
    if (spectator) {
      var wn = winner === 0 ? whiteNameG : blackNameG;
      els.turn.className = "turn-banner"; els.turn.textContent = wn + " wins";
      showOverlay({ title: wn + " wins", msg: reasonText(reason, winner), actions: true, rematch: false });
      return;
    }
    els.turn.className = "turn-banner " + (iWon ? "win" : "lose");
    els.turn.textContent = iWon ? "You win" : "You lose";
    var msg = "";
    if (reason === "checkmate") msg = iWon ? "Checkmate. Well played." : "Checkmate. Better luck next time.";
    else if (reason === "resign") msg = iWon ? "Your opponent resigned." : "You resigned.";
    else if (reason === "impossible") msg = iWon ? "Your opponent made 3 illegal moves." : "You made 3 illegal moves.";
    else if (reason === "time") msg = iWon ? "Your opponent ran out of time." : "You ran out of time.";
    if (window.Sfx) { iWon ? Sfx.win() : Sfx.lose(); }
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
      buildCoords(false);
      connect();
    },
  };
})();
