// Interactive 3D viewer for PRIMUS. Meshes and the closed 5-bar poses are exported from the MuJoCo model that
// is generated from the Fusion 360 assembly (see the PRIMUS repository, sim/tools and sim/models).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const PARTS = [
  { id: 'base', bodies: ['base'], name: 'Chassis', role: 'Structure and electronics',
    text: 'A frame of 20×20 mm aluminium profiles that carries the four hip actuators, the Milwaukee M18 battery, a Jetson Orin Nano, a Raspberry Pi 5, the RPLIDAR A1 on top, the RealSense D435i at the front and a WitMotion IMU. Its centre of mass sits about 2 cm below the hip axis.' },
  { id: 'armYp', bodies: ['armYp_xp', 'armYp_xm'], name: 'Front hip arm', role: 'Actuated input of the 5-bar',
    text: 'A 220 mm arm turned directly by the front hip actuator. Together with the rear arm it sets both the length and the angle of the leg.' },
  { id: 'armYm', bodies: ['armYm_xp', 'armYm_xm'], name: 'Rear hip arm', role: 'Actuated input of the 5-bar',
    text: 'A 220 mm arm on the rear hip actuator, 140 mm behind the front one. Moving the two arms in opposite directions shortens or extends the leg; moving them together swings it.' },
  { id: 'shin', bodies: ['shin_xp', 'shin_xm'], name: 'Shin with wheel actuator', role: 'Passive knee, carries the wheel motor',
    text: 'A 350 mm lower bar from the front knee to the wheel axle. The wheel actuator is mounted on it, which keeps the centre of mass of the whole leg close to the wheel and is why the balance controller models the leg with its real mass distribution.' },
  { id: 'linkYm', bodies: ['linkYm_xp', 'linkYm_xm'], name: 'Rear lower link', role: 'Closes the 5-bar loop',
    text: 'A 350 mm bar from the rear knee to the wheel axle. Its joint with the shin closes the kinematic loop, so the two knees are passive and follow the hips.' },
  { id: 'wheel', bodies: ['wheel_xp', 'wheel_xm'], name: 'Wheel', role: 'Drive and balance',
    text: 'A 215 mm wheel driven through a 9:1 quasi-direct-drive actuator. The robot balances on the two wheels like an inverted pendulum.' },
  { id: 'gear', bodies: ['gear_front', 'gear_rear'], name: 'Landing gear', role: 'Parking and stand-up',
    text: 'Two servo-driven struts that the robot rests on while parked. The controller raises them once the robot has stood up and is still, and lowers them again before it lands.' }
];
const LABEL = { xp: 'right', xm: 'left', gear_front: 'front', gear_rear: 'rear' };
const EXPLODE = {
  base: [0, 0, 0], gear_front: [0, 0.07, -0.12], gear_rear: [0, -0.07, -0.12],
  armYp: [0.12, 0.03, 0.05], armYm: [0.12, -0.03, 0.05], shin: [0.23, 0.02, 0], linkYm: [0.23, -0.02, 0], wheel: [0.36, 0, -0.02]
};
const MODEL_MB = 2.2;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v; else if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else node.setAttribute(k, v);
  }
  for (const child of children) node.append(child);
  return node;
}

function setup(figure) {
  const base = figure.dataset.models;
  const stage = figure.querySelector('.pv-stage');
  const poster = stage.querySelector('img');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = el('button', { class: 'pv-start', type: 'button' }, `Open the 3D model (${MODEL_MB} MB)`);
  stage.append(start);
  let started = false;
  const begin = () => { if (!started) { started = true; start.remove(); run(figure, base, stage, poster, reducedMotion); } };
  start.addEventListener('click', begin);
  if ('IntersectionObserver' in window && !navigator.connection?.saveData) {
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { io.disconnect(); begin(); } }, { rootMargin: '200px' });
    io.observe(stage);
  }
}

