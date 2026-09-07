// Approved room scenes, loaded only when entered. Room IDs are never invented here.
// New visible pixels are exclusively copies of existing room / ZIP artwork.
// Collision is a native pixel mask independent of the narrative room grid.
import { CANON_PARTIALS, loadCanonPartialSources, drawCanonPartial } from './canon-partials-kit.js';
import { OFFICE, loadOfficeSources, drawOffice } from './office-kit.js';
import { OUTSIDE, loadOutsideSources, drawOutside } from './outside-kit.js';
import { BEDROOM, loadBedroomSheets, drawBedroom } from './bedroom-kit.js';
import { MIDCENTURY, loadMidcenturySources, drawMidcentury } from './midcentury-kit.js';
import { HERITAGE, loadHeritageSources, drawHeritage } from './heritage-kit.js';
import { FACILITY, loadFacilitySources, drawFacility } from './facility-kit.js';
import { FACE, loadFaceSource, drawFace } from './face-kit.js';
import { REF as DIGGING_OUTLINES } from './digging-kit.js';
import { ROOM_OBJECTS } from './room-objects.js';
import { LEGACY_ROOM_SOURCES } from './legacy-room-sources.js';

export const ROOM_CELL_SIZE = 1;
const FAMILY = {
  canon: [loadCanonPartialSources, drawCanonPartial], office: [loadOfficeSources, drawOffice],
  outside: [loadOutsideSources, drawOutside], bedroom: [loadBedroomSheets, drawBedroom],
  midcentury: [loadMidcenturySources, drawMidcentury], heritage: [loadHeritageSources, drawHeritage],
  facility: [loadFacilitySources, drawFacility], face: [loadFaceSource, drawFace],
};
const families = new Map();
export const ROOM_ART = {};
function register(family, specs) {
  for (const [id, spec] of Object.entries(specs)) ROOM_ART[id] = { ...spec, family, key: id };
}
register('canon', Object.fromEntries(Object.entries(CANON_PARTIALS).filter(([id]) => id !== 'hydroponics')
  .map(([id, room]) => {
    const nativeScale = {bridge:2,dock:3,hold:3,breach:3}[id] || 4;
    return [id, { ...room, nativeScale, W: Math.floor(room.W/nativeScale), H: Math.floor(room.H/nativeScale) }];
  })));
// Preserve the same approved Bridge section, recovering its actual 2x source
// lattice. sourceCrop is in full composition pixels, never reduced coordinates.
ROOM_ART.bridge = {...ROOM_ART.bridge,W:192,H:144,sourceCrop:[160,0,384,288]};
register('office', OFFICE); register('outside', OUTSIDE); register('midcentury', MIDCENTURY);
register('heritage', HERITAGE); register('facility', FACILITY);
ROOM_ART.face = { ...FACE, family: 'face', key: 'face' };
for (const [id, key] of Object.entries({dig3:'shelter',dig4:'christmas',dig5:'olive',dig6:'oliveB'}))
  ROOM_ART[id] = { ...BEDROOM[key], family: 'bedroom', key };
for (const [id, W, H, page, selector] of LEGACY_ROOM_SOURCES)
  ROOM_ART[id] = { W, H, label:id, legacy:{ page, selector, raster:`canonical-legacy/${id}.png` } };
// These three source pages light the whole canvas, including its empty margin.
// Reuse their exact shell geometry; a floor/collision mask would erase walls.
for (const [id,key] of Object.entries({dig1:'twoRooms',dig2:'twoRoomsB',games:'bedsit'}))
  ROOM_ART[id].legacy.outline = DIGGING_OUTLINES[key];

