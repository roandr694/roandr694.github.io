// Animated assembly steps for the PRIMUS build guide. One WebGL canvas is shared by all steps and moves into the
// step being played. Parts and steps come from the Fusion 360 assembly (files/primus/model): each phase of a step
// brings its parts in from an offset, in order, then the animation holds and loops.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE = document.querySelector('[data-assembly-model]')?.dataset.assemblyModel;
const PHASE = 1.5, GAP = 0.35, HOLD = 1.6, LEAD = 0.6;
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let world = null;      // { renderer, scene, camera, controls, robot, nodes, parts, steps }
let loading = null;
let active = null;     // { li, step, start, paused, pausedAt }

function load() {
  if (loading) return loading;
  loading = (async () => {
    const [parts, steps, gltf] = await Promise.all([
      fetch(BASE + 'parts.json').then(r => r.json()),
      fetch(BASE + 'steps.json').then(r => r.json()),
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(BASE + 'primus.glb', e => {
        if (e.total && active) active.status.textContent = `Loading the model… ${Math.round(100 * e.loaded / e.total)}%`;
      })
    ]);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'asm-canvas';
    renderer.domElement.setAttribute('aria-label', 'Animated 3D view of this assembly step. Drag to orbit, scroll to zoom.');
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#ffffff');
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.8;
    const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(1.2, 2.4, -1); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 4; sun.shadow.bias = -0.0004;
    Object.assign(sun.shadow.camera, { left: -0.9, right: 0.9, top: 0.9, bottom: -0.9, near: 0.3, far: 6 });
    scene.add(sun, sun.target, new THREE.HemisphereLight('#ffffff', '#bdbdb5', 0.5));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.12 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 30);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
    const robot = new THREE.Group(); robot.rotation.x = -Math.PI / 2; scene.add(robot);
    const byId = Object.fromEntries(parts.map(p => [p.id, p]));
    const nodes = {};
    for (const child of [...gltf.scene.children]) {
      const p = byId[child.name]; if (!p) continue;
      child.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.material = o.material.clone(); o.material.color.convertSRGBToLinear(); } });
      child.userData.home = child.position.clone();
      child.userData.center = new THREE.Vector3(...p.min).add(new THREE.Vector3(...p.max)).multiplyScalar(0.5);
      robot.add(child); nodes[p.id] = child;
    }
    world = { renderer, scene, camera, controls, robot, floor, nodes, parts: byId, steps: Object.fromEntries(steps.map(s => [s.id, s])) };
    renderer.setAnimationLoop(tick);
    new ResizeObserver(resize).observe(document.body);
    return world;
  })();
  return loading;
}

function offsetOf(phase, id) {
  if (phase.side !== undefined) return new THREE.Vector3(Math.sign(world.nodes[id].userData.center.x || 1) * phase.side, 0, 0);
  return new THREE.Vector3(...phase.offset);
}

function duration(step) { return LEAD + step.phases.length * (PHASE + GAP) + HOLD; }

// position every part of the step for time t (seconds since the loop started)
function pose(step, t) {
  for (const id of step.new) world.nodes[id]?.position.copy(world.nodes[id].userData.home);
  step.phases.forEach((phase, k) => {
    const start = LEAD + k * (PHASE + GAP);
    const remain = 1 - ease((t - start) / PHASE);
    for (const id of phase.parts) {
      const n = world.nodes[id]; if (!n) continue;
      n.position.addScaledVector(offsetOf(phase, id), remain);
      const moving = t > start && t < start + PHASE;
      n.traverse(o => { if (o.isMesh) o.material.emissive.setRGB(0, moving ? 0.035 : 0, moving ? 0.02 : 0); });
    }
  });
}

function frame(step) {
  const { camera, controls, robot } = world;
  pose(step, 0); robot.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const id of [...step.new, ...step.context]) if (world.nodes[id]) box.expandByObject(world.nodes[id]);
  const center = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const v = step.view; const dir = new THREE.Vector3(v[0], v[2], -v[1]).normalize();  // robot (x,y,z) -> three (x,z,-y)
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(dir, r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.88);
  camera.near = r / 50; camera.far = r * 40; camera.updateProjectionMatrix();
  world.floor.position.y = box.min.y - 0.002;
}

