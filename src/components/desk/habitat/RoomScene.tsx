import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ROOM_BY_ID, type RoomId } from '../../../lib/habitat/rooms';
import { RESIDENT_BY_ID, type ResidentId } from '../../../lib/habitat/residents';
import type { HabitatSnapshot } from '../../../lib/habitat/snapshot';
import { ROOM_ART, roomImage, type RoomObject } from '../../../lib/habitat/room-art';
import { advanceWalkers, reconcileWalkers, walkerPosition, walkerStandingSpots, type RoomOccupancy } from '../../../lib/habitat/room-motion';
import { roomCamera, followScroll, type CameraMemory } from '../../../lib/habitat/observer-camera';
import { usePageVisible, useReducedMotion } from '../../../lib/habitat/observer-preferences';
import { ResidentSprite } from './ResidentSprite';
import './RoomScene.css';

type Props = { room: RoomId; snapshot: HabitatSnapshot; onPick: (id: ResidentId) => void; followed?: ResidentId | null; active?: boolean; walking?: boolean };
type Pose = { id: ResidentId; x: number; y: number; moving: boolean; frame: number };
type RoomMemoryState = { camera: CameraMemory; occupancy: RoomOccupancy; poses: Pose[] };
/** Imperative scene cache, owned by this mounted observer, not the saved world. */
class RoomMemory {
  private state: RoomMemoryState = { camera: { zoom: null, left: 0, top: 0 }, occupancy: { walkers: [], waiting: [] }, poses: [] };
  read() { return this.state; }
  write(patch: Partial<RoomMemoryState>) { this.state = { ...this.state, ...patch }; }
  pan(left: number, top: number) { this.state.camera = { ...this.state.camera, left, top }; }
}
type ForegroundObject = RoomObject;

/** Foreground pixels are copied from the approved room PNG; the mask removes
 * background pixels only. The original room and its furniture are never redrawn. */
const Foreground = memo(function Foreground({ object, source }: { object: ForegroundObject; source: HTMLImageElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [x, y, width, height] = object.bounds as [number, number, number, number];
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, width, height);
    c.drawImage(source, x, y, width, height, 0, 0, width, height);
    const pixels = c.getImageData(0, 0, width, height);
    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
      if (object.mask[row]?.[column] !== '1') pixels.data[(row * width + column) * 4 + 3] = 0;
    }
    c.putImageData(pixels, 0, 0);
  }, [object, source, x, y, width, height]);
  return <canvas ref={ref} width={width} height={height} className="room-view__foreground" style={{ left: x, top: y, zIndex: object.baseY }} aria-hidden="true" />;
});