// Rectangles are [x, y, width, height] in the approved room's native pixels.
// Floors include carpets, flat rubbish, grates and puddles; solids are walls,
// planted containers and furniture. Elevation above the floor is not walkable.
// Entry points use the real room boundary, which need not be the canvas edge.
const shape = (floor, solids, entry, options = {}) => ({ floor, solids, entry, ...options });
export const ROOM_COLLISION = {
  bridge: shape([[6,8,84,56]], [[9,12,17,28],[16,32,19,22],[20,53,9,11],[47,16,26,19],[55,29,8,11],[63,48,25,17],[53,53,11,13]], [44,70]),
  dock: shape([[0,0,216,144]], [[0,26,22,28],[36,12,16,24],[113,0,34,31],[122,99,24,11],[176,35,16,18],[176,97,15,27],[201,112,15,22],[48,85,14,24],[48,127,16,17],[60,112,18,22],[70,128,17,16],[112,70,17,27],[148,71,40,20],[16,68,15,26],[37,131,12,13]], [103,140]),
  breach: shape([[5,15,157,169]], [[20,27,41,82],[85,54,30,18],[109,43,39,39],[105,82,36,26],[55,100,61,29],[25,159,45,22],[131,145,23,23],[50,0,70,31]], [81,184], {sealed:true}),
  hold: shape([[0,0,144,192]], [[25,26,95,38],[25,30,6,130],[113,30,6,130],[26,120,38,44],[80,120,40,44],[32,61,12,35],[84,53,17,35],[107,74,9,20],[95,100,18,15],[45,93,24,27],[16,146,24,32],[38,150,12,26]], [89,188]),
  common: shape([[6,56,112,78]], [[7,43,33,72],[39,29,43,43],[83,58,29,39],[44,83,39,36],[13,108,38,17]], [89,132]),
  administration: shape([[6,76,64,154],[70,104,96,126]], [[12,76,46,29],[70,56,20,61],[107,86,26,22],[143,76,17,40],[6,126,28,45],[29,176,16,40],[46,177,23,50],[100,127,63,48],[116,181,44,43],[88,187,15,28]], [78,232]),
  dispatch: shape([[6,100,191,66],[74,70,54,40]], [[9,87,32,20],[16,118,24,23],[49,114,15,23],[10,138,18,21],[82,100,27,29],[133,125,62,35],[164,112,19,19],[118,144,15,18]], [102,168]),
  archive: shape([[6,87,96,143],[102,122,64,108]], [[15,70,56,31],[75,55,27,64],[109,74,51,60],[6,123,50,37],[6,169,33,25],[38,188,21,27],[107,203,51,27],[90,154,24,26],[149,140,17,42]], [78,232]),
  records: shape([[6,90,160,76]], [[7,52,25,61],[43,68,46,35],[102,53,18,60],[122,68,38,48],[6,113,40,38],[117,129,44,32],[132,113,20,21]], [84,168]),
  camp: shape([[4,21,126,160]], [[14,0,70,110],[81,70,26,44],[72,125,23,16],[8,150,31,24],[9,100,23,16]], [64,179]),
  garden: shape([[3,18,124,138]], [[3,20,34,38],[43,2,22,45],[76,5,44,72],[3,73,25,17],[16,94,14,30],[99,94,27,62],[55,126,33,32],[99,60,12,20]], [42,155]),
  sheltergate: shape([[15,126,174,70]], [[31,0,153,160],[26,148,23,35],[20,127,15,36],[150,148,26,40],[25,176,83,22],[164,172,40,28]], [132,196]),
  yard: shape([[5,72,124,97]], [[9,56,30,42],[47,47,21,67],[72,69,16,28],[88,46,24,63],[3,111,32,58],[98,119,17,18],[123,65,10,69]], [68,171]),
  study: shape([[6,74,128,92]], [[12,49,47,41],[69,54,13,29],[36,77,18,23],[86,51,40,30],[9,106,27,53],[37,145,14,16],[81,112,32,35],[97,90,20,17],[123,103,9,43],[112,144,18,18]], [70,168]),
  sparebedroom: shape([[6,92,128,74]], [[40,65,58,53],[10,50,31,45],[103,53,23,46],[8,118,31,29],[110,120,19,37],[102,146,13,23],[14,145,27,15]], [70,168]),
  parlour: shape([[6,80,160,118]], [[9,65,16,32],[36,55,49,28],[111,54,39,33],[147,41,16,48],[34,89,45,50],[23,106,23,47],[106,109,38,46],[127,85,19,28],[117,164,44,29],[99,169,18,26],[28,172,25,24],[6,131,17,64]], [86,200]),
  projection: shape([[6,64,128,102]], [[92,18,40,63],[43,45,34,48],[10,36,24,43],[24,80,18,31],[59,102,26,23],[102,97,30,58],[6,130,39,30],[31,120,14,17],[98,140,16,21]], [70,168]),
  winter: shape([[6,84,128,82]], [[53,58,41,30],[103,57,25,32],[38,105,27,36],[60,116,24,15],[6,93,18,25],[89,90,40,72]], [70,168]),
  library: shape([[6,94,128,72]], [[8,33,40,48],[51,51,61,43],[114,24,17,58],[9,119,47,40],[113,131,18,29]], [70,168]),
  grandbedroom: shape([[6,82,128,84]], [[36,42,66,85],[14,59,25,34],[104,59,27,34],[7,128,40,32],[116,132,15,29]], [70,168]),
  salon: shape([[6,83,90,115],[103,83,127,115],[96,144,7,54]], [[6,45,39,36],[57,24,39,60],[96,0,7,144],[12,136,15,32],[26,106,55,60],[57,181,28,16],[123,53,24,44],[148,59,66,32],[211,58,20,38],[212,101,19,43],[168,109,35,25],[194,137,19,17],[128,162,20,36],[204,163,19,35]], [161,200]),
  hearth: shape([[6,89,160,109]], [[8,20,38,65],[128,20,37,64],[55,39,47,41],[36,95,30,43],[72,108,17,17],[94,96,28,43],[130,103,29,61],[27,143,25,22],[17,168,35,29],[117,168,31,29]], [86,200]),
  maindiner: shape([[6,70,224,128]], [[6,38,58,42],[45,58,19,89],[6,132,58,27],[68,58,14,25],[68,90,14,25],[68,121,14,25],[14,146,15,29],[40,146,15,29],[150,83,22,51],[179,85,22,43],[207,82,22,52],[151,147,22,50],[179,148,22,47],[207,147,22,50],[96,145,27,25],[102,123,15,23],[102,167,15,25],[202,37,23,40]], [140,200]),
  sodabar: shape([[6,46,160,152]], [[6,47,40,26],[6,76,40,29],[6,105,40,24],[6,115,16,43],[57,49,23,22],[64,71,15,14],[90,53,20,91],[107,111,60,33],[126,52,41,40],[101,140,15,23],[128,140,15,23],[153,140,15,23],[32,162,26,23],[15,163,15,30],[65,163,15,30]], [84,200]),
  servicecounter: shape([[6,89,128,77]], [[52,40,78,44],[55,108,75,21],[57,131,72,27],[10,104,17,55]], [44,168]),
  graveyard: shape([[25,58,151,164],[76,190,52,44]], [[88,63,23,42],[72,63,8,42],[33,22,33,64],[107,21,45,74],[32,112,20,65],[145,106,27,74],[60,160,16,64],[128,160,16,64],[11,20,16,202],[174,20,14,202],[23,178,45,42],[144,178,35,42]], [96,232]),
  maintenance: shape([[6,126,94,64],[100,71,182,119]], [[5,96,24,46],[36,87,58,43],[6,153,47,29],[59,174,17,20],[91,135,19,46],[99,65,61,61],[108,25,48,24],[109,124,53,45],[166,51,33,49],[216,67,29,38],[254,72,28,48],[240,133,42,57],[216,153,17,38],[172,128,60,36],[212,111,18,20]], [181,192]),
  kitchen: shape([[6,88,160,110]], [[8,45,49,44],[132,45,29,45],[37,98,48,46],[93,99,31,45],[8,122,17,76],[40,149,49,49],[94,153,31,45],[140,108,26,44],[147,154,19,44]], [132,200]),
  stalls: shape([[6,93,96,41]], [[6,22,27,67],[64,20,6,76],[72,38,29,44],[36,46,26,42],[8,92,13,34],[68,104,23,19],[93,107,9,27]], [48,136]),
  washroom: shape([[6,85,56,49],[70,87,64,47]], [[5,50,27,26],[32,35,4,52],[44,45,19,39],[62,30,8,104],[70,38,29,49],[101,23,32,64],[8,95,16,18],[121,109,13,24]], [44,136], {extraEntries:[[104,136]]}),
  face: shape([[0,0,216,144]], [[34,12,96,52],[23,47,39,27],[102,47,36,25],[31,113,63,27],[14,126,21,16],[163,27,24,22],[178,12,13,22],[140,7,20,15],[171,100,5,37]], [128,140]),
  dig1: shape([[10,74,229,65],[10,139,128,31]], [[74,34,63,73],[9,59,62,41],[12,129,44,38],[10,95,20,17],[77,95,32,21],[112,51,25,63],[166,55,29,38],[145,66,19,23],[162,110,43,32],[173,97,23,27],[208,73,22,21],[211,121,23,22],[83,76,14,23],[127,143,16,29],[114,156,14,16],[56,158,14,14]], [90,173]),
  dig2: shape([[10,74,159,92]], [[70,4,8,102],[10,54,40,75],[94,93,66,61],[116,140,30,26],[124,39,43,48],[11,147,24,18]], [90,169]),
  games: shape([[25,93,127,95]], [[24,47,37,63],[110,36,40,57],[71,84,29,20],[59,118,43,43],[21,165,25,25],[116,169,33,20]], [90,192]),
  dig3: shape([[6,80,125,134]], [[8,48,72,69],[48,69,27,61],[82,35,45,68],[0,97,47,38],[112,143,20,30],[7,171,24,22],[6,190,27,22],[33,191,15,24],[91,163,19,40],[108,170,23,44],[91,115,21,18],[82,105,20,25],[108,110,24,16],[41,137,16,12]], [68,216]),
  dig4: shape([[6,80,176,55],[6,135,144,47]], [[11,55,24,48],[87,38,40,59],[131,43,22,57],[163,63,20,38],[169,110,14,24],[65,82,15,17],[6,122,31,58],[39,145,20,30],[60,105,39,44],[78,142,13,24],[114,136,30,33]], [106,184]),
  dig5: shape([[22,83,182,163]], [[19,39,24,43],[64,65,17,24],[23,98,18,31],[174,63,26,65],[184,219,16,24]], [112,246]),
  dig6: shape([[23,78,181,168]], [[24,94,24,43],[153,136,48,25],[174,86,26,28],[29,157,18,24],[166,184,26,28],[72,220,16,23]], [113,246]),
  workshops: shape([[13,109,118,95],[141,77,95,127],[131,143,10,61]], [[12,130,23,74],[34,68,24,57],[71,83,59,54],[106,116,18,31],[206,102,32,42],[128,162,24,42],[150,162,62,43],[215,152,21,52]], [62,208]),
  infirmary: shape([[13,77,128,126]], [[17,36,20,56],[75,20,46,68],[115,52,25,48],[109,104,33,55],[12,119,16,84],[42,128,30,38],[48,158,16,31],[97,141,44,61]], [80,208]),
  well: shape([[26,93,129,48]], [[55,70,6,55],[34,67,17,41],[93,107,12,22],[113,115,16,27],[132,112,16,30]], [76,145]),
};
const cabinSolids = [[8,82,28,62],[38,93,30,19],[70,82,28,62],[140,80,55,48],
  [167,129,30,37],[41,157,16,36],[67,160,30,37],[107,157,16,36]];
