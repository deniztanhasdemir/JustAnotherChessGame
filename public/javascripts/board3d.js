// 3D chess board (Three.js) that mirrors the DOM board the engine drives.
// The DOM board (#board) stays the source of truth: this reads square `chess`
// attributes + highlight classes and renders a WebGL scene; taps raycast back
// onto squares and forward a click to the matching DOM cell so the engine runs.
import * as THREE from "/vendor/three.module.min.js";
import { OrbitControls } from "/vendor/OrbitControls.js";
import { RoomEnvironment } from "/vendor/RoomEnvironment.js";

const $ = (id) => document.getElementById(id);
const mount = $("stage3d");
const boardEl = $("board");
if (mount && boardEl && window.WebGLRenderingContext) {
  init();
}

function init() {
  const S = 1; // square size
  const files = [1, 2, 3, 4, 5, 6, 7, 8];

  // square id "x_y" -> world position (x = file, y = rank)
  const pos = (x, y) => new THREE.Vector3((x - 4.5) * S, 0, (4.5 - y) * S);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

  // procedural environment for soft PBR reflections (no HDR asset needed)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.46; // don't dip under the board
  controls.target.set(0, 0.3, 0);

  // ---- lighting ----
  scene.add(new THREE.AmbientLight(0x556070, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(5, 11, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  key.shadow.camera.left = -8; key.shadow.camera.right = 8;
  key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const pink = new THREE.PointLight(0xfc03f8, 0.6, 30);
  pink.position.set(-6, 4, -4);
  scene.add(pink);

  // ---- board ----
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  const tileGeo = new THREE.BoxGeometry(0.98 * S, 0.22, 0.98 * S);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x433d4e, roughness: 0.75, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x211e2a, roughness: 0.8, metalness: 0.05 });
  const tiles = []; // {mesh, x, y}
  const tileById = {};
  for (const y of files) for (const x of files) {
    const brown = (x + y) % 2 === 0;
    const m = new THREE.Mesh(tileGeo, brown ? darkMat : lightMat);
    const p = pos(x, y);
    m.position.set(p.x, -0.11, p.z);
    m.receiveShadow = true;
    m.userData.id = x + "_" + y;
    boardGroup.add(m);
    tiles.push(m);
    tileById[m.userData.id] = m;
  }
  // base + neon rim
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(8.7, 0.5, 8.7),
    new THREE.MeshStandardMaterial({ color: 0x17151d, roughness: 0.7 })
  );
  base.position.y = -0.36;
  base.receiveShadow = true;
  boardGroup.add(base);
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(8.9, 0.12, 8.9),
    new THREE.MeshStandardMaterial({ color: 0xfc03f8, emissive: 0xfc03f8, emissiveIntensity: 0.7, roughness: 0.4 })
  );
  rim.position.y = -0.14;
  boardGroup.add(rim);

  // ---- highlight overlays ----
  const hlGeo = new THREE.PlaneGeometry(0.96 * S, 0.96 * S);
  hlGeo.rotateX(-Math.PI / 2);
  const overlays = []; // reused each sync
  function clearOverlays() { for (const o of overlays) boardGroup.remove(o); overlays.length = 0; }
  function overlay(id, color, opacity) {
    const t = tileById[id]; if (!t) return;
    const m = new THREE.Mesh(hlGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.position.set(t.position.x, 0.02, t.position.z);
    boardGroup.add(m); overlays.push(m);
  }
  const dotGeo = new THREE.CircleGeometry(0.16 * S, 24); dotGeo.rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(0.4 * S, 0.47 * S, 28); ringGeo.rotateX(-Math.PI / 2);
  function marker(id, geo) {
    const t = tileById[id]; if (!t) return;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfc03f8, transparent: true, opacity: 0.92, depthWrite: false }));
    m.position.set(t.position.x, 0.03, t.position.z);
    boardGroup.add(m); overlays.push(m);
  }

  // ---- materials + piece geometry ----
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe9dfc8, roughness: 0.3, metalness: 0.0, envMapIntensity: 0.85 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x1b1922, roughness: 0.32, metalness: 0.15, envMapIntensity: 0.95 });
  const mats = { white: whiteMat, black: blackMat };

  // ---- Staunton-ish pieces: turned bodies (LatheGeometry) + an extruded knight ----
  function lathe(profile) {
    const pts = profile.map((p) => new THREE.Vector2(Math.max(0.0006, p[0]), p[1]));
    const g = new THREE.LatheGeometry(pts, 48);
    g.computeVertexNormals();
    return g;
  }
  const PROFILES = {
    pawn:   [[0,0],[0.30,0],[0.30,0.05],[0.20,0.09],[0.14,0.13],[0.115,0.20],[0.16,0.235],[0.135,0.265],[0.10,0.30],[0.135,0.325],[0.155,0.40],[0.125,0.46],[0.075,0.50],[0,0.52]],
    rook:   [[0,0],[0.33,0],[0.33,0.06],[0.22,0.10],[0.175,0.14],[0.165,0.36],[0.20,0.42],[0.235,0.46],[0.235,0.55],[0.205,0.57],[0.205,0.62],[0,0.62]],
    bishop: [[0,0],[0.31,0],[0.31,0.06],[0.21,0.10],[0.15,0.14],[0.125,0.30],[0.16,0.36],[0.125,0.40],[0.165,0.47],[0.135,0.58],[0.085,0.68],[0.115,0.72],[0.05,0.80],[0,0.84]],
    queen:  [[0,0],[0.35,0],[0.35,0.06],[0.24,0.11],[0.17,0.15],[0.14,0.36],[0.18,0.44],[0.22,0.48],[0.20,0.52],[0.235,0.58],[0.195,0.64],[0.235,0.68],[0.18,0.72],[0,0.74]],
    king:   [[0,0],[0.36,0],[0.36,0.06],[0.25,0.11],[0.18,0.16],[0.15,0.38],[0.19,0.46],[0.23,0.50],[0.215,0.54],[0.25,0.60],[0.21,0.66],[0.25,0.72],[0.205,0.80],[0.19,0.88],[0,0.90]],
    knightBase: [[0,0],[0.32,0],[0.32,0.06],[0.22,0.10],[0.18,0.14],[0.165,0.30],[0.20,0.35],[0,0.35]],
  };
  const geoCache = {};
  const geo = (k) => (geoCache[k] || (geoCache[k] = lathe(PROFILES[k])));

  let knightHeadGeo = null;
  function knightHead() {
    if (knightHeadGeo) return knightHeadGeo;
    var P = [[-0.12,0.10],[-0.18,0.30],[-0.15,0.44],[-0.08,0.50],[-0.03,0.42],[0.02,0.50],[0.07,0.45],[0.06,0.34],[0.15,0.28],[0.235,0.18],[0.245,0.10],[0.20,0.075],[0.13,0.12],[0.05,0.11],[0.0,0.15],[-0.05,0.12],[-0.09,0.11]];
    var s = new THREE.Shape();
    s.moveTo(P[0][0], P[0][1]);
    for (var i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]);
    s.closePath();
    var g = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
    g.center();
    g.rotateY(Math.PI / 2); // muzzle faces down-board; profile faces sideways
    g.computeVertexNormals();
    knightHeadGeo = g;
    return g;
  }

  function part(g, mat, y) { const m = new THREE.Mesh(g, mat); m.position.y = y; m.castShadow = true; return m; }

  // build a piece group (base at y=0, grows up)
  function buildPiece(type, mat, color) {
    const g = new THREE.Group();
    const kind = type.replace(/^(white|black)/, "").toLowerCase();
    if (kind === "knight") {
      g.add(part(geo("knightBase"), mat, 0));
      const head = new THREE.Mesh(knightHead(), mat);
      head.castShadow = true; head.position.set(0, 0.5, 0); head.scale.setScalar(1.2);
      head.rotation.y = color === "white" ? 0 : Math.PI;
      g.add(head);
      return g;
    }
    g.add(part(geo(kind), mat, 0));
    if (kind === "rook") {
      for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 0.085), mat); const a = (i/6)*Math.PI*2; b.position.set(Math.cos(a)*0.165, 0.64, Math.sin(a)*0.165); b.castShadow = true; g.add(b); }
    } else if (kind === "bishop") {
      g.add(part(new THREE.SphereGeometry(0.05, 16, 12), mat, 0.87));
    } else if (kind === "queen") {
      for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), mat); const a = (i/8)*Math.PI*2; sp.position.set(Math.cos(a)*0.16, 0.76, Math.sin(a)*0.16); sp.castShadow = true; g.add(sp); }
      g.add(part(new THREE.SphereGeometry(0.058, 14, 12), mat, 0.80));
    } else if (kind === "king") {
      g.add(part(new THREE.BoxGeometry(0.07, 0.24, 0.07), mat, 1.02));
      g.add(part(new THREE.BoxGeometry(0.2, 0.07, 0.07), mat, 1.0));
    }
    return g;
  }

  // ---- piece bookkeeping + animation ----
  const pieces = {}; // key -> { group, x, y }
  const tweens = []; // {group, from, to, t0, dur}
  function tweenTo(group, target, dur) {
    tweens.push({ group, from: group.position.clone(), to: target.clone(), t0: performance.now(), dur });
  }

  function sync() {
    // read the DOM board
    const present = {};
    boardEl.querySelectorAll(".chessSquare").forEach((cell) => {
      const key = cell.getAttribute("chess");
      if (!key || key === "null") return;
      const id = cell.id.split("_");
      present[key] = { x: +id[0], y: +id[1] };
    });

    // add / move
    for (const key in present) {
      const sq = present[key];
      const type = (window.main && window.main.variables.pieces[key] && window.main.variables.pieces[key].type) || key;
      const color = key.indexOf("white") === 0 ? "white" : "black";
      let p = pieces[key];
      if (!p) {
        const grp = buildPiece(type, mats[color], color);
        grp.userData.type = type;
        const w = pos(sq.x, sq.y);
        grp.position.copy(w);
        grp.scale.set(0.01, 0.01, 0.01);
        scene.add(grp);
        pieces[key] = p = { group: grp, x: sq.x, y: sq.y };
      } else if (p.group.userData.type !== type) {
        // promotion: rebuild with the new type
        scene.remove(p.group);
        const grp = buildPiece(type, mats[color], color);
        grp.userData.type = type;
        grp.position.copy(pos(sq.x, sq.y));
        scene.add(grp);
        p.group = grp;
      }
      if (p.x !== sq.x || p.y !== sq.y) {
        tweenTo(p.group, pos(sq.x, sq.y), 260);
        p.x = sq.x; p.y = sq.y;
      }
    }
    // remove captured
    for (const key in pieces) {
      if (!present[key]) { scene.remove(pieces[key].group); delete pieces[key]; }
    }

    // highlights from classes
    clearOverlays();
    boardEl.querySelectorAll(".chessSquare").forEach((cell) => {
      const cl = cell.classList, id = cell.id;
      if (cl.contains("lastmove")) overlay(id, 0xfc03f8, 0.22);
      if (cl.contains("incheck")) overlay(id, 0xff3355, 0.5);
      if (cl.contains("sel")) overlay(id, 0xfc03f8, 0.38);
      if (cl.contains("blue")) marker(id, cell.getAttribute("chess") === "null" ? dotGeo : ringGeo);
    });
    renderer.render(scene, camera); // render immediately, don't wait for the rAF loop
  }

  // ---- camera orientation by side ----
  let side = 0;
  function placeCamera() {
    camera.position.set(0, 10.6, side === 1 ? -7.4 : 7.4);
    controls.update();
  }
  function setSide(n) { side = n === 1 ? 1 : 0; placeCamera(); }
  setSide(typeof window.side !== "undefined" ? Number(window.side) : 0);

  // ---- tap-to-select (distinct from orbit drag) ----
  let downAt = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  renderer.domElement.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return; // it was an orbit drag
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(tiles, false)[0];
    if (hit && window.jQuery) window.jQuery("#" + hit.object.userData.id).trigger("click");
  });

  // ---- resize ----
  function resize() {
    const s = Math.max(120, Math.min(mount.clientWidth, mount.clientHeight || mount.clientWidth));
    renderer.setSize(s, s);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => { resize(); renderer.render(scene, camera); }).observe(mount);
  resize();
  // fallback: keep the canvas matched even if rAF is throttled (e.g. background tab)
  setInterval(() => {
    if (mount.clientWidth > 0 && Math.abs(renderer.domElement.clientWidth - mount.clientWidth) > 1) {
      resize(); renderer.render(scene, camera);
    }
  }, 300);

  // ---- render loop ----
  function animate(now) {
    requestAnimationFrame(animate);
    // keep the canvas matched to the (possibly late-laid-out) stage size
    if (mount.clientWidth > 0 && Math.abs(renderer.domElement.clientWidth - mount.clientWidth) > 1) resize();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      let k = (now - tw.t0) / tw.dur;
      if (k >= 1) { k = 1; tweens.splice(i, 1); }
      const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
      tw.group.position.lerpVectors(tw.from, tw.to, e);
      tw.group.position.y = Math.sin(k * Math.PI) * 0.35; // little hop
    }
    // grow-in for freshly added pieces
    scene.traverse((o) => { if (o.isGroup && o.scale.x < 1 && o.userData.type) o.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2); });
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);

  // ---- observe the DOM board + expose API ----
  let pending = false;
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; sync(); }); } };
  new MutationObserver(schedule).observe(boardEl, { subtree: true, attributes: true, attributeFilter: ["chess", "class"] });
  sync();

  // project a square's center to client coordinates (used for testing/debug)
  function project(id) {
    const t = tileById[id]; if (!t) return null;
    const v = t.position.clone(); v.project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  }
  window.Board3D = { setSide, resync: sync, project, resize };

  // ---- 2D / 3D toggle ----
  const boardCol = mount.closest(".board-col") || mount.parentElement;
  const toggle = $("viewToggle");
  function applyMode(mode) {
    const is3d = mode === "3d";
    boardCol.classList.toggle("mode-3d", is3d);
    if (toggle) toggle.textContent = is3d ? "2D" : "3D";
    try { localStorage.setItem("jacg-view", mode); } catch (e) {}
    if (is3d) requestAnimationFrame(resize);
  }
  let savedView = "3d";
  try { savedView = localStorage.getItem("jacg-view") || "3d"; } catch (e) {}
  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener("click", () => applyMode(boardCol.classList.contains("mode-3d") ? "2d" : "3d"));
  }
  applyMode(savedView);
}
