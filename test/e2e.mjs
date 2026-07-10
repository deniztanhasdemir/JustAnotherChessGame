// Backend protocol test for the rooms + matchmaker worker.
// Prerequisite: start the local server (`npm run dev`, port 8787), then `npm run test:e2e`.
// Override the port with PORT=8788 node test/e2e.mjs when using a different dev port.
const PORT = process.env.PORT || "8787";
const BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;
const log = (s) => process.stdout.write(s + "\n");
const ok = (c, m) => { c ? (pass++, log("  ✓ " + m)) : (fail++, log("  ✗ FAIL: " + m)); };
setTimeout(() => { log("!! WATCHDOG: exceeded 25s"); process.exit(3); }, 25000);

function conn(code, name) {
  const ws = new WebSocket(`${BASE.replace("http", "ws")}/ws?g=${code}&name=${encodeURIComponent(name)}`);
  const q = [], waiters = []; let total = 0;
  ws.addEventListener("message", (e) => {
    total++; const msg = JSON.parse(e.data);
    const w = waiters.shift(); if (w) w(msg); else q.push(msg);
  });
  return {
    ws, total: () => total,
    next: (ms = 2000) => new Promise((res, rej) => {
      if (q.length) return res(q.shift());
      const t = setTimeout(() => rej(new Error(`${name} next timeout`)), ms);
      waiters.push((d) => { clearTimeout(t); res(d); });
    }),
    open: () => new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`${name} open timeout`)), 3000);
      ws.addEventListener("open", () => { clearTimeout(t); res(); }, { once: true });
      ws.addEventListener("error", rej, { once: true });
    }),
    send: (o) => ws.send(JSON.stringify(o)), close: () => ws.close(),
  };
}
const untilType = async (c, t) => { for (let i = 0; i < 6; i++) { const m = await c.next(); if (m.t === t) return m; } throw new Error("no " + t); };

log("\n== HTTP API ==");
const nc = await (await fetch(BASE + "/api/newcode")).json();
ok(/^[A-Z0-9]{5}$/.test(nc.code), `/api/newcode -> ${nc.code}`);
const qm = () => fetch(BASE + "/api/quickmatch").then((r) => r.json()).then((d) => d.code);
// A previous run may have left one "open" code; consume it so the next two pair cleanly.
let a = await qm(), b = await qm();
if (a !== b) { a = b; b = await qm(); } // a was a stale open; a & b now the fresh pair
ok(a === b, `quickmatch pairs two players on one code (${a})`);
ok((await qm()) !== a, "next quickmatch opens a new code");

log("\n== Room join, roles, relay ==");
const code = nc.code;
const alice = conn(code, "Alice"); await alice.open();
ok((await untilType(alice, "assigned")).side === 0, "first player is white (side 0)");
ok(!!(await untilType(alice, "waiting")), "lone player told to wait");
const bob = conn(code, "Bob"); await bob.open();
ok((await untilType(bob, "assigned")).side === 1, "second player is black (side 1)");
const ready = await untilType(alice, "ready");
ok(ready.white === "Alice" && ready.black === "Bob", "both get ready with names");
alice.send({ t: "move", kind: "move", piece: "whitePawn1", from: "1_2", to: "1_4" });
const mv = await untilType(bob, "move");
ok(mv.piece === "whitePawn1" && mv.to === "1_4", "opponent receives the move");

log("\n== Full room rejected ==");
const carol = conn(code, "Carol"); await carol.open();
ok(!!(await untilType(carol, "full")), "third player gets 'full'");

log("\n== Resign / rematch / leave ==");
bob.send({ t: "resign" });
const go = await untilType(alice, "gameover");
ok(go.reason === "resign" && go.winner === 0, "resign: white wins");
alice.send({ t: "rematch" }); bob.send({ t: "rematch" });
const rA = await untilType(alice, "rematch_start");
const rB = await untilType(bob, "rematch_start");
ok(rA.side === 1 && rB.side === 0, "colors swap on rematch");
bob.close();
ok(!!(await untilType(alice, "opponent_left")), "remaining player notified when opponent leaves");
alice.close();

log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
