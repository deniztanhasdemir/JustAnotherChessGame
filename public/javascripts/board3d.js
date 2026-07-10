// 3D chess board (Three.js) that mirrors the DOM board the engine drives.
// The DOM board (#board) stays the source of truth: this reads square `chess`
// attributes + highlight classes and renders a WebGL scene; taps raycast back
// onto squares and forward a click to the matching DOM cell so the engine runs.
import * as THREE from "/vendor/three.module.min.js";
import { OrbitControls } from "/vendor/OrbitControls.js";

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
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

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
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeae4d6, roughness: 0.35, metalness: 0.1 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x2b2732, roughness: 0.45, metalness: 0.2 });
  const mats = { white: whiteMat, black: blackMat };

  function baseParts(scale) {
    // flared base + body cylinder, returns array of {geo, y}
    return [
      { geo: new THREE.CylinderGeometry(0.34, 0.4, 0.12, 24), y: 0.06 },
      { geo: new THREE.CylinderGeometry(0.19, 0.32, 0.28 * scale, 24), y: 0.12 + 0.14 * scale },
    ];
  }
  function meshOf(geo, mat, y) { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; return m; }

  // build a piece group (base at y=0, grows up). type -> shape.
  function buildPiece(type, mat) {
    const g = new THREE.Group();
    const add = (geo, y) => g.add(meshOf(geo, mat, y));
    const kind = type.replace(/^(white|black)/, "").toLowerCase();
    if (kind === "pawn") {
      baseParts(0.7).forEach((p) => add(p.geo, p.y));
      add(new THREE.SphereGeometry(0.2, 20, 16), 0.5);
    } else if (kind === "rook") {
      baseParts(1).forEach((p) => add(p.geo, p.y));
      add(new THREE.CylinderGeometry(0.26, 0.22, 0.16, 24), 0.6);
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), mat);
        const a = (i / 4) * Math.PI * 2;
        b.position.set(Math.cos(a) * 0.19, 0.72, Math.sin(a) * 0.19); b.castShadow = true; g.add(b);
      }
    } else if (kind === "knight") {
      baseParts(0.9).forEach((p) => add(p.geo, p.y));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.34, 0.42), mat);
      head.position.set(0, 0.66, 0.04); head.rotation.x = -0.35; head.castShadow = true; g.add(head);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.2), mat);
      snout.position.set(0, 0.72, 0.24); snout.rotation.x = -0.3; snout.castShadow = true; g.add(snout);
    } else if (kind === "bishop") {
      baseParts(1.15).forEach((p) => add(p.geo, p.y));
      add(new THREE.ConeGeometry(0.2, 0.42, 24), 0.72);
      add(new THREE.SphereGeometry(0.09, 16, 12), 1.02);
    } else if (kind === "queen") {
      baseParts(1.3).forEach((p) => add(p.geo, p.y));
      add(new THREE.ConeGeometry(0.24, 0.44, 24), 0.78);
      add(new THREE.TorusGeometry(0.16, 0.05, 12, 24), 1.02);
      add(new THREE.SphereGeometry(0.11, 16, 12), 1.12);
    } else { // king
      baseParts(1.4).forEach((p) => add(p.geo, p.y));
      add(new THREE.ConeGeometry(0.24, 0.46, 24), 0.82);
      add(new THREE.CylinderGeometry(0.18, 0.2, 0.12, 24), 1.05);
      const cv = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.08), mat); cv.position.y = 1.26; cv.castShadow = true; g.add(cv);
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.08), mat); ch.position.y = 1.24; ch.castShadow = true; g.add(ch);
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
        const grp = buildPiece(type, mats[color]);
        grp.userData.type = type;
        const w = pos(sq.x, sq.y);
        grp.position.copy(w);
        grp.scale.set(0.01, 0.01, 0.01);
        scene.add(grp);
        pieces[key] = p = { group: grp, x: sq.x, y: sq.y };
      } else if (p.group.userData.type !== type) {
        // promotion: rebuild with the new type
        scene.remove(p.group);
        const grp = buildPiece(type, mats[color]);
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
