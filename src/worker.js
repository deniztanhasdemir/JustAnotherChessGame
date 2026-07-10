// Cloudflare Worker for "Just Another Chess Game".
//
// Serves the static front-end (public/) and hosts real-time multiplayer:
//   - Matchmaker  (one instance)  — pairs "Quick Play" players by handing out a game code.
//   - GameRoom    (one per code)  — hosts a single 2-player game: relays moves, keeps the
//                                   authoritative per-player clock, and holds a reconnection
//                                   grace window so a refresh doesn't forfeit.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I, L, O, 0, 1
const GRACE_MS = 20000; // reconnection grace after a player drops
const ALLOWED_TC = [0, 180, 300, 600]; // seconds; 0 = unlimited

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

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

// Retained (unused) so the original v1 Durable Object migration stays valid.
export class GameHub {
  async fetch() {
    return new Response(null, { status: 410 });
  }
}

// Hosts one game: two seats (white=0, black=1). A third connection is turned away.
// Authoritative per-player clock lives here so timing survives reconnects/hibernation.
export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.started = false;
    this.over = false;
    this.moves = [];
    this.names = { 0: "White", 1: "Black" };
    this.rematch = new Set();
    this.tc = null;            // base seconds; 0 = unlimited; null = not chosen yet
    this.spent = { 0: 0, 1: 0 }; // ms consumed per side
    this.active = 0;          // whose clock is running
    this.running = false;
    this.turnStartedAt = 0;
    ctx.blockConcurrencyWhile(async () => {
      const s = await ctx.storage.get([
        "started", "over", "moves", "names", "rematch",
        "tc", "spent", "active", "running", "turnStartedAt",
      ]);
      this.started = s.get("started") ?? false;
      this.over = s.get("over") ?? false;
      this.moves = s.get("moves") ?? [];
      this.names = s.get("names") ?? { 0: "White", 1: "Black" };
      this.rematch = new Set(s.get("rematch") ?? []);
      this.tc = s.get("tc") ?? null;
      this.spent = s.get("spent") ?? { 0: 0, 1: 0 };
      this.active = s.get("active") ?? 0;
      this.running = s.get("running") ?? false;
      this.turnStartedAt = s.get("turnStartedAt") ?? 0;
    });
  }

  #persist() {
    this.ctx.storage.put({
      started: this.started, over: this.over, moves: this.moves, names: this.names,
      rematch: [...this.rematch], tc: this.tc, spent: this.spent, active: this.active,
      running: this.running, turnStartedAt: this.turnStartedAt,
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "Player").slice(0, 20) || "Player";
    if (this.tc == null) {
      const t = parseInt(url.searchParams.get("tc"), 10);
      this.tc = ALLOWED_TC.indexOf(t) >= 0 ? t : 0;
    }

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
      this.ctx.storage.deleteAlarm();
      this.#resumeClocks();
      this.#persist();
      this.#send(server, this.#msg("resume", { side: role, white: this.names[0], black: this.names[1], moves: this.moves }));
      const other = this.#seats()[1 - role];
      if (other) { this.#send(other, { t: "opponent_reconnected" }); this.#send(other, this.#msg("clock", {})); }
    } else if (opponentHere) {
      this.started = true;
      this.over = false;
      this.moves = [];
      this.rematch.clear();
      this.#startClocks();
      this.#persist();
      this.#broadcast(this.#msg("ready", { white: this.names[0], black: this.names[1] }));
    } else if (midGame) {
      this.#persist();
      this.#send(server, this.#msg("resume", { side: role, white: this.names[0], black: this.names[1], moves: this.moves }));
      this.#send(server, { t: "waiting" });
    } else {
      this.#persist();
      this.#send(server, this.#msg("waiting", { tc: this.tc }));
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
        this.#relay(ws, { t: "move", kind: m.kind, piece: m.piece, from: m.from, to: m.to });
        this.#tickClock(a.role);
        this.#persist();
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

  async alarm() {
    if (this.over || !this.started) return;
    const s = this.#seats();
    if (!(s[0] && s[1])) {
      // grace window expired -> the remaining player wins
      this.#broadcast({ t: "opponent_left" });
      this.over = true;
      this.running = false;
      this.#persist();
      return;
    }
    // both present -> the active player's clock ran out
    if (this.tc > 0 && this.running) {
      this.spent[this.active] += Date.now() - this.turnStartedAt;
      this.running = false;
      this.#gameover("time", 1 - this.active);
    }
  }

  #handleLeave(ws) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    this.rematch.delete(a.role);
    if (this.over) {
      this.#broadcast({ t: "opponent_gone" });
      this.#persist();
      return;
    }
    if (this.started) {
      this.#pauseClocks();
      this.#broadcast({ t: "opponent_disconnected" });
      this.#broadcast(this.#msg("clock", {}));
      this.ctx.storage.setAlarm(Date.now() + GRACE_MS);
      this.#persist();
    }
  }

  // ---- clock helpers ----
  #startClocks() {
    this.spent = { 0: 0, 1: 0 };
    this.active = 0;
    this.running = true;
    this.turnStartedAt = Date.now();
    this.#armFlag();
  }
  #pauseClocks() {
    if (this.running) {
      this.spent[this.active] += Date.now() - this.turnStartedAt;
      this.running = false;
      this.ctx.storage.deleteAlarm();
    }
  }
  #resumeClocks() {
    if (!this.running && this.started && !this.over) {
      this.running = true;
      this.turnStartedAt = Date.now();
      this.#armFlag();
    }
  }
  #tickClock(r) {
    if (!this.running || r !== this.active) return;
    const now = Date.now();
    this.spent[r] += now - this.turnStartedAt;
    if (this.tc > 0 && this.spent[r] >= this.tc * 1000) {
      this.running = false;
      this.#gameover("time", 1 - r);
      return;
    }
    this.active = 1 - r;
    this.turnStartedAt = now;
    this.#armFlag();
    this.#broadcast(this.#msg("clock", {}));
  }
  #armFlag() {
    if (this.tc > 0 && this.running) {
      const rem = this.tc * 1000 - this.spent[this.active];
      this.ctx.storage.setAlarm(Date.now() + Math.max(0, rem));
    }
  }
  #clock() {
    return { tc: this.tc, spent: this.spent, active: this.active, running: this.running, at: Date.now() };
  }
  #msg(t, extra) {
    return Object.assign({ t }, extra, this.#clock());
  }

  #gameover(reason, winner) {
    if (this.over) return;
    this.over = true;
    this.running = false;
    this.ctx.storage.deleteAlarm();
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
      this.#startClocks();
      this.#persist();
      this.#send(w, { t: "rematch_start", side: 1 });
      this.#send(b, { t: "rematch_start", side: 0 });
      this.#broadcast(this.#msg("ready", { white: this.names[0], black: this.names[1] }));
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
    try { ws.send(JSON.stringify(obj)); } catch { /* socket closed */ }
  }
  #broadcast(obj) {
    for (const s of this.ctx.getWebSockets()) this.#send(s, obj);
  }
  #relay(from, obj) {
    for (const s of this.ctx.getWebSockets()) if (s !== from) this.#send(s, obj);
  }
}
