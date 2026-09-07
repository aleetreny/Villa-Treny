// The explorer retains only the current room/corridor canvas. The minimap is a
// schematic UI: its rectangles never become room artwork or collision data.
const $ = (id) => document.getElementById(id);
const viewport = $('scene-viewport');
const world = $('scene-world');
const curtain = $('scene-curtain');
const status = $('navigation-status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const vectors = { north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 } };
const groupNames = { spine: 'Espina central', surface: 'Exterior', hull: 'Cubierta habitada', commons: 'Espacios comunes', office: 'Administración', midcentury: 'Ala residencial', heritage: 'Ala de la mansión', diner: 'Comedor', utility: 'Servicios', diggings: 'Los refugios' };
const arrows = { north: '↑', east: '→', south: '↓', west: '←' };
const keys = { ArrowUp: 'north', w: 'north', W: 'north', ArrowRight: 'east', d: 'east', D: 'east', ArrowDown: 'south', s: 'south', S: 'south', ArrowLeft: 'west', a: 'west', A: 'west' };
const svgNS = 'http://www.w3.org/2000/svg';
const state = { scenes: new Map(), current: null, art: null, cell: null, player: null, playerLabel: null, tween: null, path: [], destination: null, held: new Map(), visited: new Set(), transitioning: false, arrivalCell: null, zoom: 1, camera: { x: 0, y: 0 }, frame: null, transitions: 0 };
let roomArtModule, corridorArtModule, network;

const same = (a, b) => a && b && a.x === b.x && a.y === b.y;
const keyOf = (point) => `${point.x},${point.y}`;
const passable = (scene, point) => {
  const tile = scene.grid[point.y]?.[point.x];
  return tile !== undefined && !'#X c'.includes(tile);
};

function atOpening(exit, point) {
  const vertical = exit.outward === 'north' || exit.outward === 'south';
  const axis = vertical ? 'x' : 'y', edge = vertical ? 'y' : 'x';
  const span = exit.span ?? { from: exit.at[axis], to: exit.at[axis] };
  return point[edge] === exit.at[edge] && point[axis] >= span.from && point[axis] <= span.to;
}

function localPath(scene, start, destination) {
  if (!passable(scene, start) || !passable(scene, destination)) return [];
  const pending = [start], previous = new Map([[keyOf(start), null]]);
  for (let i = 0; i < pending.length; i++) {
    const here = pending[i];
    if (same(here, destination)) {
      const route = [];
      for (let at = here; at; at = previous.get(keyOf(at))) route.push(at);
      return route.reverse();
    }
    for (const vector of Object.values(vectors)) {
      const next = { x: here.x + vector.x, y: here.y + vector.y };
      if (!passable(scene, next) || previous.has(keyOf(next))) continue;
      previous.set(keyOf(next), here); pending.push(next);
    }
  }
  return [];
}

function scenePath(start, target) {
  const pending = [start], previous = new Map([[start, null]]);
  for (let i = 0; i < pending.length; i++) {
    const id = pending[i];
    if (id === target) {
      const route = [];
      for (let at = id; at; at = previous.get(at)) route.push(at);
      return route.reverse();
    }
    for (const exit of state.scenes.get(id)?.exits ?? []) {
      if (!state.scenes.has(exit.to) || previous.has(exit.to)) continue;
      previous.set(exit.to, id); pending.push(exit.to);
    }
  }
  return [];
}

function setStatus(text) { if (status.textContent !== text) status.textContent = text; }
function updateRouteButton() { $('route-cancel').hidden = !state.destination && !state.path.length; }
function cancelRoute(announce = false) {
  state.path = []; state.pathExit = null; state.destination = null; updateRouteButton(); updateMinimap();
  if (announce) setStatus('Recorrido detenido. Puedes seguir andando.');
}
function reportError(error) {
  state.transitioning = false; state.held.clear(); state.tween = null;
  cancelRoute(); $('loading-note').hidden = false;
  $('loading-note').textContent = `No se pudo abrir este espacio: ${error.message}`;
  console.error(error);
}

function svgElement(tag, attrs = {}) {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

function buildMinimap() {
  const map = $('minimap'), scenes = [...state.scenes.values()];
  const bounds = scenes.reduce((box, scene) => {
    const p = scene.map;
    return { x0: Math.min(box.x0, p.x), y0: Math.min(box.y0, p.y), x1: Math.max(box.x1, p.x + p.w), y1: Math.max(box.y1, p.y + p.h) };
  }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const pad = Math.max(3, (bounds.x1 - bounds.x0) * .035);
  map.setAttribute('viewBox', `${bounds.x0 - pad} ${bounds.y0 - pad} ${bounds.x1 - bounds.x0 + pad * 2} ${bounds.y1 - bounds.y0 + pad * 2}`);
  map.replaceChildren();
  const lines = svgElement('g', { 'aria-hidden': 'true' });
  const drawn = new Set();
  for (const scene of scenes) for (const exit of scene.exits) {
    const target = state.scenes.get(exit.to); if (!target) continue;
    const pair = [scene.id, target.id].sort().join('|') + `:${exit.mapAt.x},${exit.mapAt.y}`; if (drawn.has(pair)) continue;
    drawn.add(pair);
    const from = { x: scene.map.x + scene.map.w / 2, y: scene.map.y + scene.map.h / 2 };
    const to = { x: target.map.x + target.map.w / 2, y: target.map.y + target.map.h / 2 };
    lines.appendChild(svgElement('path', { class: 'map-link', d: `M${from.x},${from.y} L${exit.mapAt.x},${exit.mapAt.y} L${to.x},${to.y}` }));
  }
  map.appendChild(lines);
  for (const scene of scenes) {
    const p = scene.map;
    const node = svgElement('g', { class: 'map-node', 'data-scene': scene.id, 'data-kind': scene.kind, tabindex: '0', role: 'button', 'aria-label': `Ir andando a ${scene.name}` });
    if (scene.sealed) { node.setAttribute('role', 'img'); node.setAttribute('tabindex', '-1'); node.setAttribute('aria-disabled', 'true'); node.setAttribute('aria-label', `${scene.name} · sellado`); node.dataset.sealed = 'true'; }
    const title = svgElement('title'); title.textContent = scene.sealed ? `${scene.name} · sellado` : scene.name;
    node.append(title, svgElement('rect', { x: p.x, y: p.y, width: p.w, height: p.h }));
    node.addEventListener('click', () => { if (!scene.sealed) goToScene(scene.id); });
    const describe = () => { document.querySelector('.chart-instruction').textContent = scene.sealed ? `${scene.name} · sellado` : scene.name; };
    const resetDescription = () => { document.querySelector('.chart-instruction').textContent = 'Elige un lugar para ir andando.'; };
    node.addEventListener('pointerenter', describe); node.addEventListener('focus', describe);
    node.addEventListener('pointerleave', resetDescription); node.addEventListener('blur', resetDescription);
    node.addEventListener('keydown', (event) => { if (!scene.sealed && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); goToScene(scene.id); } });
    map.appendChild(node);
  }
}

function updateMinimap() {
  if (!state.current) return;
  for (const node of $('minimap').querySelectorAll('[data-scene]')) {
    const current = node.dataset.scene === state.current.id;
    node.classList.toggle('is-current', current);
    node.classList.toggle('is-visited', state.visited.has(node.dataset.scene));
    node.classList.toggle('is-destination', node.dataset.scene === state.destination);
    if (current) node.setAttribute('aria-current', 'location'); else node.removeAttribute('aria-current');
  }
  const rooms = [...state.scenes.values()].filter((scene) => scene.roomId && scene.kind === 'room' && !scene.sealed);
  const visited = rooms.filter((scene) => state.visited.has(scene.id)).length;
  $('visited-count').textContent = `${visited}/${rooms.length} salas`;
}

function renderExitList() {
  const list = $('exit-list'); list.replaceChildren();
  for (const exit of state.current.exits) {
    const destination = state.scenes.get(exit.to);
    const button = document.createElement('button'); button.className = 'exit-button'; button.type = 'button';
    const direction = document.createElement('span'); direction.textContent = arrows[exit.outward]; direction.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.textContent = destination?.name ?? exit.to;
    if (state.current.exits.filter((other) => other.to === exit.to).length > 1) label.textContent += ` · acceso ${state.current.exits.filter((other) => other.to === exit.to).indexOf(exit) + 1}`;
    button.append(direction, label);
    if (state.current.kind === 'room' && !localPath(state.current, state.cell, exit.at).length) { button.disabled = true; button.title = 'Este acceso está en el otro espacio, al otro lado de la pared.'; }
    button.addEventListener('click', () => { cancelRoute(); walkToExit(exit); viewport.focus({ preventScroll: true }); });
    list.appendChild(button);
  }
}

function renderPortalLabels() {
  const cellSize = state.current.cellSize;
  for (const exit of state.current.exits) {
    const target = state.scenes.get(exit.to);
    const label = document.createElement('button');
    label.type = 'button'; label.className = `portal-label portal-${exit.outward}`;
    label.textContent = target?.name ?? exit.to;
    const siblings = state.current.exits.filter((other) => other.to === exit.to);
    if (siblings.length > 1) label.textContent += ` · acceso ${siblings.indexOf(exit) + 1}`;
    label.setAttribute('aria-label', `Caminar hasta el acceso de ${label.textContent}`);
    const x = (exit.at.x + .5) * cellSize, y = (exit.at.y + .5) * cellSize;
    const offsets = { north: [x, exit.at.y * cellSize - 4], south: [x, (exit.at.y + 1) * cellSize + 4], west: [exit.at.x * cellSize - 4, y], east: [(exit.at.x + 1) * cellSize + 4, y] };
    const [left, top] = offsets[exit.outward];
    label.style.left = `${left}px`; label.style.top = `${top}px`;
    if (state.current.kind === 'room' && !localPath(state.current, state.cell, exit.at).length) label.disabled = true;
    label.addEventListener('click', (event) => { event.stopPropagation(); cancelRoute(); walkToExit(exit); viewport.focus({ preventScroll: true }); });
    world.appendChild(label);
  }
}

function createPlayer() {
  // The avatar, when supplied, is an exact crop from an existing ZIP sprite.
  // Without a supplied avatar the text is a position annotation outside the art.
  const avatar = network.avatar ?? { src: '../../public/assets/props/shelter_icons.png', source: [8, 168, 16, 16] };
  const label = document.createElement('span'); label.className = 'player-label'; label.textContent = 'Tú'; label.setAttribute('aria-hidden', 'true');
  state.playerLabel = label; world.appendChild(label); state.player = null;
  if (!avatar) return;
  const [sx, sy, width, height] = avatar.source;
  const player = document.createElement('div'); player.className = 'player'; player.setAttribute('aria-hidden', 'true');
  player.style.width = `${width}px`; player.style.height = `${height}px`;
  const image = document.createElement('img'); image.className = 'player-sprite'; image.src = avatar.src; image.alt = '';
  image.style.left = `${-sx}px`; image.style.top = `${-sy}px`;
  player.appendChild(image); world.appendChild(player); state.player = player;
}

function updateWalkOverlay() {
  world.querySelector('.walk-overlay')?.remove();
  if (!$('show-grid').checked || !state.current) return;
  const overlay = document.createElement('div'); overlay.className = 'walk-overlay'; overlay.setAttribute('aria-hidden', 'true');
  const cellSize = state.current.cellSize;
  // Coalesce fine collision cells into horizontal spans. A long corridor can
  // have tens of thousands of cells; the optional diagnostic stays lightweight.
  const markSpan = (x, y, length, isExit = false) => {
    const mark = document.createElement('i'); mark.className = `walk-cell${isExit ? ' is-exit' : ''}`;
    Object.assign(mark.style, { left: `${x * cellSize}px`, top: `${y * cellSize}px`, width: `${length * cellSize}px`, height: `${cellSize}px` });
    overlay.appendChild(mark);
  };
  state.current.grid.forEach((row, y) => {
    let start = null;
    for (let x = 0; x <= row.length; x++) {
      if (x < row.length && passable(state.current, { x, y })) { if (start === null) start = x; }
      else if (start !== null) { markSpan(start, y, x - start); start = null; }
    }
  });
  for (const exit of state.current.exits) markSpan(exit.at.x, exit.at.y, 1, true);
  world.appendChild(overlay);
}

function drawPosition(now = performance.now()) {
  if (!state.art || !state.current) return;
  const cellSize = state.current.cellSize;
  let point = state.cell;
  if (state.tween) {
    const amount = Math.min(1, (now - state.tween.started) / state.tween.duration);
    point = { x: state.tween.from.x + (state.tween.to.x - state.tween.from.x) * amount, y: state.tween.from.y + (state.tween.to.y - state.tween.from.y) * amount };
  }
  world.dataset.cellX = state.cell.x; world.dataset.cellY = state.cell.y;
  const foot = { x: Math.round((point.x + .5) * cellSize), y: Math.round((point.y + .75) * cellSize) };
  if (state.player) { state.player.style.left = `${foot.x}px`; state.player.style.top = `${foot.y}px`; }
  state.playerLabel.style.left = `${foot.x}px`; state.playerLabel.style.top = `${foot.y + 1}px`;
  const box = viewport.getBoundingClientRect(), width = state.art.canvas.width, height = state.art.canvas.height;
  const fit = Math.floor(Math.min((box.width - 32) / width, (box.height - 32) / height));
  state.zoom = Math.max(state.current.kind === 'corridor' && box.width >= 210 && box.height >= 430 ? 2 : 1, Math.min(3, fit));
  const zoom = state.zoom;
  const axis = (size, extent, player, margin) => size * zoom + margin * 2 <= extent ? Math.floor((extent - size * zoom) / 2) : Math.round(Math.max(extent - size * zoom - margin, Math.min(margin, extent / 2 - player * zoom)));
  const sideMargin = state.current.kind === 'corridor' ? 48 : 12;
  state.camera = { x: axis(width, box.width, foot.x, sideMargin * zoom), y: axis(height, box.height, foot.y, 12 * zoom) };
  world.style.transform = `translate(${state.camera.x}px,${state.camera.y}px) scale(${zoom})`;
  $('scale-label').textContent = `${zoom}×`;
}

async function makeArt(scene) {
  const module = scene.kind === 'room' ? roomArtModule : corridorArtModule;
  const create = scene.kind === 'room' ? (module.createRoomArt ?? ((item) => module.loadExplorerRoom(item.roomId))) : module.createCorridorArt;
  if (typeof create !== 'function') throw new Error(`Falta el renderer de ${scene.name}`);
  const art = await create(scene);
  if (!(art.canvas instanceof HTMLCanvasElement)) throw new Error(`El arte de ${scene.name} no devuelve un canvas`);
  art.canvas.getContext('2d').imageSmoothingEnabled = false;
  art.canvas.setAttribute('role', 'img'); art.canvas.setAttribute('aria-label', scene.name);
  art.canvas.dataset.scene = scene.id;
  return art;
}

async function enterScene(sceneId, arrival, viaExit = null) {
  const sourceScene = state.current;
  state.transitioning = true; state.tween = null; state.path = []; state.pathExit = null;
  curtain.classList.remove('is-open');
  if (sourceScene && !reducedMotion) await new Promise((resolve) => setTimeout(resolve, 180));
  // Drop the previous canvas before constructing another room. Image sheets may
  // be shared by renderers; composed rooms are never retained by the explorer.
  world.replaceChildren(); state.art = null;
  const original = state.scenes.get(sceneId);
  if (!original) throw new Error(`No existe ${sceneId}`);
  const art = await makeArt(original);
  const scene = { ...original, grid: art.grid ?? original.grid, cellSize: art.cellSize ?? original.cellSize ?? 32, exits: original.exits.map((exit) => ({ ...exit, at: { ...exit.at } })) };
  if (art.exits?.length) scene.exits = scene.exits.map((exit, index) => ({ ...exit, span: art.exits[index]?.span ?? exit.span, at: art.exits[index]?.at ?? (art.exits[index] ? { x: art.exits[index].x, y: art.exits[index].y } : exit.at) }));
  else if (art.exit && scene.exits.length) scene.exits[0].at = art.exit;
  if (scene.kind === 'room') {
    const entranceIndex = viaExit?.entranceIndex ?? Number(viaExit?.id?.match(/:(\d+)$/)?.[1] ?? 0);
    arrival = art.exits?.[entranceIndex]?.arrival ?? art.exits?.[entranceIndex]?.spawn ?? art.spawn ?? arrival;
    scene.exits = scene.exits.map((exit) => ({ ...exit, outward: art.outward ?? (exit.at.y === 0 ? 'north' : exit.at.y === scene.grid.length - 1 ? 'south' : exit.outward), span: exit.span ?? { from: exit.at.x - 2, to: exit.at.x + 1 } }));
  } else if (art.toArtCell && arrival) arrival = art.toArtCell(arrival);
  if (!arrival || !passable(scene, arrival)) throw new Error(`La llegada de ${scene.name} está bloqueada`);
  state.current = scene; world.dataset.scene = scene.id; state.art = art; state.cell = { ...arrival }; state.arrivalCell = { ...arrival }; state.visited.add(sceneId); state.transitions++;
  world.style.width = `${art.canvas.width}px`; world.style.height = `${art.canvas.height}px`; world.appendChild(art.canvas);
  createPlayer(); renderPortalLabels(); updateWalkOverlay();
  $('scene-name').textContent = scene.name; $('scene-group').textContent = groupNames[scene.group] ?? (scene.kind === 'room' ? 'Sala' : 'Pasillo');
  viewport.setAttribute('aria-label', `${scene.name}. Usa las flechas o W A S D para caminar, o pulsa el suelo.`);
  renderExitList(); updateRouteButton(); updateMinimap(); drawPosition();
  $('loading-note').hidden = true;
  curtain.classList.add('is-open');
  if (!reducedMotion) await new Promise((resolve) => setTimeout(resolve, 180));
  state.transitioning = false;
  if (state.destination === sceneId) { state.destination = null; updateRouteButton(); updateMinimap(); setStatus(`Has llegado a ${scene.name}.`); }
  else if (state.destination) continueDestination();
  else setStatus(`${scene.name}. Camina hasta un hueco para seguir.`);
  document.dispatchEvent(new CustomEvent('habitat:scene', { detail: { sceneId, cell: { ...state.cell }, from: sourceScene?.id ?? null } }));
}

async function cross(exit) {
  if (state.transitioning) return;
  try { await enterScene(exit.to, exit.arrival, exit); } catch (error) { reportError(error); }
}

function walkToExit(exit) {
  if (state.transitioning) return;
  const path = localPath(state.current, state.tween?.to ?? state.cell, exit.at);
  if (!path.length) { setStatus('Este acceso queda al otro lado de una pared. Usa el otro hueco.'); return; }
  if (path.length === 1 && !state.tween) { cross(exit); return; }
  state.path = path.slice(1); state.pathExit = exit;
  setStatus(`Hacia ${state.scenes.get(exit.to).name}…`); updateRouteButton();
}

function continueDestination() {
  if (!state.destination || state.transitioning) return;
  const route = scenePath(state.current.id, state.destination);
  if (route.length < 2) { const target = state.scenes.get(state.destination); cancelRoute(); setStatus(target?.sealed ? `${target.name} está sellado y no tiene una entrada transitable.` : 'No hay una conexión transitable hasta ese espacio.'); return; }
  const options = state.current.exits.filter((exit) => exit.to === route[1]);
  const exit = options.find((candidate) => localPath(state.current, state.cell, candidate.at).length);
  if (!exit) { cancelRoute(); setStatus('No hay un recorrido libre hasta ese acceso desde aquí.'); return; }
  walkToExit(exit);
}

function goToScene(sceneId) {
  if (!state.current || state.transitioning) return;
  state.held.clear(); state.path = []; state.pathExit = null;
  if (sceneId === state.current.id) { cancelRoute(); setStatus(state.current.kind === 'room' && state.current.exits.length > 1 ? 'Para llegar al otro compartimento, vuelve al pasillo y usa el otro acceso.' : `Ya estás en ${state.current.name}.`); return; }
  state.destination = sceneId;
  // Finish the current footstep first, then plan from its actual destination.
  if (!state.tween) continueDestination();
  updateRouteButton(); updateMinimap(); viewport.focus({ preventScroll: true });
}

function startStep(destination, now) {
  if (!passable(state.current, destination)) return false;
  const duration = reducedMotion ? Math.max(35, state.current.cellSize / 90 * 1000) : Math.max(45, state.current.cellSize / 90 * 1000);
  state.tween = { from: { ...state.cell }, to: destination, started: now, duration };
  return true;
}

function moveDirection(direction, now) {
  const vector = vectors[direction], next = { x: state.cell.x + vector.x, y: state.cell.y + vector.y };
  const boundaryExit = state.current.exits.find((exit) => atOpening(exit, state.cell) && exit.outward === direction);
  if (boundaryExit) { cross(boundaryExit); return; }
  startStep(next, now);
}

function afterStep() {
  if (!same(state.cell, state.arrivalCell)) state.arrivalCell = null;
  const reachedExit = state.current.exits.find((exit) => atOpening(exit, state.cell));
  if (reachedExit && !state.arrivalCell) { cross(reachedExit); return; }
  if (!state.path.length && state.pathExit) {
    const exit = state.pathExit; state.pathExit = null;
    if (atOpening(exit, state.cell)) { cross(exit); return; }
  }
  if (!state.path.length && state.destination) continueDestination();
  else if (!state.path.length && !state.held.size) { updateRouteButton(); setStatus('Pulsa el suelo para caminar o elige otro lugar en el mapa.'); }
}

function animate(now) {
  if (state.current && !state.transitioning) {
    if (state.tween && now - state.tween.started >= state.tween.duration) {
      state.cell = state.tween.to; state.tween = null; afterStep();
    }
    if (!state.tween && !state.transitioning) {
      if (state.held.size) moveDirection([...state.held.values()].at(-1), now);
      else if (state.path.length) startStep(state.path.shift(), now);
    }
    drawPosition(now);
  }
  state.frame = requestAnimationFrame(animate);
}

function walkToPoint(event) {
  if (!state.current || state.transitioning || event.target.closest('button')) return;
  const box = viewport.getBoundingClientRect();
  const cell = { x: Math.floor(((event.clientX - box.left - state.camera.x) / state.zoom) / state.current.cellSize), y: Math.floor(((event.clientY - box.top - state.camera.y) / state.zoom) / state.current.cellSize) };
  const start = state.tween?.to ?? state.cell;
  const route = localPath(state.current, start, cell);
  if (!route.length) { setStatus(passable(state.current, cell) ? 'Ese suelo queda en otro compartimento. Vuelve al pasillo y usa el otro acceso.' : 'Ahí no hay suelo libre. Pulsa dentro del recorrido.'); return; }
  cancelRoute(); state.held.clear(); state.pathExit = state.current.exits.find((exit) => atOpening(exit, cell)) ?? null;
  state.path = route.slice(1);
  if (!state.path.length && state.pathExit && !state.tween) cross(state.pathExit);
  else setStatus('Caminando…');
  updateRouteButton(); viewport.focus({ preventScroll: true });
}

function isTextControl(target) { return target instanceof Element && Boolean(target.closest('input:not([type=checkbox]):not([type=radio]):not([type=button]),textarea,select,[contenteditable=true]')); }
window.addEventListener('keydown', (event) => {
  if (isTextControl(event.target)) return;
  if (event.key === 'Escape') { cancelRoute(true); state.held.clear(); $('help').hidden = true; $('help-toggle').setAttribute('aria-expanded', 'false'); return; }
  const direction = keys[event.key]; if (!direction) return;
  event.preventDefault();
  if (!state.held.has(event.code)) { cancelRoute(); state.pathExit = null; state.held.set(event.code, direction); if (state.current && !state.tween && !state.transitioning) moveDirection(direction, performance.now()); }
});
window.addEventListener('keyup', (event) => { state.held.delete(event.code); });
window.addEventListener('blur', () => state.held.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden) { state.held.clear(); cancelRoute(); } });
viewport.addEventListener('click', walkToPoint);
$('show-grid').addEventListener('change', updateWalkOverlay);
$('route-cancel').addEventListener('click', () => cancelRoute(true));
$('help-toggle').addEventListener('click', () => { const help = $('help'); help.hidden = !help.hidden; $('help-toggle').setAttribute('aria-expanded', String(!help.hidden)); });
for (const button of document.querySelectorAll('[data-direction]')) {
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); cancelRoute(); state.pathExit = null; state.held.set(`pointer:${event.pointerId}`, button.dataset.direction); if (state.current && !state.tween && !state.transitioning) moveDirection(button.dataset.direction, performance.now()); button.setPointerCapture(event.pointerId); });
  const release = (event) => { event.preventDefault(); state.held.delete(`pointer:${event.pointerId}`); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}
