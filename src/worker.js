// Cloudflare Worker for "Just Another Chess Game".
//
// Serves the static front-end (public/) and hosts real-time multiplayer:
//   - Matchmaker  (one instance)  — pairs "Quick Play" players by handing out a game code.
//   - GameRoom    (one per code)  — hosts a single 2-player game and relays moves.
//
// Messages on /ws are JSON. Client -> server: {t:"move"|"checkmate"|"impossible"|
// "resign"|"rematch", ...}. Server -> client: {t:"assigned"|"waiting"|"ready"|"move"|
// "gameover"|"opponent_left"|"rematch_start"|"full", ...}. Side: 0 = white, 1 = black.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I, L, O, 0, 1

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Quick Play: get a game code to join (pairs you with the next quick player).
    if (path === "/api/quickmatch") {
      const stub = env.MATCHMAKER.get(env.MATCHMAKER.idFromName("global"));
      return stub.fetch(request);
    }

    // Create Game: mint a fresh private code.
    if (path === "/api/newcode") {
      return Response.json({ code: makeCode() });
    }

    // WebSocket into a specific game room: /ws?g=CODE&name=...
    if (path === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected a WebSocket upgrade request.", { status: 426 });
      }
      const code = (url.searchParams.get("g") || "").toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(code)) {
        return new Response("Invalid game code.", { status: 400 });
      }
      const stub = env.GAME.get(env.GAME.idFromName("room:" + code));
      return stub.fetch(request);
    }

    // Home page.
    if (path === "/") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }

    // Pretty invite URLs: /game/CODE -> the game screen (code read client-side).
    if (path.startsWith("/game/")) {
      return env.ASSETS.fetch(new Request(new URL("/game.html", url), request));
    }

    // Everything else is a static asset served by exact path.
    return env.ASSETS.fetch(request);
  },
};

// Pairs Quick Play players: holds at most one "open" code waiting for a second player.
export class Matchmaker {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.open = null;
    ctx.blockConcurrencyWhile(async () => {
      this.open = (await ctx.storage.get("open")) ?? null;
    });
  }

  async fetch() {
    // Read-modify-write is synchronous, so concurrent requests can't both grab it.
    let code;
    if (this.open) {
      code = this.open;
      this.open = null;
    } else {
      code = makeCode();
      this.open = code;
    }
    this.ctx.storage.put("open", this.open);
    return Response.json({ code });
  }
}

// Hosts one game: two players (white=0, black=1). A third connection is turned away.
// Per-socket state lives in the socket attachment: { role, name }.
export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.over = false;
    this.rematch = new Set(); // roles that have asked for a rematch
    ctx.blockConcurrencyWhile(async () => {
      this.over = (await ctx.storage.get("over")) ?? false;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "Player").slice(0, 20) || "Player";

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);

    // Assign a seat from the seats currently taken.
    let hasWhite = false, hasBlack = false;
    for (const s of this.ctx.getWebSockets()) {
      if (s === server) continue;
      const a = s.deserializeAttachment();
      if (!a) continue;
      if (a.role === 0) hasWhite = true;
      else if (a.role === 1) hasBlack = true;
    }

    if (hasWhite && hasBlack) {
      // Room already has two players.
      this.#send(server, { t: "full" });
      server.close(1000, "room full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const role = hasWhite ? 1 : 0;
    server.serializeAttachment({ role, name });
    this.#send(server, { t: "assigned", side: role, name });

    // A fresh game starting (someone joined an idle/finished room) clears end state.
    if (this.over && !(hasWhite || hasBlack)) this.#reset();

    this.#announce();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let m;
    try {
      m = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const a = ws.deserializeAttachment();
    if (!a) return;

    switch (m.t) {
      case "move":
        // Relay the opponent's move exactly as the engine described it.
        this.#relay(ws, { t: "move", kind: m.kind, piece: m.piece, from: m.from, to: m.to });
        break;
      case "checkmate": // sender delivered mate -> sender wins
        this.#gameover("checkmate", a.role);
        break;
      case "impossible": // sender's 3rd illegal move -> opponent wins
        this.#gameover("impossible", 1 - a.role);
        break;
      case "resign": // sender resigns -> opponent wins
        this.#gameover("resign", 1 - a.role);
        break;
      case "rematch":
        this.#requestRematch(a.role);
        break;
    }
  }

  async webSocketClose(ws) {
    this.#handleLeave(ws);
  }
  async webSocketError(ws) {
    this.#handleLeave(ws);
  }

  #handleLeave(ws) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    this.rematch.delete(a.role);
    // If a game was in progress, the remaining player wins by forfeit.
    if (!this.over) {
      this.#broadcastExcept(ws, { t: "opponent_left" });
      this.#markOver();
    }
  }

  #seats() {
    const seats = { 0: null, 1: null };
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment();
      if (a && (a.role === 0 || a.role === 1)) seats[a.role] = { s, name: a.name };
    }
    return seats;
  }

  #announce() {
    const seats = this.#seats();
    if (seats[0] && seats[1]) {
      this.#broadcast({ t: "ready", white: seats[0].name, black: seats[1].name });
    } else {
      const lone = seats[0]?.s || seats[1]?.s;
      if (lone) this.#send(lone, { t: "waiting" });
    }
  }

  #gameover(reason, winner) {
    this.#broadcast({ t: "gameover", reason, winner });
    this.#markOver();
  }

  #requestRematch(role) {
    if (this.over === false) return; // rematch only makes sense once a game ended
    this.rematch.add(role);
    const seats = this.#seats();
    if (!(seats[0] && seats[1])) return; // need both players present
    if (this.rematch.has(0) && this.rematch.has(1)) {
      // Both agreed: swap colors and start over.
      const w = seats[0], b = seats[1];
      w.s.serializeAttachment({ role: 1, name: w.name });
      b.s.serializeAttachment({ role: 0, name: b.name });
      this.#reset();
      this.#send(w.s, { t: "rematch_start", side: 1 });
      this.#send(b.s, { t: "rematch_start", side: 0 });
      this.#broadcast({ t: "ready", white: b.name, black: w.name });
    } else {
      // Tell the opponent a rematch was offered.
      const opp = role === 0 ? seats[1]?.s : seats[0]?.s;
      if (opp) this.#send(opp, { t: "rematch_offer" });
    }
  }

  #reset() {
    this.over = false;
    this.rematch.clear();
    this.ctx.storage.put("over", false);
  }
  #markOver() {
    this.over = true;
    this.ctx.storage.put("over", true);
  }

  #send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      /* socket closed */
    }
  }
  #broadcast(obj) {
    for (const s of this.ctx.getWebSockets()) this.#send(s, obj);
  }
  #broadcastExcept(except, obj) {
    for (const s of this.ctx.getWebSockets()) if (s !== except) this.#send(s, obj);
  }
  #relay(from, obj) {
    for (const s of this.ctx.getWebSockets()) if (s !== from) this.#send(s, obj);
  }
}
