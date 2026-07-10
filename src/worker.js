// Cloudflare Worker + Durable Object port of the original Express + `ws` server.
//
// - Static files (public/) are served by the Workers Assets binding (ASSETS).
// - Real-time multiplayer (matchmaking + move relay) lives in the GameHub Durable
//   Object, which speaks the exact same line protocol the browser client expects.
//
// The client (public/javascripts/app.js) connects to `/ws`, and every game message
// is a comma-space separated string, e.g. "PLAYER_MOVE, 2, whitePawn1, 1_2, 1_4".

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // WebSocket endpoint -> hand off to the single shared lobby Durable Object.
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected a WebSocket upgrade request.", { status: 426 });
      }
      const id = env.GAME.idFromName("global-lobby");
      const stub = env.GAME.get(id);
      return stub.fetch(request);
    }

    // The original server served splash.html at "/".
    if (url.pathname === "/") {
      return env.ASSETS.fetch(new Request(new URL("/splash.html", url), request));
    }

    // Everything else is a static file from public/.
    return env.ASSETS.fetch(request);
  },
};

// A client "PLAYER_*" message is relayed to the opponent as the matching "OPPOSITE_*".
const RELAY = {
  PLAYER_MOVE: "OPPOSITE_MOVE",
  PLAYER_CASTLE: "OPPOSITE_CASTLE",
  PLAYER_CAPTURE: "OPPOSITE_CAPTURE",
  PLAYER_CHECKMATE: "OPPOSITE_CHECKMATE",
  PLAYER_IMPOSSIBLE: "OPPOSITE_IMPOSSIBLE",
};

// Turn an incoming client message into the message the opponent should receive.
// Mirrors the original server: drop the message type + sender id, keep the payload.
// Returns null for anything that must not be relayed.
export function relayMessage(text) {
  const parts = text.split(", ");
  const out = RELAY[parts[0]];
  if (!out) return null;
  const args = parts.slice(2); // drop message type + sender playerId
  return args.length ? `${out}, ${args.join(", ")}` : out;
}

// One instance of this Durable Object acts as the whole game lobby: it pairs players
// into games and relays moves between the two sides of each game. WebSockets use the
// Hibernation API so the object can sleep between moves; all per-connection state is
// kept in each socket's serialized attachment: { pid, side, partner }.
//   pid     - unique-within-the-lobby player id (also the token echoed to the client)
//   side    - 0 = white, 1 = black, -1 = waiting for an opponent
//   partner - the opponent's pid, or null while still waiting
export class GameHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // Monotonic player-id counter, restored from storage so ids are NEVER reused.
    // (Reusing a freed id could alias a departed player's stale `partner` pointer
    // onto an unrelated future player, causing cross-game FORFEIT/move bleed.)
    this.nextPid = 1;
    ctx.blockConcurrencyWhile(async () => {
      this.nextPid = (await ctx.storage.get("nextPid")) ?? 1;
    });
  }

  async fetch(request) {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);

    const pid = this.#allocatePid();

    // Find a player still waiting for an opponent (side -1 == waiting; a finished
    // or forfeited player keeps its 0/1 side and so is never re-matched here).
    let waiting = null;
    for (const s of this.ctx.getWebSockets()) {
      if (s === server) continue;
      const a = s.deserializeAttachment();
      if (a && a.side === -1) {
        waiting = s;
        break;
      }
    }

    if (waiting) {
      const wa = waiting.deserializeAttachment();
      wa.side = 0; // the player who waited is white
      wa.partner = pid;
      waiting.serializeAttachment(wa);
      server.serializeAttachment({ pid, side: 1, partner: wa.pid }); // newcomer is black

      // GAME_READY, <side>, <playerId>   (side: 0 = white, 1 = black)
      this.#safeSend(waiting, `GAME_READY, 0, ${wa.pid}`);
      this.#safeSend(server, `GAME_READY, 1, ${pid}`);
    } else {
      server.serializeAttachment({ pid, side: -1, partner: null });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    const relayed = relayMessage(text);
    if (!relayed) return;
    const partner = this.#partnerOf(ws);
    if (partner) this.#safeSend(partner, relayed);
    // Checkmate / third-impossible ends the game. Sever the pairing so a later
    // tab-close can't deliver a spurious FORFEIT that flips the decided result.
    if (relayed === "OPPOSITE_CHECKMATE" || relayed === "OPPOSITE_IMPOSSIBLE") {
      this.#detach(ws);
      this.#detach(partner);
    }
  }

  async webSocketClose(ws) {
    this.#forfeit(ws);
  }

  async webSocketError(ws) {
    this.#forfeit(ws);
  }

  // Tell the opponent the other side left, then sever the pairing so the now-lone
  // survivor can't later route a stale FORFEIT to an unrelated future player.
  #forfeit(ws) {
    const partner = this.#partnerOf(ws);
    if (!partner) return;
    this.#safeSend(partner, "FORFEIT");
    this.#detach(partner);
  }

  // Hand out a player id that is never reused (persisted via the DO output gate).
  #allocatePid() {
    const pid = this.nextPid++;
    this.ctx.storage.put("nextPid", this.nextPid);
    return pid;
  }

  // Clear a socket's partner pointer so it routes nowhere once its game is over.
  #detach(ws) {
    if (!ws) return;
    const a = ws.deserializeAttachment();
    if (a && a.partner != null) {
      a.partner = null;
      ws.serializeAttachment(a);
    }
  }

  #partnerOf(ws) {
    const a = ws.deserializeAttachment();
    if (!a || a.partner == null) return null;
    for (const s of this.ctx.getWebSockets()) {
      const b = s.deserializeAttachment();
      if (b && b.pid === a.partner) return s;
    }
    return null;
  }

  #safeSend(ws, data) {
    try {
      ws.send(data);
    } catch {
      /* socket already closed */
    }
  }
}
