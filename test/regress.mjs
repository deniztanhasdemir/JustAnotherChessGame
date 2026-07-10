// Regression tests for the two audit-confirmed bugs fixed in src/worker.js:
//   1) pid recycling: a forfeited/lingering socket must NOT alias a future player.
//   2) post-checkmate disconnect must NOT deliver a spurious FORFEIT.
// Prerequisite: start the local server first (`npm run dev`), then: `npm run test:regress`.
const WS = "ws://127.0.0.1:8787/ws";
let pass = 0, fail = 0;
const log = (s) => process.stdout.write(s + "\n");
const ok = (c, m) => { c ? (pass++, log("  ✓ " + m)) : (fail++, log("  ✗ FAIL: " + m)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { log("!! WATCHDOG 25s"); process.exit(3); }, 25000);

function client(name) {
  const ws = new WebSocket(WS);
  const q = []; const waiters = []; let total = 0;
  ws.addEventListener("message", (e) => { total++; const w = waiters.shift(); if (w) w(e.data); else q.push(e.data); });
  return {
    ws, name, total: () => total,
    next: (ms = 2000) => new Promise((res, rej) => {
      if (q.length) return res(q.shift());
      const t = setTimeout(() => rej(new Error(`${name}.next() timed out`)), ms);
      waiters.push((d) => { clearTimeout(t); res(d); });
    }),
    open: () => new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`${name}.open() timed out`)), 3000);
      ws.addEventListener("open", () => { clearTimeout(t); res(); }, { once: true });
      ws.addEventListener("error", (e) => { clearTimeout(t); rej(e); }, { once: true });
    }),
    send: (s) => ws.send(s), close: () => ws.close(),
  };
}
// open a fresh client, wait until it's connected
async function join(name) { const c = client(name); await c.open(); return c; }

log("\n== Bug 1: pid recycling / forfeit aliasing ==");
const p1 = await join("P1");
await wait(150);
const p2 = await join("P2");
const p1r = await p1.next(); const p2r = await p2.next();
ok(/^GAME_READY, 0, /.test(p1r) && /^GAME_READY, 1, /.test(p2r), "P1/P2 paired");

p2.close();                              // P2 leaves
ok((await p1.next()) === "FORFEIT", "P1 (survivor) gets FORFEIT");
const p1TotalAfterForfeit = p1.total();

await wait(200);
const p3 = await join("P3");             // must NOT be paired with the finished P1
await wait(400);
ok(p3.total() === 0, "P3 waits for a NEW opponent (not paired with the finished P1)");
ok(p1.total() === p1TotalAfterForfeit, "finished P1 receives nothing when P3 joins");

const p3TotalBeforeP1Close = p3.total();
p1.close();                              // survivor finally closes its tab
await wait(400);
ok(p3.total() === p3TotalBeforeP1Close, "P3 gets NO stray FORFEIT from unrelated P1 closing (bug fixed)");

const p4 = await join("P4");             // P3 should now pair with P4
ok(/^GAME_READY, 0, /.test(await p3.next()), "P3 becomes white in a fresh game");
ok(/^GAME_READY, 1, /.test(await p4.next()), "P4 becomes black");
p3.send("PLAYER_MOVE, 999, whitePawn1, 1_2, 1_4");
ok((await p4.next()) === "OPPOSITE_MOVE, whitePawn1, 1_2, 1_4", "P3<->P4 relay works independently");
p3.close(); p4.close();

log("\n== Bug 2: post-checkmate disconnect must not send FORFEIT ==");
const q1 = await join("Q1");
await wait(150);
const q2 = await join("Q2");
await q1.next(); await q2.next();         // GAME_READY x2
q1.send("PLAYER_CHECKMATE, 123");
ok((await q2.next()) === "OPPOSITE_CHECKMATE", "checkmate relayed to loser");
const q2Total = q2.total();
q1.close();                              // winner closes tab after the game ended
await wait(400);
ok(q2.total() === q2Total, "loser gets NO spurious FORFEIT after checkmate (bug fixed)");
q2.close();

log(`\n==== REGRESSION: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