function RoomStage({ room, snapshot, onPick, followed, active = true, walking = true, memory }: Props & { memory: RoomMemory }) {
  const art = ROOM_ART[room];
  const viewport = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const occupancy = useRef<RoomOccupancy>(memory.read().occupancy);
  const present = useRef<ResidentId[]>([]);
  const [poses, setPoses] = useState<Pose[]>(() => memory.read().poses);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [hovered, setHovered] = useState<ResidentId | null>(null);
  const [chosenZoom, setChosenZoom] = useState<number | null>(() => memory.read().camera.zoom);
  const visible = usePageVisible();
  const reduced = useReducedMotion();
  const animate = walking && !reduced && active && visible;
  const people = snapshot.people.filter((person) => person.room === room);
  const ids = people.map((person) => person.id).sort().join('');
  const lit = snapshot.rooms.find((candidate) => candidate.id === room)?.lit;
  const spots = useMemo(() => art ? walkerStandingSpots(art) : [], [art]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      if (box.width && box.height) setSize({ width: Math.floor(box.width), height: Math.floor(box.height) });
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    return () => resize.disconnect();
  }, [active]);

  useEffect(() => {
    if (!art || !active || !visible) return;
    present.current = [...ids] as ResidentId[];
    let reconcile = true;
    const paint = () => {
      const now = performance.now();
      if (animate) advanceWalkers(occupancy.current.walkers, art, spots, now);
      if (reconcile || occupancy.current.waiting.length) occupancy.current = reconcileWalkers(occupancy.current, present.current, art, spots, now, room.length);
      reconcile = false;
      memory.write({ occupancy: occupancy.current });
      const next = occupancy.current.walkers.map((walker) => {
        const previous = !animate ? memory.read().poses.find((pose) => pose.id === walker.id) : undefined;
        const at = animate ? walkerPosition(walker, now) : walker.at;
        const moving = animate && Boolean(walker.next);
        return { id: walker.id, x: previous?.x ?? Math.round((at.x + .5) * art.cellSize), y: previous?.y ?? Math.round((at.y + .5) * art.cellSize), moving, frame: moving ? Math.floor(now / 180) % 2 + 1 : 0 };
      });
      if (JSON.stringify(next) !== JSON.stringify(memory.read().poses)) {
        memory.write({ poses: next });
        setPoses(next);
      }
    };
    paint();
    if (!animate) return;
    const interval = window.setInterval(paint, 80);
    return () => window.clearInterval(interval);
  }, [art, spots, room, active, visible, animate, memory, ids]);

  const camera = useMemo(() => roomCamera(size, art ?? { width: 1, height: 1 }, chosenZoom), [size, art, chosenZoom]);
  const canPan = camera.width > size.width || camera.height > size.height;
  const selected = hovered ?? followed;
  const imageUrl = roomImage(room) + (retry ? `?retry=${retry}` : '');
  const loaded = Boolean(source) && size.width > 0;
  const followedPose = followed ? poses.find((pose) => pose.id === followed) : undefined;
  const followX = followedPose ? camera.x + followedPose.x * camera.zoom : null;
  const followY = followedPose ? camera.y + (followedPose.y - 22) * camera.zoom : null;

  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element || !active || !size.width) return;
    if (followX !== null && followY !== null) {
      const position = followScroll(size, camera, { x: followX, y: followY });
      element.scrollLeft = position.left;
      element.scrollTop = position.top;
    } else {
      element.scrollLeft = memory.read().camera.left;
      element.scrollTop = memory.read().camera.top;
    }
  }, [active, size, camera, followX, followY, memory]);

  const chooseZoom = (zoom: number | null) => {
    memory.write({ camera: { zoom, left: 0, top: 0 } });
    setChosenZoom(zoom);
    if (scroll.current && !followed) scroll.current.scrollTo({ left: 0, top: 0 });
  };
  const objects = art?.objects ?? [];
  const followedWaiting = followed && people.some((person) => person.id === followed) && !followedPose;

  return <div className="room-view" ref={viewport} data-room={room} aria-label={`Residents of ${ROOM_BY_ID[room].name}`}>
    {!art || failed ? <div className="room-view__message" role="alert"><p>This room could not be loaded.</p><button type="button" onClick={() => { setFailed(false); setSource(null); setRetry((value) => value + 1); }}>Retry room</button></div> : <>
      {!loaded && <p className="room-view__message" role="status">Opening room…</p>}
      <div className="room-view__scroll" ref={scroll} onScroll={(event) => { memory.pan(event.currentTarget.scrollLeft, event.currentTarget.scrollTop); }} tabIndex={canPan ? 0 : undefined} aria-label={canPan ? 'Room camera. Scroll to explore; Fit shows the whole room when it fits at native size.' : undefined}>
        <div className="room-view__canvas" style={{ width: camera.width, height: camera.height }}>
          <div className={`room-view__world${loaded ? ' is-ready' : ''}`} style={{ width: art.width, height: art.height, left: camera.x, top: camera.y, transform: `scale(${camera.zoom})` }}>
            <img key={retry} src={imageUrl} width={art.width} height={art.height} alt={ROOM_BY_ID[room].name} onLoad={(event) => setSource(event.currentTarget)} onError={() => setFailed(true)} draggable={false} />
            <div className="room-view__contents" style={{ maskImage: `url("${imageUrl}")` }}>
              {poses.map((pose) => <button key={pose.id} type="button" className={`room-view__resident${selected === pose.id ? ' is-followed' : ''}`} style={{ left: pose.x - 12, top: pose.y - 44, zIndex: pose.y }} data-resident={pose.id} data-x={pose.x} data-y={pose.y} aria-label={`Open profile of ${RESIDENT_BY_ID[pose.id].name}`} onClick={() => onPick(pose.id)} onMouseEnter={() => setHovered(pose.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(pose.id)} onBlur={() => setHovered(null)}>
                <ResidentSprite id={pose.id} frame={pose.frame} />
                <span className="room-view__name">{RESIDENT_BY_ID[pose.id].name.split(' ')[0]}</span>
              </button>)}
              {source ? objects.map((object) => <Foreground key={object.id} object={object} source={source} />) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="room-view__zoom" role="group" aria-label="Room magnification">
        <button type="button" onClick={() => chooseZoom(Math.max(1, camera.zoom - 1))} disabled={camera.zoom === 1} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => chooseZoom(null)} aria-label="Fit room to view" title="Fit room to view">{camera.zoom}×</button>
        <button type="button" onClick={() => chooseZoom(Math.min(5, camera.zoom + 1))} disabled={camera.zoom === 5} aria-label="Zoom in">+</button>
      </div>
      {lit === false ? <p className="room-view__power">Room lights are off in the saved world. The reference artwork remains visible.</p> : null}
      {loaded && people.length > poses.length && <p className="room-view__presence" role="status" data-waiting={people.length - poses.length}>
        {followedWaiting ? `${RESIDENT_BY_ID[followed!].name} is waiting for clear floor space. The camera will follow when they enter.` : `${people.length - poses.length} ${people.length - poses.length === 1 ? 'resident is' : 'residents are'} waiting for clear floor space.`}
      </p>}
    </>}
  </div>;
}

export function RoomScene(props: Props) {
  const [rooms] = useState(() => new Map<RoomId, RoomMemory>());
  const memory = useMemo(() => {
    if (!rooms.has(props.room)) rooms.set(props.room, new RoomMemory());
    return rooms.get(props.room)!;
  }, [rooms, props.room]);
  return <RoomStage key={props.room} {...props} memory={memory} />;
}
