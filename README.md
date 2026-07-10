# Just Another Chess Game

## What's this?

It's just another chess game called Just Another Chess Game. It's a two-player
online chess game: two people connect, get matched, and play against each other
in real time (we almost always just open a second browser tab to test it).

## How to play

The game is deployed on **Cloudflare Workers**. Open the site, click **Play**, and
you'll be put into a match as soon as a second player clicks Play too. To try it
solo, open the game in two browser tabs — the first tab plays white, the second
plays black.

> The live URL is shown in the Cloudflare dashboard under
> **Workers & Pages → justanotherchessgame** (it looks like
> `https://justanotherchessgame.<your-subdomain>.workers.dev`).

## How it's built

- **Front end** (`public/`) — the board, pieces, move rules and UI. Plain
  HTML/CSS/JS with jQuery. Served straight from Cloudflare's static assets.
- **Multiplayer server** (`src/worker.js`) — a Cloudflare Worker that serves the
  site and hands the `/ws` WebSocket endpoint to a **Durable Object** (`GameHub`).
  The Durable Object does matchmaking (pairs two players, first = white, second =
  black) and relays each move to the opponent. It uses the WebSocket Hibernation
  API, so it costs nothing while players are idle between moves.
- **Config** (`wrangler.jsonc`) — wires the static assets binding and the Durable
  Object together.

> The original version (`server.js`, `bin/`, `views/`) was a Node.js + Express +
> `ws` server. It's kept in the repo for reference but is no longer used — the
> Cloudflare Worker replaces it.

## Local development

Requires [Node.js](https://nodejs.org/en/download/).

```bash
npm install     # install wrangler
npm run dev     # start a local server (usually http://localhost:8787)
```

Open the local URL in two tabs to play both sides.

### Tests

The multiplayer server has automated tests (they drive real WebSocket clients
against the local server). With `npm run dev` running in one terminal:

```bash
npm run test:e2e       # routing, matchmaking, move relay, forfeit, game isolation
npm run test:regress   # regression tests for player-id reuse & post-game forfeit
```

## Deploying

Pushing to `main` triggers a Cloudflare build that runs `npx wrangler deploy`
automatically. To deploy manually from your machine (after `npx wrangler login`):

```bash
npm run deploy
```

## Credits

Deniz Tan Hasdemir & Can Sağtürk
