// PRIMUS build guide: an animated, step-by-step virtual assembly driven by the CAD.
// Every part keeps its CAD pose; a step moves the new parts in from where a person would bring them,
// screws spin in under a hex key, inserts go in under a soldering iron, and sub-assemblies are built
// beside the main workpiece on the bench and then joined to it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const root = document.querySelector('[data-build]');
if (root) init(root).catch(error => {
  console.error(error);
  const status = root.querySelector('.bp-status');
  if (status) { status.textContent = `The 3D guide could not be loaded: ${error.message}`; status.hidden = false; }
});

const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
const easeOut = u => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const Q = (a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]);
const ID = new THREE.Quaternion();

async function init(root) {
  const base = root.dataset.build;
  const stage = root.querySelector('.bp-stage');
  const status = root.querySelector('.bp-status');
  const caption = root.querySelector('.bp-caption');
  const stepLabel = root.querySelector('.bp-step');
  const btnPlay = root.querySelector('[data-bp=play]');
  const btnPrev = root.querySelector('[data-bp=prev]');
  const btnNext = root.querySelector('[data-bp=next]');
  const btnCam = root.querySelector('[data-bp=camera]');
  const speedSel = root.querySelector('[data-bp=speed]');
  const scrub = root.querySelector('[data-bp=scrub]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  const stillMode = params.has('still');

  const guide = await (await fetch(base + 'steps.json')).json();
  const steps = [];
  guide.chapters.forEach((ch, ci) => ch.steps.forEach((st, si) => steps.push({ ...st, chapter: ch, ci, si, index: steps.length })));
  const byId = Object.fromEntries(steps.map(s => [s.id, s]));

  // ---------------------------------------------------------------- renderer, scene, bench
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: stillMode, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, stillMode ? 2 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeae8e2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.005, 30);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.screenSpacePanning = true;
  let autoCam = true;
  controls.addEventListener('start', () => { autoCam = false; btnCam?.setAttribute('aria-pressed', 'false'); });

  // bench frame: Z up (CAD-like); three.js is Y up
  const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.55));
  const bench = makeBench(); world.add(bench);
  const work = new THREE.Group(); world.add(work);             // all parts live here, in CAD coordinates
  const tools = new THREE.Group(); world.add(tools);
  const toolKit = makeTools(); Object.values(toolKit).forEach(t => { t.visible = false; tools.add(t); });
  const guideLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: 0xc2410c, dashSize: 0.006, gapSize: 0.004, transparent: true, opacity: 0.85 }));
  guideLine.visible = false; world.add(guideLine);

  // ---------------------------------------------------------------- assets
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const assets = {};
  async function loadAsset(name) {
    if (assets[name]) return assets[name];
    const info = await (await fetch(`${base}${name}.json`)).json();
    status.hidden = false; status.textContent = 'Loading the 3D model…';
    const gltf = await loader.loadAsync(`${base}${name}.glb`, e => {
      if (e.total) status.textContent = `Loading the 3D model… ${Math.round(100 * e.loaded / e.total)}%`;
    });
    const byNode = {};
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => { if (o.isMesh) byNode[o.name] = o; });
    const parts = {};
    const group = new THREE.Group(); group.visible = false;
    for (const p of info) {
      const g = new THREE.Group(); g.name = p.id; g.matrixAutoUpdate = false;
      const box = new THREE.Box3(V(p.bbox[0]), V(p.bbox[1]));
      for (const n of p.nodes) {
        const m = byNode[n]; if (!m) continue;
        const mw = m.matrixWorld.clone();
        m.matrixAutoUpdate = false; m.matrix.copy(mw);
        m.material = m.material.clone(); m.castShadow = true; m.receiveShadow = true;
        g.add(m);
      }
      const center = box.getCenter(new THREE.Vector3());
      parts[p.id] = { id: p.id, obj: g, box, center, info: p, hot: 0 };
      group.add(g);
    }
    work.add(group);
    status.hidden = true;
    return (assets[name] = { name, parts, group });
  }

  // ---------------------------------------------------------------- simulation of the guide state
  const ORIENT0 = [0, 0, 0, 1];
  function stationXform(s) { return { offset: [...(s.offset || [0, 0, 0])], rot: [...(s.rot || ORIENT0)] }; }
  const startStates = {};
  const pivotIds = {};   // scope -> station -> [ids]: a station turns about the centre of everything ever built there
  (function simulate() {
    const scopes = {};
    for (const st of steps) {
      const P = pivotIds[st.scope] || (pivotIds[st.scope] = {});
      for (const [g, ids] of Object.entries(st.prebuilt || {})) if (g !== 'base') (P[g] ||= []).push(...ids);
      for (const a of st.actions) if (a.at) (P[a.at] ||= []).push(...(a.parts || []).map(e => e.id));
    }
    for (const st of steps) {
      const S = scopes[st.scope] || (scopes[st.scope] = { placed: {}, stations: {}, orient: null });
      for (const [n, sd] of Object.entries(st.stations || {})) S.stations[n] = stationXform(sd);
      for (const [g, ids] of Object.entries(st.prebuilt || {})) for (const id of ids) S.placed[id] = g === 'base' ? null : g;
      startStates[st.id] = { placed: { ...S.placed }, stations: JSON.parse(JSON.stringify(S.stations)), orient: S.orient || st.orient };
      let orient = st.orient;
      for (const a of st.actions) {
        if (a.type === 'orient') orient = a.q;
        else if (a.type === 'move') S.stations[a.group] = stationXform(a.to);
        else if (a.type === 'join') {
          for (const [id, g] of Object.entries(S.placed)) if (g === a.group) S.placed[id] = a.into || null;
          if (!a.into) delete S.stations[a.group];
        } else for (const e of a.parts || []) S.placed[e.id] = a.at || null;
      }
      S.orient = orient;
    }
  })();

  // timeline of a step
  function timeline(st) {
    let t = 0.5; const out = [];
    for (const a of st.actions) {
      const n = (a.parts || []).length;
      let dur, stag = 0, each = 0;
      if (a.type === 'orient' || a.type === 'move') dur = 1.7;
      else if (a.type === 'join') dur = 2.4;
      else if (a.type === 'screw') { each = 1.7; stag = n > 1 ? clamp(5.5 / n, 0.22, 1.25) : 0; dur = each + stag * (n - 1); }
      else if (a.type === 'insert') { each = 1.7; stag = n > 1 ? clamp(4.5 / n, 0.22, 1.1) : 0; dur = each + stag * (n - 1); }
      else if (a.type === 'nut') { each = 1.1; stag = n > 1 ? clamp(2.8 / n, 0.12, 0.5) : 0; dur = each + stag * (n - 1); }
      else { each = 1.9; stag = n > 1 ? (a.stagger ?? clamp(2.4 / n, 0.08, 0.35)) : 0; dur = each + stag * (n - 1); }
      out.push({ a, t0: t, t1: t + dur, each, stag });
      t += dur + 0.4;
    }
    return { items: out, total: t + 1.2 };
  }

  // ---------------------------------------------------------------- per-frame evaluation
  let cur = null;   // { step, asset, tl, start, boundaries, t }
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();
  function groupMatrix(st, center) {
    // station transform about the group's centre, in CAD coordinates
    const m = new THREE.Matrix4();
    if (!st) return m;
    const q = Q(st.rot);
    m.makeTranslation(center.x, center.y, center.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    m.premultiply(new THREE.Matrix4().makeTranslation(st.offset[0], st.offset[1], st.offset[2]));
    return m;
  }
  const pivotCache = {};
  function groupCenter(asset, placed, g, scope) {
    const key = `${scope}|${g}`;
    if (pivotCache[key]) return pivotCache[key];
    const box = new THREE.Box3();
    for (const id of (pivotIds[scope] || {})[g] || []) if (asset.parts[id]) box.union(asset.parts[id].box);
    if (box.isEmpty()) for (const [id, gg] of Object.entries(placed)) if (gg === g && asset.parts[id]) box.union(asset.parts[id].box);
    return (pivotCache[key] = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3()));
  }

  // static state after k actions (k = 0..n), used for bench placement and camera framing
  function staticState(st, k) {
    const s0 = startStates[st.id];
    const placed = { ...s0.placed }; const stations = JSON.parse(JSON.stringify(s0.stations)); let orient = s0.orient;
    for (const a of st.actions.slice(0, k)) {
      if (a.type === 'orient') orient = a.q;
      else if (a.type === 'move') stations[a.group] = stationXform(a.to);
      else if (a.type === 'join') { for (const [id, g] of Object.entries(placed)) if (g === a.group) placed[id] = a.into || null; if (!a.into) delete stations[a.group]; }
      else for (const e of a.parts || []) placed[e.id] = a.at || null;
    }
    if (k === 0) orient = st.actions[0]?.type === 'orient' ? s0.orient : st.orient;
    return { placed, stations, orient, scope: st.scope };
  }
  function placement(asset, state) {
    // every group (main body and each station) rests on the bench; the main body is centred
    const qo = Q(state.orient); const res = {};
    const groups = {};
    for (const [id, g] of Object.entries(state.placed)) if (asset.parts[id]) (groups[g ?? ''] ||= []).push(id);
    const centers = {};
    for (const g of Object.keys(groups)) centers[g] = groupCenter(asset, state.placed, g === '' ? null : g, state.scope);
    for (const [g, ids] of Object.entries(groups)) {
      const gm = g === '' ? new THREE.Matrix4() : groupMatrix(state.stations[g], centers[g]);
      const box = new THREE.Box3();
      for (const id of ids) {
        const b = asset.parts[id].box.clone().applyMatrix4(gm);
        const pts = corners(b).map(p => p.applyQuaternion(qo));
        for (const p of pts) box.expandByPoint(p);
      }
      res[g] = box;
    }
    const main = res[''] || Object.values(res)[0] || new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
    const c = main.getCenter(new THREE.Vector3());
    const shift = {};
    for (const [g, box] of Object.entries(res)) shift[g] = new THREE.Vector3(-c.x, -c.y, -box.min.z);
    return { shift, centers };
  }
  function corners(b) {
    const out = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(new THREE.Vector3(x, y, z));
    return out;
  }

  async function loadStep(st, { autoplay = true, t = 0 } = {}) {
    const asset = await loadAsset(st.chapter.asset);
    for (const a of Object.values(assets)) a.group.visible = a === asset;
    const tl = timeline(st);
    const boundaries = [];
    for (let k = 0; k <= st.actions.length; k++) { const s = staticState(st, k); boundaries.push({ state: s, place: placement(asset, s) }); }
    cur = { st, asset, tl, boundaries, t, playing: autoplay && !reduced, cam: null };
    stepLabel.textContent = `${st.ci + 1}.${st.si + 1}  ${st.title}`;
    scrub.max = tl.total.toFixed(2); scrub.value = t;
    updatePlayButton();
    autoCam = true; btnCam?.setAttribute('aria-pressed', 'true');
    evaluate(t, true);
    markStep(st);
  }

  // part pose during its own motion: u = 0 (approach) .. 1 (seated)
  function partOffset(type, e, a, u, out, up = null) {
    // returns translation (CAD frame) and spin angle about e.d through e.head
    const d = e.d ? V(e.d).normalize() : (a.d ? V(a.d).normalize() : new THREE.Vector3(0, 0, 1));
    let dist = a.dist ?? 0;
    if (type === 'screw') dist = dist || Math.max(0.012, (e.L || 0.01) * 1.25);
    else if (type === 'insert') dist = dist || 0.018;
    else if (type === 'nut') dist = dist || 0.02;
    else dist = dist || 0.05;
    const w = 1 - ease(u);
    out.t.copy(d).multiplyScalar(dist * w);
    if (type === 'place' || type === 'nut') out.t.addScaledVector(up || new THREE.Vector3(0, 0, 1), 0.03 * Math.sin(Math.PI * clamp(1 - u, 0, 1)) * (type === 'place' ? 1 : 0.4));
    out.spin = type === 'screw' ? (1 - easeOut(u)) * Math.PI * 2 * 5 : 0;
    out.d = d;
    return out;
  }

  const off = { t: new THREE.Vector3(), spin: 0, d: new THREE.Vector3() };
  function evaluate(t, snapCam = false) {
    if (!cur) return;
    const { st, asset, tl, boundaries } = cur;
    const s0 = startStates[st.id];
    const placed = { ...s0.placed }; const stations = JSON.parse(JSON.stringify(s0.stations));
    let orientQ = Q(s0.orient); let lift = 0;
    const visible = new Set(Object.keys(placed));
    const motion = {};   // id -> {type, e, a, u}
    let active = null, activeIdx = -1;
    // station interpolation targets during joins/moves
    const stationLerp = {};
    tl.items.forEach((it, i) => {
      const a = it.a;
      if (t < it.t0) {
        // not started: its parts are hidden
        for (const e of a.parts || []) visible.delete(e.id);
        return;
      }
      const u = clamp((t - it.t0) / (it.t1 - it.t0), 0, 1);
      if (t <= it.t1 + 0.4) { active = it; activeIdx = i; }
      if (a.type === 'orient') {
        const from = orientQ.clone(); orientQ = from.slerp(Q(a.q), ease(u)); lift = Math.max(lift, Math.sin(Math.PI * u) * 0.05);
      } else if (a.type === 'move') {
        const from = stations[a.group] || { offset: [0, 0, 0], rot: ORIENT0 };
        stationLerp[a.group] = { from: stationXform(from), to: stationXform(a.to), u: ease(u), arc: Math.sin(Math.PI * u) * 0.06 };
        if (u >= 1) { stations[a.group] = stationXform(a.to); delete stationLerp[a.group]; }
      } else if (a.type === 'join') {
        const from = stations[a.group] || { offset: [0, 0, 0], rot: ORIENT0 };
        const to = a.into ? (stations[a.into] || { offset: [0, 0, 0], rot: ORIENT0 }) : { offset: [0, 0, 0], rot: ORIENT0 };
        if (u < 1) stationLerp[a.group] = { from: stationXform(from), to: stationXform(to), u: ease(u), arc: Math.sin(Math.PI * u) * 0.08, join: true, intoGroup: a.into || null };
        else { for (const [id, g] of Object.entries(placed)) if (g === a.group) placed[id] = a.into || null; delete stations[a.group]; }
      } else {
        const n = a.parts.length;
        a.parts.forEach((e, k) => {
          const uk = clamp((t - it.t0 - k * it.stag) / it.each, 0, 1);
          placed[e.id] = a.at || null;
          if (uk <= 0) { visible.delete(e.id); return; }
          visible.add(e.id);
          if (uk < 1) motion[e.id] = { type: a.type, e, a, u: uk };
        });
      }
    });
    // bench placement: interpolate between the boundaries of the current action
    let pl;
    let activeItemIndex = Math.max(0, tl.items.findIndex(it => t < it.t1));
    if (tl.items.findIndex(it => t < it.t1) < 0) activeItemIndex = tl.items.length - 1;
    {
      let i = tl.items.findIndex(it => t < it.t1);
      if (i < 0) pl = boundaries[boundaries.length - 1].place;
      else {
        const it = tl.items[i];
        const u = ease(clamp((t - it.t0) / (it.t1 - it.t0), 0, 1));
        const A = boundaries[i].place, B = boundaries[i + 1].place;
        pl = { shift: {}, centers: { ...A.centers, ...B.centers } };
        const keys = new Set([...Object.keys(A.shift), ...Object.keys(B.shift)]);
        for (const g of keys) {
          const a0 = A.shift[g] || B.shift[g], b0 = B.shift[g] || A.shift[g];
          pl.shift[g] = a0.clone().lerp(b0, u);
        }
      }
    }
    const mainShift = pl.shift[''] || new THREE.Vector3();
    // workpiece transform: orientation then bench shift
    const W = new THREE.Matrix4().makeRotationFromQuaternion(orientQ);
    const WS = new THREE.Matrix4().makeTranslation(mainShift.x, mainShift.y, mainShift.z + lift).multiply(W);
    const gmats = {};
    const fullMatrix = (g, sx, shift) => {
      if (g == null || !sx) return new THREE.Matrix4().makeTranslation(shift.x, shift.y, shift.z + lift).multiply(W);
      const c = groupCenter(asset, placed, g, st.scope);
      return new THREE.Matrix4().makeTranslation(mainShift.x, mainShift.y, shift.z + lift).multiply(W).multiply(groupMatrix(sx, c));
    };
    const lerpMatrix = (A, B, u, arc) => {
      const pa = new THREE.Vector3(), qa = new THREE.Quaternion(), sa = new THREE.Vector3();
      const pb = new THREE.Vector3(), qb = new THREE.Quaternion(), sb = new THREE.Vector3();
      A.decompose(pa, qa, sa); B.decompose(pb, qb, sb);
      const p = pa.lerp(pb, u); p.z += arc;
      return new THREE.Matrix4().compose(p, qa.slerp(qb, u), new THREE.Vector3(1, 1, 1));
    };
    const gm = (g) => {
      if (g == null) return WS;
      if (gmats[g]) return gmats[g];
      const sh = pl.shift[g] || mainShift;
      const L = stationLerp[g];
      let m;
      if (L) {
        const iA = activeItemIndex, A = boundaries[iA].place, B = boundaries[iA + 1].place;
        const from = fullMatrix(g, L.from, A.shift[g] || sh);
        const into = L.join ? L.intoGroup : g;
        const to = into == null ? fullMatrix(null, null, B.shift[''] || mainShift) : fullMatrix(into, L.to, B.shift[into] || sh);
        m = lerpMatrix(from, to, L.u, L.arc);
      } else m = fullMatrix(g, stations[g] || { offset: [0, 0, 0], rot: ORIENT0 }, sh);
      return (gmats[g] = m);
    };
    // apply to parts
    let toolPose = null;
    const movingIds = [];
    for (const p of Object.values(asset.parts)) {
      const vis = visible.has(p.id);
      p.obj.visible = vis;
      if (!vis) continue;
      const M = gm(placed[p.id] ?? null).clone();
      const mo = motion[p.id];
      if (mo) {
        const inv = new THREE.Matrix4().extractRotation(M).invert();
        partOffset(mo.type, mo.e, mo.a, mo.u, off, new THREE.Vector3(0, 0, 1).applyMatrix4(inv));
        const L = new THREE.Matrix4().makeTranslation(off.t.x, off.t.y, off.t.z);
        if (off.spin && mo.e.head) {
          const h = V(mo.e.head);
          L.multiply(new THREE.Matrix4().makeTranslation(h.x, h.y, h.z)).multiply(new THREE.Matrix4().makeRotationAxis(off.d, off.spin)).multiply(new THREE.Matrix4().makeTranslation(-h.x, -h.y, -h.z));
        }
        M.multiply(L);
        movingIds.push(p.id);
        if (mo.type === 'screw' || mo.type === 'insert') toolPose = { mo, M: gm(placed[p.id] ?? null), off: { t: off.t.clone(), spin: off.spin, d: off.d.clone() } };
      }
      p.obj.matrix.copy(M);
      setHot(p, mo ? 1 : 0, mo?.type === 'insert' ? mo.u : null);
    }
    work.updateMatrixWorld(true);
    updateTools(toolPose, t);
    updateGuide(motion, gm, placed);
    // caption and action highlight
    const it = active || tl.items[0];
    if (it) { caption.textContent = it.a.cap; caption.hidden = false; }
    markAction(activeIdx);
    // camera
    updateCamera(activeIdx, gm, placed, visible, snapCam);
    scrub.value = t;
  }

  function setHot(p, h, insertU) {
    if (p.hot === h && insertU == null) return;
    p.hot = h;
    p.obj.traverse(m => {
      if (!m.isMesh) return;
      if (insertU != null) {
        const glow = Math.sin(Math.PI * clamp(insertU * 1.4, 0, 1));
        m.material.emissive.setRGB(0.9 * glow, 0.32 * glow, 0.05 * glow);
      } else m.material.emissive.setRGB(h ? 0.05 : 0, h ? 0.025 : 0, 0);
    });
  }

  // ---------------------------------------------------------------- tools
  function updateTools(pose, t) {
    for (const k in toolKit) toolKit[k].visible = false;
    if (!pose) return;
    const { mo } = pose;
    const kind = mo.type === 'insert' ? 'iron' : (mo.e.tool || 'hand');
    if (kind === 'hand') return;
    const tool = toolKit[kind.startsWith('hex') ? 'hex' : kind];
    if (!tool) return;
    const head = V(mo.e.head || [0, 0, 0]);
    const d = pose.off.d;
    // tool tip at the (moving) head, aligned with the screw axis; the hex key also turns
    const tip = head.clone().add(pose.off.t);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    const spin = new THREE.Quaternion().setFromAxisAngle(d, pose.off.spin);
    q.premultiply(spin);
    const size = kind.startsWith('hex') ? parseFloat(kind.slice(3)) : 3;
    const s = kind.startsWith('hex') ? clamp(size / 2.5, 0.6, 1.6) : 1;
    // fade in/out at the ends of the motion
    const u = mo.u, away = (u < 0.12 ? (0.12 - u) / 0.12 : u > 0.9 ? (u - 0.9) / 0.1 : 0) * 0.03;
    tip.addScaledVector(d, away);
    m.compose(tip, q, new THREE.Vector3(s, s, s));
    tool.matrix.copy(pose.M).multiply(m);
    tool.matrixAutoUpdate = false; tool.visible = true;
  }
  function updateGuide(motion, gm, placed) {
    const ids = Object.keys(motion).filter(id => motion[id].type === 'place' || motion[id].type === 'nut');
    if (!ids.length) { guideLine.visible = false; return; }
    const mo = motion[ids[ids.length - 1]]; const p = cur.asset.parts[mo.e.id];
    const M = gm(placed[mo.e.id] ?? null);
    const a = p.center.clone().applyMatrix4(M);
    partOffset(mo.type, mo.e, mo.a, 0, off);
    const b = p.center.clone().add(off.t).applyMatrix4(M);
    guideLine.geometry.setFromPoints([a, b]); guideLine.computeLineDistances(); guideLine.visible = mo.u < 0.95;
  }

  // ---------------------------------------------------------------- camera
  let camGoal = null; const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
  function updateCamera(idx, gm, placed, visible, snap) {
    if (!autoCam && !snap) return;
    const { st, asset, tl } = cur;
    const key = idx < 0 ? 'step' : idx;
    if (!cur.cam || cur.cam.key !== key || snap) {
      const box = new THREE.Box3(); let dir = null;
      const ids = idx < 0 ? [...new Set([...visible, ...tl.items.flatMap(it => (it.a.parts || []).map(e => e.id))])] : focusIds(tl.items[idx].a, placed);
      for (const id of ids) {
        const p = asset.parts[id]; if (!p) continue;
        const M = gm(placed[id] ?? null);
        box.union(p.box.clone().applyMatrix4(M));
      }
      if (box.isEmpty()) for (const id of visible) { const p = asset.parts[id]; if (p) box.union(p.box.clone().applyMatrix4(gm(placed[id] ?? null))); }
      const a = idx >= 0 ? tl.items[idx].a : null;
      if (a && a.parts && a.parts.length) {
        const e = a.parts[0]; const d = e.d || a.d;
        if (d) {
          const M = gm(placed[e.id] ?? null); dir = V(d).transformDirection(M);
          // include the approach path in the frame
          const p = asset.parts[e.id];
          if (p) { partOffset(a.type, e, a, 0, off); box.expandByPoint(p.center.clone().add(off.t).applyMatrix4(M)); }
        }
      }
      const whole = new THREE.Box3();
      for (const id of visible) { const p = asset.parts[id]; if (p) whole.union(p.box.clone().applyMatrix4(gm(placed[id] ?? null))); }
      // keep some of the workpiece in view for context
      const ctx = whole.getSize(new THREE.Vector3()).length();
      const size = Math.max(box.getSize(new THREE.Vector3()).length(), ctx * (idx < 0 ? 1 : 0.55), 0.07);
      const target = box.getCenter(new THREE.Vector3());
      const view = cameraDir(a && a.view ? V(a.view) : dir);
      const dist = size / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.12;
      camGoal = { target, pos: target.clone().addScaledVector(view, dist) };
      cur.cam = { key };
      if (snap) { camPos.copy(camGoal.pos); camTarget.copy(camGoal.target); }
    }
  }
  function cameraDir(d) {
    const up = new THREE.Vector3(0, 0, 1);
    const def = new THREE.Vector3(0.62, -0.95, 0.78).normalize();
    if (!d) return def;
    d = d.clone().normalize();
    if (d.z > 0.85) return def;
    if (d.z < -0.6) return new THREE.Vector3(0.7, -0.9, 0.25).normalize();
    const side = new THREE.Vector3().crossVectors(up, d).normalize();
    const v = d.clone().multiplyScalar(0.75).addScaledVector(up, 0.75).addScaledVector(side, -0.55);
    if (v.y > 0.2 && Math.abs(v.x) < 0.3) v.x += 0.4;
    v.normalize(); if (v.z < 0.3) { v.z = 0.3; v.normalize(); }
    return v;
  }
  function focusIds(a, placed) {
    if (a.type === 'join' || a.type === 'move') return Object.keys(placed).filter(id => placed[id] === a.group || (a.into && placed[id] === a.into) || (a.type === 'join' && !a.into && placed[id] == null));
    if (a.type === 'orient') return Object.keys(placed);
    return (a.parts || []).map(e => e.id);
  }
  function applyCamera(dt) {
    if (!camGoal) return;
    if (autoCam) {
      const k = 1 - Math.exp(-dt * 2.6);
      camPos.lerp(camGoal.pos, k); camTarget.lerp(camGoal.target, k);
      // bench Z-up -> three.js Y-up
      camera.position.copy(camPos).applyMatrix4(world.matrixWorld);
      controls.target.copy(camTarget).applyMatrix4(world.matrixWorld);
    }
    // shadow camera follows the workpiece
    const tgt = controls.target;
    key.position.set(tgt.x + 0.6, tgt.y + 1.4, tgt.z + 0.5); key.target.position.copy(tgt);
    const sc = key.shadow.camera; const r = Math.max(0.25, camera.position.distanceTo(tgt) * 0.8);
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 0.05; sc.far = 4; sc.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- UI glue
  const stepEls = [...document.querySelectorAll('.build-step[data-step]')];
  function markStep(st) {
    for (const el of stepEls) el.classList.toggle('is-active', el.dataset.step === st.id);
  }
  let lastAction = null;
  function markAction(i) {
    const key = cur.st.id + ':' + i; if (key === lastAction) return; lastAction = key;
    const el = stepEls.find(x => x.dataset.step === cur.st.id);
    for (const s of stepEls) s.querySelectorAll('.build-actions li').forEach(li => li.classList.remove('is-current'));
    if (el && i >= 0) el.querySelectorAll('.build-actions li')[i]?.classList.add('is-current');
  }
  function updatePlayButton() {
    btnPlay.setAttribute('aria-label', cur?.playing ? 'Pause' : 'Play');
    btnPlay.dataset.state = cur?.playing ? 'playing' : 'paused';
  }
  btnPlay.addEventListener('click', () => {
    if (!cur) return;
    if (!cur.playing && cur.t >= cur.tl.total - 0.05) cur.t = 0;
    cur.playing = !cur.playing; updatePlayButton();
  });
  btnPrev.addEventListener('click', () => go(-1));
  btnNext.addEventListener('click', () => go(1));
  btnCam?.addEventListener('click', () => { autoCam = true; btnCam.setAttribute('aria-pressed', 'true'); if (cur) cur.cam = null; });
  scrub.addEventListener('input', () => { if (!cur) return; cur.t = parseFloat(scrub.value); cur.playing = false; updatePlayButton(); evaluate(cur.t); });
  function go(delta) {
    if (!cur) return;
    const next = steps[cur.st.index + delta]; if (!next) return;
    scrollToStep(next.id);
    loadStep(next, { autoplay: true });
  }
  function scrollToStep(id) {
    const el = stepEls.find(x => x.dataset.step === id);
    if (el) { programmaticScroll = performance.now(); el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }
  }
  let programmaticScroll = 0;
  for (const el of stepEls) {
    el.querySelectorAll('.build-actions li').forEach((li, i) => {
      li.tabIndex = 0;
      const seek = async () => {
        const st = byId[el.dataset.step];
        if (!cur || cur.st !== st) await loadStep(st, { autoplay: false });
        const it = cur.tl.items[i]; cur.t = Math.max(0, it.t0 - 0.05); cur.playing = true; updatePlayButton(); cur.cam = null; autoCam = true;
      };
      li.addEventListener('click', seek);
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seek(); } });
    });
    el.querySelector('.build-play')?.addEventListener('click', () => { const st = byId[el.dataset.step]; loadStep(st, { autoplay: true }); });
  }
  // the step under the reading line becomes the active one. Beside the steps the line sits at 40 % of the
  // viewport; when the player is stacked above the steps (narrow screens) it sits just below the player.
  if (!stillMode) {
    const playerEl = root.querySelector('.build-player');
    let timer = 0;
    const sync = () => {
      timer = 0;
      if (performance.now() - programmaticScroll < 1200) return;
      const pr = playerEl.getBoundingClientRect();
      const fr = stepEls[0]?.getBoundingClientRect();
      const stacked = fr && pr.left < fr.right - 1 && pr.right > fr.left + 1;
      const y = stacked ? Math.max(pr.bottom, 0) + (innerHeight - Math.max(pr.bottom, 0)) * 0.25 : innerHeight * 0.4;
      let best = null, bestD = Infinity;
      for (const el of stepEls) {
        const r = el.getBoundingClientRect();
        const d = r.top <= y && r.bottom >= y ? 0 : Math.min(Math.abs(r.top - y), Math.abs(r.bottom - y));
        if (d < bestD) { bestD = d; best = el; }
      }
      // only once the steps are on screen
      if (!best || bestD > innerHeight * 0.5) return;
      const st = byId[best.dataset.step];
      if (st && (!cur || cur.st !== st)) loadStep(st, { autoplay: true });
    };
    addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(sync, 160); }, { passive: true });
  }
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight' && e.altKey) go(1);
    if (e.key === 'ArrowLeft' && e.altKey) go(-1);
  });

  // ---------------------------------------------------------------- loop
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage); resize();
  let last = performance.now();
  let visibleOnScreen = true;
  new IntersectionObserver(([e]) => { visibleOnScreen = e.isIntersecting; }).observe(stage);
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (cur && visibleOnScreen) {
      if (cur.playing) {
        cur.t += dt * parseFloat(speedSel?.value || '1');
        if (cur.t >= cur.tl.total) { cur.t = cur.tl.total; cur.playing = false; updatePlayButton(); }
        evaluate(cur.t);
      }
      applyCamera(dt);
      controls.update();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- stills (used to render the print images)
  window.primusBuild = {
    steps: steps.map(s => s.id),
    async show(id, frac = 1, view = null) {
      const st = byId[id];
      await loadStep(st, { autoplay: false });
      const t = frac >= 1 ? cur.tl.total : cur.tl.total * frac;
      cur.t = t; autoCam = true; evaluate(t, true);
      if (view) { camGoal.pos.copy(camGoal.target).addScaledVector(V(view).normalize(), camGoal.pos.distanceTo(camGoal.target)); }
      camPos.copy(camGoal.pos); camTarget.copy(camGoal.target);
      applyCamera(1); controls.update(); renderer.render(scene, camera);
      return true;
    },
    async explode(id) {
      // every new part of the step shown at 35 % of its travel: an exploded view of the step
      const st = byId[id];
      await loadStep(st, { autoplay: false });
      const items = cur.tl.items;
      const tEnd = cur.tl.total;
      const s0 = startStates[st.id];
      cur.t = tEnd; evaluate(tEnd, true);
      const sEnd = cur.boundaries[cur.boundaries.length - 1].state;
      const pl = cur.boundaries[cur.boundaries.length - 1].place;
      const W = new THREE.Matrix4().makeRotationFromQuaternion(Q(sEnd.orient));
      const box = new THREE.Box3();
      for (const it of items) for (const e of it.a.parts || []) {
        const p = cur.asset.parts[e.id]; if (!p) continue;
        const g = sEnd.placed[e.id];
        const sh = pl.shift[g ?? ''] || pl.shift[''];
        const M = new THREE.Matrix4().makeTranslation(sh.x, sh.y, sh.z).multiply(W).multiply(groupMatrix(sEnd.stations[g], pl.centers[g] || new THREE.Vector3()));
        partOffset(it.a.type, e, it.a, 0.32, off);
        // a part that came in from above before the piece was turned over would now explode into the bench:
        // send it the other way
        const dz = new THREE.Vector3(off.t.x, off.t.y, off.t.z).transformDirection(M).z;
        if (dz < -0.3 && (it.a.type === 'place' || it.a.type === 'nut')) off.t.multiplyScalar(-1);
        p.obj.matrix.copy(M).multiply(new THREE.Matrix4().makeTranslation(off.t.x, off.t.y, off.t.z));
        box.union(p.box.clone().applyMatrix4(p.obj.matrix));
      }
      work.updateMatrixWorld(true);
      for (const k in toolKit) toolKit[k].visible = false; guideLine.visible = false; caption.hidden = true;
      if (!box.isEmpty()) {
        // frame the parts this step adds, with a little of the workpiece around them
        const size = Math.max(box.getSize(new THREE.Vector3()).length() * 1.15, 0.15);
        const target = box.getCenter(new THREE.Vector3());
        const dist = size / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.1;
        camPos.copy(target).addScaledVector(cameraDir(null), dist); camTarget.copy(target);
        camGoal = { pos: camPos.clone(), target: camTarget.clone() };
        camera.position.copy(camPos).applyMatrix4(world.matrixWorld); controls.target.copy(camTarget).applyMatrix4(world.matrixWorld);
        camera.lookAt(controls.target); applyCamera(0);
      }
      renderer.render(scene, camera);
      return { min: box.min.toArray(), max: box.max.toArray() };
    },
  };
  // start with the first step (or the one in the URL hash)
  const startId = (location.hash.match(/^#step-(.+)$/) || [])[1];
  // it starts playing once the player is on screen; with reduced motion it shows the finished step instead
  if (!stillMode) {
    await loadStep(byId[startId] || steps[0], { autoplay: true });
    if (reduced) { cur.t = cur.tl.total; evaluate(cur.t, true); }
  }
}

// ---------------------------------------------------------------- bench and tools
function makeBench() {
  const g = new THREE.Group();
  // cutting mat: dark green with a 10 mm grid, heavier lines every 50 mm
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#2f5d4e'; x.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i <= 10; i++) {
    const p = Math.round(i * 102.4);
    x.strokeStyle = i % 5 === 0 ? 'rgba(235,240,230,0.55)' : 'rgba(235,240,230,0.22)';
    x.lineWidth = i % 5 === 0 ? 3 : 1.5;
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 1024); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(1024, p); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const W = 2.4, H = 1.7;
  tex.repeat.set(W / 0.1, H / 0.1);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 }));
  mat.receiveShadow = true; mat.position.z = -0.0005;
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0xb69b7c, roughness: 0.75 }));
  desk.receiveShadow = true; desk.position.z = -0.002;
  g.add(desk, mat);
  return g;
}
function makeTools() {
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.85, roughness: 0.35 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.2 });
  const grip = new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.7 });
  // hex key (2.5 mm scale; scaled per screw): short leg along +Z from the tip, long leg along +X
  const hex = new THREE.Group();
  const a = 0.0025;
  const short = new THREE.Mesh(new THREE.CylinderGeometry(a / 1.732 * 1.15, a / 1.732 * 1.15, 0.02, 6), steel);
  short.rotation.x = Math.PI / 2; short.position.z = 0.01;
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(a * 0.62, 12, 8), steel); elbow.position.z = 0.02;
  const long = new THREE.Mesh(new THREE.CylinderGeometry(a / 1.732 * 1.15, a / 1.732 * 1.15, 0.07, 6), steel);
  long.rotation.z = Math.PI / 2; long.position.set(0.035, 0, 0.02);
  hex.add(short, elbow, long);
  // phillips screwdriver along +Z
  const phillips = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.08, 16), chrome); shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.04;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.09, 24), grip); handle.rotation.x = Math.PI / 2; handle.position.z = 0.125;
  phillips.add(shaft, handle);
  // soldering iron with an insert tip
  const iron = new THREE.Group();
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0012, 0.012, 16), chrome); tip.rotation.x = Math.PI / 2; tip.position.z = 0.006;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 20), chrome); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.037;
  const ig = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.008, 0.08, 24), black); ig.rotation.x = Math.PI / 2; ig.position.z = 0.1;
  iron.add(tip, barrel, ig);
  for (const t of [hex, phillips, iron]) t.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { hex, phillips, iron };
}
