// Original, approved authoring canvases. The canonical PNGs capture these
// before explorer openings, outside-light clipping or navigation are applied.
export const LEGACY_ROOM_SOURCES = [
  ['workshops',250,228,'workshops.html','#one'],
  ['infirmary',154,218,'infirmary.html','#one'],
  ['well',184,170,'well.html','#one'],
  ...Array.from({length:5}, (_, i) => ['cabin'+(i+1),204,205,'cabins.html',`#strip .cab:nth-child(${i+1}) canvas`]),
  ['dig1',245,181,'diggings.html','#wrap figure:nth-child(1) canvas'],
  ['dig2',181,187,'diggings.html','#wrap figure:nth-child(2) canvas'],
  ['games',179,217,'diggings.html','#wrap figure:nth-child(7) canvas'],
];

// Complete, reviewed dependency closure of the five authoring pages above.
// Capture compares actual requests against this list; normal verification
// rejects omitted sources even if the manifest itself was edited.
export const LEGACY_AUTHORING_DEPENDENCIES = [
  'public/assets/props/bathroom.png',
  'public/assets/props/bathroom_roomtiles.png',
  'public/assets/props/makeshift.png',
  'public/assets/props/makeshift_roomtiles.png',
  'public/assets/props/shelter_furniture.png',
  'public/assets/props/shelter_walls.png',
  'public/assets/props/workshop.png',
  'public/assets/props/workshop_roomtiles.png',
  'scripts/capture-legacy-room-art.mjs',
  'tools/roomlab/bedroom-kit.js',
  'tools/roomlab/cabin-kit.js',
  'tools/roomlab/cabins.html',
  'tools/roomlab/digging-kit.js',
  'tools/roomlab/diggings.html',
  'tools/roomlab/habitat-plan.json',
  'tools/roomlab/infirmary.html',
  'tools/roomlab/legacy-room-sources.js',
  'tools/roomlab/library/sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Furniture_32x32.png',
  'tools/roomlab/library/sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Terrain_Tiles_32x32.png',
  'tools/roomlab/library/sheets/Post Apoc Shelter - Asset Pack/Post Apoc - Shelter 32x32 Grid/Shelter_Walls_32x32.png',
  'tools/roomlab/reference/shelter-bunk-and-stores.jpg',
  'tools/roomlab/reference/xmas-container-room.jpg',
  'tools/roomlab/well.html',
  'tools/roomlab/workshops.html',
];
