// End-to-end test against `wrangler dev` on 127.0.0.1:8787.
// Prerequisite: start the local server first (`npm run dev`), then: `npm run test:e2e`.
// Covers HTTP routing, matchmaking, move relay, terminal events, forfeit and game isolation.
const BASE = "http://127.0.0.1:8787";
const WS = "ws://127.0.0.1:8787/ws";
let pass = 0, fail = 0;
const log = (s) => process.stdout.write(s + "\n"); // unbuffered-ish, line by line
const ok = (c, m) => { c ? (pass++, log("  ✓ " + m)) : (fail++, log("  ✗ FAIL: " + m)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Hard watchdog so the run can never hang forever.
setTimeout(() => { log("!! WATCHDOG: test exceeded 25s, aborting"); process.exit(3); }, 25000);

// FIFO message consumer with a real timeout, so a missing message fails fast.
function client(name) {
  const ws = new WebSocket(WS);
  const q = [];
  const waiters = [];
  let total = 0;
  ws.addEventListener("message", (e) => {
    total++;
    const w = waiters.shift();
    if (w) w(e.data); else q.push(e.data);
  });
  return {
    ws, name,
    total: () => total,
    next: (timeoutMs = 2000) => new Promise((res, rej) => {
      if (q.length) return res(q.shift());
      const t = setTimeout(() => rej(new Error(`${name}.next() timed out`)), timeoutMs);
      waiters.push((d) => { clearTimeout(t); res(d); });
    }),
    open: () => new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`${name}.open() timed out`)), 3000);
      ws.addEventListener("open", () => { clearTimeout(t); res(); }, { once: true });
      ws.addEventListener("error", (e) => { clearTimeout(t); rej(e); }, { once: true });
    }),
    send: (s) => ws.send(s),
    close: () => ws.close(),
  };
}

log("\n== HTTP routing ==");
{
  const root = await fetch(BASE + "/");
  ok(root.status === 200 && /ust Another Chess Gam/.test(await root.text()), "GET / serves splash.html");
  const game = await fetch(BASE + "/game.html");
  const gameBody = await game.text();
  ok(game.status === 200 && /chessSquare/.test(gameBody), "GET /game.html serves the board");
  ok(!/http:\/\/code\.jquery/.test(gameBody), "game.html has no mixed-content http:// script");
  const appBody = await (await fetch(BASE + "/javascripts/app.js")).text();
  ok(/\/ws/.test(appBody) && !/ws:\/\/localhost:3000/.test(appBody), "app.js targets /ws (no hardcoded localhost)");
  ok((await fetch(BASE + "/ws")).status === 426, "GET /ws without upgrade -> 426");
}

log("\n== Matchmaking + GAME_READY ==");
const white = client("white");
await white.open();
await wait(200); // white registers as "waiting" before black joins
const black = client("black");
await black.open();
const wReady = await white.next(), bReady = await black.next();
ok(/^GAME_READY, 0, \d+$/.test(wReady), `white gets side 0 (white): ${wReady}`);
ok(/^GAME_READY, 1, \d+$/.test(bReady), `black gets side 1 (black): ${bReady}`);
ok(wReady.split(", ")[2] !== bReady.split(", ")[2], "players get distinct player ids");

log("\n== Move relay both directions ==");
white.send("PLAYER_MOVE, 1, whitePawn1, 1_2, 1_4");
ok((await black.next()) === "OPPOSITE_MOVE, whitePawn1, 1_2, 1_4", "white->black move relayed");
black.send("PLAYER_MOVE, 2, blackPawn1, 1_7, 1_5");
ok((await white.next()) === "OPPOSITE_MOVE, blackPawn1, 1_7, 1_5", "black->white move relayed");

log("\n== Castle / capture relay (non-terminal) ==");
white.send("PLAYER_CASTLE, 1, whiteRook2, 8_1, 6_1");
ok((await black.next()) === "OPPOSITE_CASTLE, whiteRook2, 8_1, 6_1", "castle relayed");
white.send("PLAYER_CAPTURE, 1, whiteKnight1, 2_1, 3_3");
ok((await black.next()) === "OPPOSITE_CAPTURE, whiteKnight1, 2_1, 3_3", "capture relayed");

log("\n== Terminal relays (checkmate / impossible), each on a fresh game ==");
for (const [label, msg, expect] of [
  ["checkmate", "PLAYER_CHECKMATE, 1", "OPPOSITE_CHECKMATE"],
  ["impossible", "PLAYER_IMPOSSIBLE, 1", "OPPOSITE_IMPOSSIBLE"],
]) {
  const a = client(label + "A"); await a.open(); await wait(150);
  const b = client(label + "B"); await b.open();
  await a.next(); await b.next(); // GAME_READY x2
  a.send(msg);
  ok((await b.next()) === expect, `${label} relayed (no args)`);
  a.close(); b.close();
}

log("\n== Unknown messages are ignored ==");
{
  const before = black.total();
  white.send("HELLO, 1, junk");
  await wait(250);
  ok(black.total() === before, "unknown message type is not relayed");
}

log("\n== Forfeit on disconnect ==");
white.close();
ok((await black.next()) === "FORFEIT", "opponent notified of forfeit");

log("\n== Second independent game (isolation) ==");
const w2 = client("w2");
await w2.open(); await wait(200);
const b2 = client("b2");
await b2.open();
ok(/^GAME_READY, 0, \d+$/.test(await w2.next()), "second game: white side ok");
ok(/^GAME_READY, 1, \d+$/.test(await b2.next()), "second game: black side ok");
const staleBefore = black.total();
w2.send("PLAYER_MOVE, 9, whitePawn5, 5_2, 5_4");
ok((await b2.next()) === "OPPOSITE_MOVE, whitePawn5, 5_2, 5_4", "second game relays independently");
await wait(200);
ok(black.total() === staleBefore, "finished game's socket receives nothing from the new game");
b2.close(); w2.close();

log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
