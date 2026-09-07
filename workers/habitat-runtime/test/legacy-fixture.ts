import { createGenesisWorld, serializeWorldState } from '../src/domain';

/** A version-1 database world, with life already lived in the retired layout. */
export function legacyWorld() {
  const current = JSON.parse(serializeWorldState(createGenesisWorld())) as {
    day: number; watch: number;
    bodies: Record<string, { id: string; room: string; at: { x: number; y: number }; cells: number }>;
    rooms: Record<string, { id: string; lit: boolean }>;
    axes: Array<[string, Record<string, number>]>;
    record: Array<Record<string, unknown>>;
  };
  delete (current as unknown as Record<string, unknown>).economy;
  for (const body of Object.values(current.bodies)) {
    delete (body as unknown as Record<string, unknown>).memory;
    delete (body as unknown as Record<string, unknown>).lastThoughtWatch;
    for (const key of ['lastAttemptWatch', 'lastInteractionWatch', 'knownFacts', 'plan']) delete (body as unknown as Record<string, unknown>)[key];
  }
  const ids = ['bridge', 'dock', 'cabins', 'breach', 'hold', 'infirmary', 'berths',
    'spine', 'greatwall', 'common', 'hydroponics', 'diggings', 'workshops', 'well', 'face', 'hollow'];
  current.day = 106;
  current.watch = 3;
  current.rooms = Object.fromEntries(ids.map((id) => [id, { id, lit: id !== 'breach' }]));
  for (const body of Object.values(current.bodies)) {
    if (!ids.includes(body.room)) body.room = 'greatwall';
    body.at = { x: 25, y: 4 };
  }
  current.bodies.A!.room = 'greatwall';
  current.bodies.A!.cells = 19;
  current.bodies.J!.room = 'spine';
  current.bodies.V!.room = 'hydroponics';
  current.bodies.D!.room = 'cabins';
  current.bodies.Y!.room = 'diggings';
  current.axes.find(([pair]) => pair === 'AB')![1].trust = 91;
  current.record = [{
    day: 106, watch: 2, minute: 366, room: 'hydroponics', who: ['V'],
    text: 'The seedlings survived another watch.', kind: 'work',
  }];
  return current;
}