function show(step) {
  const visible = new Set([...step.new, ...step.context]);
  for (const [id, n] of Object.entries(world.nodes)) { n.visible = visible.has(id); n.position.copy(n.userData.home); }
}

function resize() {
  if (!world || !active) return;
  const el = world.renderer.domElement.parentElement; if (!el) return;
  const w = el.clientWidth, h = el.clientHeight;
  world.renderer.setSize(w, h, false); world.camera.aspect = w / h; world.camera.updateProjectionMatrix();
}

const clock = new THREE.Clock();
function tick() {
  if (!active || !world) return;
  const now = clock.getElapsedTime();
  const step = active.step;
  let t = active.paused ? active.pausedAt : (now - active.start) % duration(step);
  if (reduced && !active.paused) t = duration(step) - 0.01;
  pose(step, t);
  active.bar.style.width = `${100 * t / duration(step)}%`;
  world.controls.update();
  world.renderer.render(world.scene, world.camera);
}

async function play(li) {
  const id = li.dataset.step;
  if (active && active.li === li) { togglePause(); return; }
  stop();
  const stage = li.querySelector('.asm-stage');
  const status = Object.assign(document.createElement('p'), { className: 'asm-status', textContent: 'Loading the model…' });
  const bar = Object.assign(document.createElement('span'), { className: 'asm-progress' });
  stage.append(status, bar);
  active = { li, stage, status, bar, step: null, start: 0, paused: false, pausedAt: 0 };
  li.classList.add('asm-playing');
  li.querySelector('.asm-play').textContent = 'Pause';
  li.querySelector('.asm-play').setAttribute('aria-pressed', 'true');
  try { await load(); } catch (e) { status.textContent = 'The 3D model could not be loaded.'; return; }
  if (!active || active.li !== li) return;
  status.remove();
  active.step = world.steps[id];
  stage.prepend(world.renderer.domElement);
  resize(); show(active.step); frame(active.step);
  active.start = clock.getElapsedTime();
}

function togglePause() {
  if (!active || !active.step) return;
  const btn = active.li.querySelector('.asm-play');
  if (active.paused) { active.start = clock.getElapsedTime() - active.pausedAt; active.paused = false; btn.textContent = 'Pause'; }
  else { active.pausedAt = (clock.getElapsedTime() - active.start) % duration(active.step); active.paused = true; btn.textContent = 'Play'; }
  btn.setAttribute('aria-pressed', String(!active.paused));
}

function stop() {
  if (!active) return;
  const { li, status, bar } = active;
  li.classList.remove('asm-playing');
  const btn = li.querySelector('.asm-play'); btn.textContent = 'Play animation'; btn.setAttribute('aria-pressed', 'false');
  status?.remove(); bar?.remove();
  world?.renderer.domElement.remove();
  active = null;
}

for (const li of document.querySelectorAll('.assembly-step[data-step]')) {
  const img = li.querySelector('img');
  const stage = document.createElement('div'); stage.className = 'asm-stage';
  img.replaceWith(stage); stage.append(img);
  const tools = document.createElement('div'); tools.className = 'asm-tools';
  const playBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'asm-play', textContent: 'Play animation' });
  playBtn.setAttribute('aria-pressed', 'false');
  playBtn.addEventListener('click', () => play(li));
  const replay = Object.assign(document.createElement('button'), { type: 'button', className: 'asm-replay', textContent: 'Restart' });
  replay.addEventListener('click', () => { if (active?.li === li && active.step) { active.start = clock.getElapsedTime(); active.paused = false; playBtn.textContent = 'Pause'; } else play(li); });
  const close = Object.assign(document.createElement('button'), { type: 'button', className: 'asm-close', textContent: 'Show picture' });
  close.addEventListener('click', stop);
  tools.append(playBtn, replay, close);
  stage.after(tools);
}

// lets a test or a curious reader freeze the current step at a given time (seconds)
window.primusAssemblySeek = t => { if (active?.step) { active.paused = true; active.pausedAt = t; } };
