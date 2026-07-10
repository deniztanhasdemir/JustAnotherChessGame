# Just Another Chess Game

A two-player online chess game with a neon-arcade look. Quick-match with a
stranger, or create a private game and share the link with a friend.

## How to play

The game runs on **Cloudflare Workers**. From the lobby you can:

- **Quick Play** — get matched with the next player looking for a game.
- **Create Game** — get a private code + shareable link to send a friend.
- **Join** — enter a friend's code.

The first player in a game plays white, the second plays black. To try it solo,
open the invite link (or the same `/game/<code>` URL) in a second browser tab.

Pick a time control (unlimited, 3 / 5 / 10 min) in the lobby. Along the way you
get per-player chess clocks, a live connection indicator, last-move and in-check
highlighting, board coordinates, a SAN move list with Copy-PGN, captured pieces,
sound effects, resign, and rematch (with colors swapped). If you refresh or drop
briefly, the game holds for ~20s and restores your board and clock when you're back.

> The live URL is in the Cloudflare dashboard under
> **Workers & Pages → justanotherchessgame** — it looks like
> `https://justanotherchessgame.<your-subdomain>.workers.dev`.

## How it's built

- **Front end** (`public/`) — the arcade lobby (`index.html`) and game screen
  (`game.html`). The chess engine (`javascripts/app.js`) renders the board and
  enforces moves; `net.js` handles the realtime connection and UI; `lobby.js`
  drives matchmaking. jQuery and the display fonts are self-hosted (no CDN).
- **Multiplayer server** (`src/worker.js`) — a Cloudflare Worker that:
  - serves the static site,
  - runs a **`Matchmaker`** Durable Object for Quick Play (pairs players onto a
    game code),
  - runs one **`GameRoom`** Durable Object per game code, which seats two players
    and relays moves, resignations, and rematches between them.
  - Rooms use the WebSocket Hibernation API, so an idle game costs nothing.
- **Protocol** — JSON messages over `/ws?g=<code>`: `assigned`, `waiting`,
  `ready`, `move`, `gameover`, `opponent_left`, `rematch_start`.
- **Config** (`wrangler.jsonc`) — wires the static assets and Durable Objects.

> The original Node.js + Express + `ws` server (`server.js`, `bin/`, `views/`)
> is kept for reference but is no longer used.

## Local development

Requires [Node.js](https://nodejs.org/en/download/).

```bash
npm install     # install wrangler
npm run dev     # start a local server (usually http://localhost:8787)
```

Open the local URL, create a game, and open the invite link in a second tab.

### Tests

The multiplayer protocol has an automated end-to-end test that drives real
WebSocket clients against the local server. With `npm run dev` running:

```bash
npm run test:e2e   # matchmaking, rooms, roles, move relay, resign, rematch, leave
```

## Deploying

Pushing to `main` triggers a Cloudflare build that runs `npx wrangler deploy`.
To deploy manually (after `npx wrangler login`):

```bash
npm run deploy
```

## Credits

Deniz Tan Hasdemir & Can Sağtürk