for (let n = 1; n <= 5; n++) {
  const mirrored = n >= 4;
  ROOM_COLLISION['cabin'+n] = shape([[6,82,192,82],[38,164,128,35],[102,0,32,82]],
    cabinSolids.map(([x,y,w,h]) => [mirrored ? 204-x-w : x,y,w,h]),
    [mirrored ? 86 : 118,2], {north:true, mirroredFloor:mirrored});
  if(n===1)ROOM_COLLISION['cabin'+n].solids.push([136,132,30,32]);
  if(n===2)ROOM_COLLISION['cabin'+n].solids.push([136,173,23,22]);
  if(n===4)ROOM_COLLISION['cabin'+n].solids.push([39,179,38,21]);
  if(n===5)ROOM_COLLISION['cabin'+n].solids.push([38,140,20,56]);
}

// Existing openings measured from the untouched ZIP compositions. Their width
// is retained instead of opening a second gap beside the artist's original one.
for (const [id,x,y,width] of [
  ['common',62,138,48], ['archive',70,234,64], ['records',86,170,32],
  ['study',70,170,32], ['sparebedroom',70,170,32], ['projection',70,170,32],
  ['library',70,170,32], ['grandbedroom',70,170,32], ['hearth',86,202,32],
  ['parlour',86,202,32], ['salon',166,202,32], ['sodabar',118,202,32],
  ['maintenance',190,194,32], ['stalls',54,138,32], ['washroom',50,138,32],
  ['dig3',70,218,44], ['workshops',62,210,32], ['infirmary',78,210,64],
  ['well',74,146,32], ['dig1',90,174,32], ['dig2',90,172,32], ['games',90,194,32],
]) { Object.assign(ROOM_COLLISION[id],{entry:[x,y],openingWidth:width}); }
ROOM_COLLISION.washroom.extraEntries=[[90,138]];