new ResizeObserver(() => drawPosition()).observe(viewport);

// Read-only snapshot plus real input methods for reproducible browser checks.
window.__habitatExplorer = {
  get state() { return { sceneId: state.current?.id, cell: state.cell ? { ...state.cell } : null, moving: Boolean(state.tween || state.path.length), transitioning: state.transitioning, destination: state.destination, visited: [...state.visited], canvasCount: world.querySelectorAll('canvas').length, transitions: state.transitions, zoom: state.zoom }; },
  get scene() { return state.current; },
  goTo: goToScene,
  stop: () => cancelRoute(true),
  pathTo: (cell) => state.current ? localPath(state.current, state.cell, cell) : [],
};

try {
  const [response, rooms, corridors] = await Promise.all([fetch('./explorer-network.json', { cache: 'no-store' }), import('./explorer-room-art.js'), import('./explorer-corridor-art.js')]);
  if (!response.ok) throw new Error(`No se pudo leer el plano (${response.status})`);
  network = await response.json(); roomArtModule = rooms; corridorArtModule = corridors;
  const scenes = Array.isArray(network.scenes) ? network.scenes : Object.values(network.scenes);
  state.scenes = new Map(scenes.map((scene) => [scene.id, scene]));
  buildMinimap();
  const requestedId = new URLSearchParams(location.search).get('scene');
  const requested = state.scenes.get(requestedId);
  const preview = requested && !requested.sealed ? requested : null;
  const previewArrival = preview ? scenes.flatMap((scene) => scene.exits).find((exit) => exit.to === preview.id)?.arrival : null;
  await enterScene(preview?.id ?? network.start.sceneId, previewArrival ?? network.start.cell);
  state.frame = requestAnimationFrame(animate);
  window.__ready = 1;
} catch (error) { reportError(error); }
