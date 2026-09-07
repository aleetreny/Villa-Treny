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