// Earlier masks were measured after a mistaken 4x reduction. Preserve their
// geometry while recovering the pixels that were skipped in those exports.
const recoveredScale = {bridge:2,dock:4/3,hold:4/3,breach:4/3,face:4/3};
for (const [id, factor] of Object.entries(recoveredScale)) {
  const shape = ROOM_COLLISION[id];
  const rectangle = ([x,y,w,h]) => {
    const left=Math.round(x*factor),top=Math.round(y*factor);
    return [left,top,Math.round((x+w)*factor)-left,Math.round((y+h)*factor)-top];
  };
  shape.floor=shape.floor.map(rectangle);shape.solids=shape.solids.map(rectangle);
  shape.entry=shape.entry.map(value=>Math.round(value*factor));
  shape.openingWidth=Math.round((shape.openingWidth||16)*factor/2)*2;
}

// Native masks retain every floor pixel, including disconnected pockets. Reachability
// is a separate footprint-specific result; a missing route never paints a wall.
const FURNITURE_CORRECTIONS = {
  common: [[83,103,21,18]],
  games: [[47,122,22,24],[104,130,16,26],[101,94,21,15],[134,86,20,20]],
  dock: [[58,151,21,40]], hold: [[56,87,18,35]],
  maintenance: [[166,111,65,54]], archive: [[7,201,20,28]],
  winter: [[7,111,29,43]], servicecounter: [[55,101,75,28]],
};
for(const[id,rectangles]of Object.entries(FURNITURE_CORRECTIONS)) ROOM_COLLISION[id].solids.push(...rectangles);

