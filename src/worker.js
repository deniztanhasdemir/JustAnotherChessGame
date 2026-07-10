// Cloudflare Worker for "Just Another Chess Game".
//
// Serves the static front-end (public/) and hosts real-time multiplayer:
//   - Matchmaker  (one instance)  — pairs "Quick Play" players by handing out a game code.
//   - GameRoom    (one per code)  — hosts a single 2-player game and relays moves, with a
//                                   reconnection grace window so a refresh doesn't forfeit.
//
// Messages on /ws are JSON. Side: 0 = white, 1 = black.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I, L, O, 0, 1
const GRACE_MS = 20000; // reconnection grace after a player drops

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

// A relayed move must reference real squares/pieces — never trust the peer's payload.
const SQUARE = /^[1-8]_[1-8]$/;
const PIECE = /^(white|black)(King|Queen|Bishop|Knight|Rook|Pawn)[1-8]?$/;
function validMove(m) {
  return (
    m &&
    (m.kind === "move" || m.kind === "castle" || m.kind === "capture") &&
    typeof m.piece === "string" && PIECE.test(m.piece) &&
    typeof m.from === "string" && SQUARE.test(m.from) &&
    typeof m.to === "string" && SQUARE.test(m.to)
  );
}

function withSecurityHeaders(resp) {
  const h = new Headers(resp.headers);
  h.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "font-src 'self'; connect-src 'self' ws: wss:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
  );
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/quickmatch") {
      const stub = env.MATCHMAKER.get(env.MATCHMAKER.idFromName("global"));
      return stub.fetch(request);
    }
    if (path === "/api/newcode") {
      return Response.json({ code: makeCode() });
    }
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
    if (path === "/") {
      return withSecurityHeaders(await env.ASSETS.fetch(new Request(new URL("/index.html", url), request)));
    }
    if (path.startsWith("/game/")) {
      return withSecurityHeaders(await env.ASSETS.fetch(new Request(new URL("/game.html", url), request)));
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
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

// Retained (unused) so the original v1 Durable Object migration stays valid without
// a deletion migration. All live gameplay is handled by GameRoom + Matchmaker.
export class GameHub {
  async fetch() {
    return new Response(null, { status: 410 });
  }
}

// Hosts one game: two seats (white=0, black=1). A third connection is turned away.
// State (persisted, so it survives hibernation and a reconnection grace window):
//   started  - has a game begun in this room
//   over     - has the current game ended
//   moves    - the move log, replayed to a reconnecting player to rebuild the board
//   names    - { 0: whiteName, 1: blackName }
//   rematch  - roles that have asked for a rematch
export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.started = false;
    this.over = false;
    this.moves = [];
    this.names = { 0: "White", 1: "Black" };
    this.rematch = new Set();
    ctx.blockConcurrencyWhile(async () => {
      const s = await ctx.storage.get(["started", "over", "moves", "names", "rematch"]);
      this.started = s.get("started") ?? false;
      this.over = s.get("over") ?? false;
      this.moves = s.get("moves") ?? [];
      this.names = s.get("names") ?? { 0: "White", 1: "Black" };
      this.rematch = new Set(s.get("rematch") ?? []);
    });
  }

  #persist() {
    this.ctx.storage.put({
      started: this.started,
      over: this.over,
      moves: this.moves,
      names: this.names,
      rematch: [...this.rematch],
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "Player").slice(0, 20) || "Player";

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);

    let hasWhite = false, hasBlack = false;
    for (const s of this.ctx.getWebSockets()) {
      if (s === server) continue;
      const a = s.deserializeAttachment();
      if (!a) continue;
      if (a.role === 0) hasWhite = true;
      else if (a.role === 1) hasBlack = true;
    }

    if (hasWhite && hasBlack) {
      this.#send(server, { t: "full" });
      server.close(1000, "full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const role = hasWhite ? 1 : 0;
    server.serializeAttachment({ role, name });
    this.names[role] = name;
    this.#send(server, { t: "assigned", side: role, name });

    const opponentHere = role === 0 ? hasBlack : hasWhite;
    const midGame = this.started && !this.over && this.moves.length > 0;

    if (midGame && opponentHere) {
      // Reconnection into an in-progress game: cancel the forfeit and replay the board.
      this.ctx.storage.deleteAlarm();
      this.#persist();
      this.#send(server, { t: "resume", side: role, white: this.names[0], black: this.names[1], moves: this.moves });
      const other = this.#seats()[1 - role];
      if (other) this.#send(other, { t: "opponent_reconnected" });
    } else if (opponentHere) {
      // Fresh game (both seats now filled, and no game in progress to resume).
      this.started = true;
      this.over = false;
      this.moves = [];
      this.rematch.clear();
      this.#persist();
      this.#broadcast({ t: "ready", white: this.names[0], black: this.names[1] });
    } else if (midGame) {
      // Returning while the opponent is still away: show the board, keep waiting.
      this.#persist();
      this.#send(server, { t: "resume", side: role, white: this.names[0], black: this.names[1], moves: this.moves });
      this.#send(server, { t: "waiting" });
    } else {
      this.#persist();
      this.#send(server, { t: "waiting" });
    }

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
        if (this.over || !validMove(m)) return;
        this.moves.push({ kind: m.kind, piece: m.piece, from: m.from, to: m.to });
        this.#persist();
        this.#relay(ws, { t: "move", kind: m.kind, piece: m.piece, from: m.from, to: m.to });
        break;
      case "checkmate":
        this.#gameover("checkmate", a.role);
        break;
      case "impossible":
        this.#gameover("impossible", 1 - a.role);
        break;
      case "resign":
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

  // Grace window elapsed: if a seat is still empty, the remaining player wins by forfeit.
  async alarm() {
    if (this.over || !this.started) return;
    const s = this.#seats();
    if (!(s[0] && s[1])) {
      this.#broadcast({ t: "opponent_left" });
      this.over = true;
      this.#persist();
    }
  }

  #handleLeave(ws) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    this.rematch.delete(a.role);
    if (this.over) {
      // A survivor may be waiting on a rematch; tell them the opponent is gone.
      this.#broadcast({ t: "opponent_gone" });
      this.#persist();
      return;
    }
    if (this.started) {
      // Maybe just a refresh — hold a grace window before forfeiting.
      this.#broadcast({ t: "opponent_disconnected" });
      this.ctx.storage.setAlarm(Date.now() + GRACE_MS);
      this.#persist();
    }
  }

  #gameover(reason, winner) {
    if (this.over) return;
    this.over = true;
    this.#persist();
    this.#broadcast({ t: "gameover", reason, winner });
  }

  #requestRematch(role) {
    if (!this.over) return;
    this.rematch.add(role);
    this.#persist();
    const s = this.#seats();
    if (!(s[0] && s[1])) return;
    if (this.rematch.has(0) && this.rematch.has(1)) {
      const w = s[0], b = s[1];
      const wName = this.names[0], bName = this.names[1];
      w.serializeAttachment({ role: 1, name: wName });
      b.serializeAttachment({ role: 0, name: bName });
      this.names = { 0: bName, 1: wName };
      this.started = true;
      this.over = false;
      this.moves = [];
      this.rematch.clear();
      this.#persist();
      this.#send(w, { t: "rematch_start", side: 1 });
      this.#send(b, { t: "rematch_start", side: 0 });
      this.#broadcast({ t: "ready", white: this.names[0], black: this.names[1] });
    } else {
      const opp = this.#seats()[1 - role];
      if (opp) this.#send(opp, { t: "rematch_offer" });
    }
  }

  #seats() {
    const seats = { 0: null, 1: null };
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment();
      if (a && (a.role === 0 || a.role === 1)) seats[a.role] = s;
    }
    return seats;
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
  #relay(from, obj) {
    for (const s of this.ctx.getWebSockets()) if (s !== from) this.#send(s, obj);
  }
}