async function run(figure, base, stage, poster, reducedMotion) {
  const status = el('p', { class: 'pv-status', role: 'status' }, 'Loading parts…');
  stage.append(status);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'pv-canvas';
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D model of PRIMUS. Drag to orbit, scroll or pinch to zoom, click a part to select it.');
  renderer.domElement.tabIndex = 0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f0f0e9');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 30);
  camera.position.set(1.2, 0.7, -1.32);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.3, 0);
  controls.enableDamping = true;
  controls.minDistance = 0.25; controls.maxDistance = 4;
  controls.maxPolarAngle = Math.PI * 0.53;

  scene.add(new THREE.HemisphereLight('#ffffff', '#b8b4a6', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 2.1);
  sun.position.set(1.4, 2.6, -0.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -0.8, right: 0.8, top: 0.8, bottom: -0.8, near: 0.5, far: 6 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#dfe8e2', 0.8); fill.position.set(-1.5, 1, 1.2); scene.add(fill);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.ShadowMaterial({ opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.PolarGridHelper(1.2, 8, 6, 64, '#d3d6cb', '#e1e3da');
  grid.position.y = 0.0005; scene.add(grid);

  // robot frame (Z up, Y forward) -> three.js (Y up); forward is -Z on screen
  const robot = new THREE.Group(); robot.rotation.x = -Math.PI / 2; scene.add(robot);

  const [poses, ...gltfs] = await Promise.all([
    fetch(base + 'poses.json').then(r => r.json()),
    ...PARTS.flatMap(p => p.bodies).map(b => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${base}${b}.glb`).then(g => [b, g]))
  ]).catch(error => { status.textContent = 'The 3D model could not be loaded. ' + error.message; throw error; });

  const bodies = {};
  const pickables = [];
  for (const [name, gltf] of gltfs) {
    const node = new THREE.Group();
    const obj = gltf.scene;
    node.add(obj);  // vertices are already in the link frame of the robot (Z up)
    obj.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      o.material = o.material.clone();
      o.material.color.convertSRGBToLinear();  // CAD colours were exported as sRGB values
      o.userData.body = name;
      pickables.push(o);
    });
    robot.add(node);
    bodies[name] = { node, meshes: [], spin: 0 };
    obj.traverse(o => o.isMesh && bodies[name].meshes.push(o));
  }
  const partOf = body => PARTS.find(p => p.bodies.includes(body));

  // --- state and posing --------------------------------------------------------------------------------------
  const state = { leg: 0.27, gear: 0, gearTarget: 0, explode: 0, explodeTarget: 0, selected: null, isolate: false, animate: false, t: 0 };
  const L = poses.lengths, F = poses.frames;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qs = new THREE.Quaternion(), xAxis = new THREE.Vector3(1, 0, 0);
  function poseAt(name, leg) {
    const x = Math.min(Math.max((leg - L[0]) / (L[1] - L[0]), 0), L.length - 1.0001);
    const i = Math.floor(x), f = x - i;
    const a = F[i][name], b = F[i + 1][name];
    qa.set(a[4], a[5], a[6], a[3]); qb.set(b[4], b[5], b[6], b[3]);
    return { p: [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * f), q: qa.clone().slerp(qb, f) };
  }
  function baseHeight(leg) {
    const x = Math.min(Math.max((leg - L[0]) / (L[1] - L[0]), 0), L.length - 1.0001);
    const i = Math.floor(x), f = x - i;
    return poses.base_height[i] + (poses.base_height[i + 1] - poses.base_height[i]) * f;
  }
  function applyPose() {
    for (const [name, b] of Object.entries(bodies)) {
      let p, q;
      if (name.startsWith('gear')) {
        const d = poses.gear.down[name], u = poses.gear.up[name];
        qa.set(d[4], d[5], d[6], d[3]); qb.set(u[4], u[5], u[6], u[3]);
        p = d.slice(0, 3); q = qa.clone().slerp(qb, state.gear);
      } else ({ p, q } = poseAt(name, state.leg));
      if (name.startsWith('wheel')) q.multiply(qs.setFromAxisAngle(xAxis, b.spin));
      const kind = name.replace(/_(xp|xm)$/, '');
      const side = name.endsWith('_xm') ? -1 : 1;
      const e = EXPLODE[kind] || [0, 0, 0];
      b.node.position.set(p[0] + side * e[0] * state.explode, p[1] + e[1] * state.explode, p[2] + e[2] * state.explode);
      b.node.quaternion.copy(q);
    }
    robot.position.y = baseHeight(state.leg) + (state.isolate ? 0 : 0.02 * state.explode);
  }

  // --- UI ----------------------------------------------------------------------------------------------------
  const legValue = el('output', {}, '0.27 m');
  const legInput = el('input', { type: 'range', min: '0.18', max: '0.52', step: '0.005', value: '0.27', 'aria-label': 'Leg length' });
  const explodeInput = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0', 'aria-label': 'Exploded view' });
  const gearButton = el('button', { type: 'button', 'aria-pressed': 'false' }, 'Lower landing gear');
  const playButton = el('button', { type: 'button', 'aria-pressed': 'false' }, 'Animate legs');
  const resetButton = el('button', { type: 'button' }, 'Reset view');
  const controlsBar = el('div', { class: 'pv-controls' },
    el('label', {}, el('span', {}, 'Leg length ', legValue), legInput),
    el('label', {}, el('span', {}, 'Exploded view'), explodeInput),
    el('div', { class: 'pv-buttons' }, gearButton, playButton, resetButton));

  const info = el('div', { class: 'pv-info', 'aria-live': 'polite' });
  const list = el('ul', { class: 'pv-parts', 'aria-label': 'Parts' });
  for (const part of PARTS) {
    const mass = part.bodies.map(b => poses.parts[b].mass);
    const btn = el('button', { type: 'button', 'data-part': part.id },
      el('strong', {}, part.name), el('span', {}, `${part.bodies.length > 1 ? '2 × ' : ''}${mass[0].toFixed(2)} kg`));
    btn.addEventListener('click', () => select(state.selected === part.id ? null : part.id));
    list.append(el('li', {}, btn));
  }
  const side = el('div', { class: 'pv-side' }, list, info);
  stage.replaceChildren(renderer.domElement, el('p', { class: 'pv-hint' }, 'Drag to orbit · scroll to zoom · click a part'));
  figure.querySelector('.pv-stage').after(controlsBar, side);
  figure.classList.add('pv-ready');

  const accent = new THREE.Color('#2f8f6b');
  function renderInfo() {
    const part = PARTS.find(p => p.id === state.selected);
    if (!part) {
      const total = Object.values(poses.parts).reduce((s, p) => s + p.mass, 0);
      info.replaceChildren(el('p', { class: 'pv-info-title' }, 'Assembly'),
        el('p', {}, `${Object.keys(poses.parts).length} links, ${total.toFixed(1)} kg in the CAD. Pick a part in the list or on the model to read what it does; the leg slider moves the closed 5-bar through its working range.`));
      return;
    }
    const masses = part.bodies.map(b => `${LABEL[b.split('_').pop()] || LABEL[b] || b} ${poses.parts[b].mass.toFixed(2)} kg`).join(' · ');
    const isolate = el('button', { type: 'button', class: 'pv-isolate', 'aria-pressed': String(state.isolate) }, state.isolate ? 'Show the whole robot' : 'Inspect this part alone');
    isolate.addEventListener('click', () => { state.isolate = !state.isolate; applyVisibility(); renderInfo(); frameView(); });
    info.replaceChildren(el('p', { class: 'pv-info-title' }, part.name), el('p', { class: 'pv-info-role' }, `${part.role} · ${masses}`), el('p', {}, part.text), isolate);
  }
  function applyVisibility() {
    const part = PARTS.find(p => p.id === state.selected);
    for (const [name, b] of Object.entries(bodies)) {
      const mine = part?.bodies.includes(name);
      b.node.visible = !state.isolate || (part && name === part.bodies[0]);
      for (const m of b.meshes) m.material.emissive?.copy(mine && !state.isolate ? accent : new THREE.Color(0)).multiplyScalar(0.45);
    }
    for (const btn of list.querySelectorAll('button')) btn.setAttribute('aria-pressed', String(btn.dataset.part === state.selected));
  }
  function select(id) {
    state.selected = id;
    if (!id) state.isolate = false;
    applyVisibility(); renderInfo();
    if (state.isolate) frameView();
  }
  function frameView() {
    applyPose();
    robot.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const b of Object.values(bodies)) if (b.node.visible) box.expandByObject(b.node);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const dir = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(dir, radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05);
  }

  legInput.addEventListener('input', () => { state.leg = +legInput.value; state.animate = false; playButton.setAttribute('aria-pressed', 'false'); playButton.textContent = 'Animate legs'; });
  explodeInput.addEventListener('input', () => { state.explodeTarget = +explodeInput.value; });
  gearButton.addEventListener('click', () => {
    state.gearTarget = state.gearTarget ? 0 : 1;
    if (!state.gearTarget && state.leg < 0.25) { state.leg = 0.27; legInput.value = '0.27'; }
    gearButton.setAttribute('aria-pressed', String(!state.gearTarget));
    gearButton.textContent = state.gearTarget ? 'Lower landing gear' : 'Raise landing gear';
  });
  playButton.addEventListener('click', () => {
    state.animate = !state.animate;
    playButton.setAttribute('aria-pressed', String(state.animate));
    playButton.textContent = state.animate ? 'Stop animation' : 'Animate legs';
  });
  resetButton.addEventListener('click', () => {
    Object.assign(state, { leg: 0.27, explodeTarget: 0, isolate: false, selected: null, animate: false, gearTarget: 1 });
    legInput.value = '0.27'; explodeInput.value = '0';
    gearButton.textContent = 'Lower landing gear'; gearButton.setAttribute('aria-pressed', 'false');
    playButton.textContent = 'Animate legs'; playButton.setAttribute('aria-pressed', 'false');
    applyVisibility(); renderInfo();
    controls.target.set(0, 0.3, 0); camera.position.set(1.2, 0.7, -1.32);
  });

  // picking: a click without dragging selects the part under the pointer
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables.filter(m => m.parent && bodies[m.userData.body].node.visible), false)[0];
    const part = hit ? partOf(hit.object.userData.body) : null;
    select(part ? part.id : null);
  });

  state.gear = state.gearTarget = 1;  // operating pose: gear retracted
  applyVisibility(); renderInfo();

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage); resize();

  let visible = true;
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(stage);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible) return;
    if (state.animate) {
      state.t += dt;
      state.leg = 0.35 - 0.16 * Math.cos(state.t * 0.9);
      legInput.value = state.leg.toFixed(3);
      for (const n of ['wheel_xp', 'wheel_xm']) bodies[n].spin -= dt * 2.2;
    }
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
    state.gear += (state.gearTarget - state.gear) * k;
    state.explode += (state.explodeTarget - state.explode) * k;
    legValue.textContent = `${state.leg.toFixed(2)} m`;
    applyPose();
    controls.update();
    renderer.render(scene, camera);
  });
  figure.dataset.state = 'ready';
}

for (const figure of document.querySelectorAll('.primus-viewer')) setup(figure);