// Keep genuine partitions; known sprite objects use their native silhouettes.
for(const id of ['games', 'dig1', 'dig2', 'cabin1', 'cabin2', 'cabin3', 'cabin4', 'cabin5']) {
  ROOM_COLLISION[id].solids = id==='dig1' ? [[74,34,63,73]] : id==='dig2' ? [[70,4,8,102]]
    : id==='cabin2' ? [[136,173,23,22]] : id==='cabin4' ? [[39,179,38,21]] : [];
}
function solidAt(id,x,y){
  return ROOM_COLLISION[id].solids.some(r=>insideRect(x,y,r)) || (ROOM_OBJECTS[id]||[]).some(o=>o.footprintMask?.[y-o.bounds[1]]?.[x-o.bounds[0]]==='1');
}

function insideRect(x,y,[rx,ry,rw,rh]) { return x>=rx && x<rx+rw && y>=ry && y<ry+rh; }
export function roomNavigation(id) {
  const room=ROOM_ART[id],spec=ROOM_COLLISION[id];
  if(!room||!spec)throw new Error('Unknown explorer room: '+id);
  const cellSize=ROOM_CELL_SIZE,cols=room.W;
  const rows=spec.north?room.H:Math.max(spec.entry[1],...(spec.extraEntries||[]).map(p=>p[1]));
  const grid=Array.from({length:rows},(_,y)=>Array.from({length:cols},(_,x)=>{
    const floorX=spec.mirroredFloor?room.W-1-x:x;
    return spec.floor.some(r=>insideRect(floorX,y,r))&&!solidAt(id,x,y)?'.':'#';
  }));
  const openings=[];
  for(const entry of[spec.entry,...(spec.extraEntries||[])]){
    const at={x:entry[0]-1,y:spec.north?0:entry[1]-1};
    const direction=spec.north?1:-1;
    let floorY=at.y;
    while(floorY>=0&&floorY<rows&&grid[floorY][at.x]!=='.')floorY+=direction;
    if(floorY<0||floorY>=rows)throw new Error('No approach to room opening: '+id);
    let from=entry[0]-(spec.openingWidth||16)/2,to=entry[0]+(spec.openingWidth||16)/2-1;
    if(spec.north){from=at.x;to=at.x;while(grid[at.y]?.[from-1]==='.')from--;while(grid[at.y]?.[to+1]==='.')to++;}
    for(let y=Math.min(at.y,floorY);y<=Math.max(at.y,floorY);y++)for(let x=from;x<=to;x++){
      if(x>=0&&x<cols&&!solidAt(id,x,y))grid[y][x]='.';
    }
    const arrival={x:at.x,y:at.y+direction*12};
    if(grid[arrival.y]?.[arrival.x]!=='.')arrival.y=floorY;
    openings.push({at,arrival,outward:spec.north?'north':'south',span:{from,to},nativeCenter:entry[0],width:to-from+1});
  }
  const component=new Int32Array(cols*rows).fill(-1),sizes=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const first=y*cols+x;if(grid[y][x]!=='.'||component[first]!==-1)continue;
    const index=sizes.length,queue=[first];component[first]=index;
    for(let h=0;h<queue.length;h++){
      const n=queue[h],cx=n%cols,cy=Math.floor(n/cols);
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=cx+dx,ny=cy+dy,next=ny*cols+nx;
        if(nx<0||nx>=cols||ny<0||ny>=rows||grid[ny][nx]!=='.'||component[next]!==-1)continue;
        component[next]=index;queue.push(next);
      }
    }
    sizes.push(queue.length);
  }
  const reached=new Set(openings.map(o=>component[o.arrival.y*cols+o.arrival.x]));
  const inaccessibleFloorPixels=sizes.reduce((sum,size,index)=>sum+(reached.has(index)?0:size),0);
  return {width:room.W,height:room.H,cellSize,grid:grid.map(row=>row.join('')),
    exit:openings[0].at,spawn:openings[0].arrival,entry:openings[0].arrival,exits:openings,
    sealed:!!spec.sealed,outward:spec.north?'north':'south',
    objects:ROOM_OBJECTS[id]||[],footprint:{width:12,depth:8,behind:6},diagnostics:{pointComponents:sizes,inaccessibleFloorPixels},
    inaccessibleFloorCells:inaccessibleFloorPixels};
}

function canvas(w,h) { const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').imageSmoothingEnabled=false;return c; }
async function sourceFor(family) {
  if (!families.has(family)) families.set(family,FAMILY[family][0]());
  return families.get(family);
}
// These eleven older scenes predate the ZIP-only corridor rule and contain
// their already-approved hand-drawn shells / light. Preserve their original
// raw canvases as source rasters: Canvas alpha/gradient rounding differs across
// platforms. Export checks the raster AND authoring dependencies by SHA-256.
// No new painted prop or alternative drawing implementation is introduced.
// Digging light outside the source shell is omitted when copying (see below).
async function legacyCanvas(spec) {
  const rendered=new Image();
  rendered.src=new URL(spec.legacy.raster,import.meta.url).href;
  await rendered.decode();
  const c=canvas(spec.W,spec.H),g=c.getContext('2d');
  if (spec.legacy.outline) {
    // Each retained pixel is copied once, directly from the original canvas.
    // Integer source rectangles preserve every wall, object and lit pixel
    // inside the outline; only the lamp's spill into empty space is absent.
    const scaleX=rendered.width/spec.W,scaleY=rendered.height/spec.H;
    for(const [x,y,w,h] of legacyOutlineCopies(spec.legacy.outline))
      g.drawImage(rendered,x*scaleX,y*scaleY,w*scaleX,h*scaleY,x,y,w,h);
  } else g.drawImage(rendered,0,0,spec.W,spec.H);
  return c;
}

/** Exact outer-shell rectangles, less its measured rectangular cuts. The
 * source REF coordinates are inclusive, as in digging-kit.js outline(0).
 * These are image-copy windows, never newly painted room geometry. */
export function legacyOutlineCopies({x0,y0,x1,y1,cuts}) {
  const edges=[...new Set([y0,y1+1,...cuts.flatMap(([,top,,bottom])=>[
    Math.max(y0,Math.min(y1+1,top)),Math.max(y0,Math.min(y1+1,bottom+1)),
  ])])].sort((a,b)=>a-b);
  const copies=[];
  for(let index=0;index<edges.length-1;index++) {
    const top=edges[index],bottom=edges[index+1];
    let spans=[[x0,x1+1]];
    for(const [cutLeft,cutTop,cutRight,cutBottom] of cuts) {
      if(top>cutBottom||bottom<=cutTop)continue;
      spans=spans.flatMap(([left,right])=>{
        if(cutRight<left||cutLeft>=right)return [[left,right]];
        return [[left,Math.max(left,cutLeft)],[Math.min(right,cutRight+1),right]]
          .filter(([start,end])=>end>start);
      });
    }
    for(const [left,right] of spans)copies.push([left,top,right-left,bottom-top]);
  }
  return copies;
}

// Copy an existing clear floor patch over only the open threshold. The source
// is selected from the authored floor mask and recorded in `thresholdSources`.
// This removes a wall lip/page-white, never a piece of furniture or decoration.
function openThresholds(c, navigation, spec) {
  const g=c.getContext('2d'), thresholdSources=[];
  for (const opening of navigation.exits) {
    if (spec.north) continue; // Original cabin ladder-well already has its gap.
    const x=Math.floor(opening.nativeCenter/4)*4, y=Math.floor((opening.at.y+1)/4)*4;
    let sample=null;
    for(let distance=12;distance<=48 && !sample;distance+=4) {
      for(const dx of [0,-4,4,-8,8]) {
        const sx=x+dx-4,sy=y-distance;
        const clear=[0,4].every(oy=>[0,4].every(ox=>navigation.grid[sy+oy+2]?.[sx+ox+2]==='.'
          && spec.floor.some(r=>insideRect(sx+ox+2,sy+oy+2,r))));
        if(clear){sample={x:sx,y:sy,w:8,h:8};break;}
      }
    }
    if(!sample) continue;
    const patch=canvas(8,8);patch.getContext('2d').drawImage(c,sample.x,sample.y,8,8,0,0,8,8);
    const bottom=Math.min(c.height,y+4),top=Math.max(0,y-4);
    const left=opening.nativeCenter-opening.width/2,right=left+opening.width;
    for(let dx=left;dx<right;dx+=8) {const w=Math.min(8,right-dx);g.drawImage(patch,0,0,w,bottom-top,dx,top,w,bottom-top);}
    thresholdSources.push({source:sample,destination:[left,top,opening.width,bottom-top]});
  }
  return thresholdSources;
}

// Flattened reference exports contain a white page outside their outline.
// Remove only the page component touching an edge; white furniture remains.
function clearOuterPage(c) {
  const g=c.getContext('2d'),W=c.width,H=c.height,frame=g.getImageData(0,0,W,H);
  const px=frame.data,seen=new Uint8Array(W*H),queue=[];
  const offer=(x,y)=>{
    if(x<0||y<0||x>=W||y>=H)return;
    const n=y*W+x;
    if(seen[n]||px[n*4]<244||px[n*4+1]<244||px[n*4+2]<244)return;
    seen[n]=1;queue.push(n);
  };
  for(let x=0;x<W;x++){offer(x,0);offer(x,H-1);}
  for(let y=0;y<H;y++){offer(0,y);offer(W-1,y);}
  for(let head=0;head<queue.length;head++){
    const n=queue[head],x=n%W,y=Math.floor(n/W);px[n*4+3]=0;
    offer(x-1,y);offer(x+1,y);offer(x,y-1);offer(x,y+1);
  }
  g.putImageData(frame,0,0);
}

export async function loadExplorerRoom(id, {openings=true}={}) {
  const spec=ROOM_ART[id];
  if(!spec) throw new Error('No approved art for '+id);
  let c;
  if(spec.legacy)c=await legacyCanvas(spec);
  else {
    c=canvas(spec.W,spec.H);
    const source=await sourceFor(spec.family), draw=FAMILY[spec.family][1];
    if(spec.nativeScale){
      const full=CANON_PARTIALS[id],native=canvas(full.W,full.H);
      draw(native.getContext('2d'),source,spec.key);
      const [cx,cy,cw,ch]=spec.sourceCrop||[0,0,full.W,full.H];
      c.getContext('2d').drawImage(native,cx,cy,cw,ch,0,0,spec.W,spec.H);
    } else draw(c.getContext('2d'),source,spec.key);
  }
  if(openings&&id==='hold'){
    // Remove only the central 22px fence gate. This is the original interior
    // ground from Shelter_8 ([345,399,24,24] in its 3x ZIP composition).
    const tile=canvas(8,8);tile.getContext('2d').drawImage(c,99,117,8,8,0,0,8,8);
    for(let y=160;y<219;y+=8)for(let x=85;x<107;x+=8){const h=Math.min(8,219-y),w=Math.min(8,107-x);c.getContext('2d').drawImage(tile,0,0,w,h,x,y,w,h);}
  }
  if(openings)clearOuterPage(c);
  const navigation=roomNavigation(id);
  const thresholdSources=openings?openThresholds(c,navigation,ROOM_COLLISION[id]):[];
  const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  const outlineMask=Array.from({length:c.height},(_,y)=>Array.from({length:c.width},(_,x)=>pixels[(y*c.width+x)*4+3]>8?'1':'0').join(''));
  return {...navigation,outlineMask,canvas:c,id,label:spec.label,thresholdSources};
}
export const loadRoomArt=loadExplorerRoom;
export function drawExplorerRoom(g,art) {g.imageSmoothingEnabled=false;g.drawImage(art.canvas,0,0);}

export function createRoomArt(scene) { return loadExplorerRoom(typeof scene==='string'?scene:scene.roomId); }
