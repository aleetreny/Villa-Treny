import { useState } from 'react';
import { ROOM_BY_ID, type RoomId } from '../../../lib/habitat/rooms';
import type { HabitatSnapshot } from '../../../lib/habitat/snapshot';

export const ROOM_WINGS: readonly { name: string; rooms: readonly RoomId[] }[] = [
  { name: 'The surface', rooms: ['camp', 'garden', 'sheltergate', 'yard', 'graveyard'] },
  { name: 'The hull', rooms: ['bridge', 'dock', 'hold', 'infirmary', 'cabin1', 'cabin2', 'cabin3', 'cabin4', 'cabin5'] },
  { name: 'Shared life', rooms: ['common', 'workshops', 'games', 'maintenance'] },
  { name: 'The register', rooms: ['administration', 'dispatch', 'archive', 'records'] },
  { name: 'The quiet rooms', rooms: ['study', 'sparebedroom', 'parlour', 'projection', 'winter'] },
  { name: 'What they brought', rooms: ['library', 'grandbedroom', 'salon', 'hearth'] },
  { name: 'At the table', rooms: ['kitchen', 'servicecounter', 'maindiner', 'sodabar'] },
  { name: 'The waterworks', rooms: ['well', 'stalls', 'washroom'] },
  { name: 'The rock', rooms: ['face', 'dig1', 'dig2', 'dig3', 'dig4', 'dig5', 'dig6'] },
];

/** The observer visits interiors; the earlier corridor scenes remain in RoomLab. */
export function observerRoom(id: RoomId): RoomId {
  return id === 'longwalk' || id === 'row' ? 'common' : id;
}

type AtlasPlace = { id: RoomId; x: number; y: number; w: number; h: number };

// A room index, not a claim about metric distance. Families meet in compact
// patches around Common; choosing a room never makes the observer walk a hall.
const PLACES: readonly AtlasPlace[] = [
  { id: 'camp', x: 68, y: 8, w: 25, h: 20 },
  { id: 'garden', x: 96, y: 4, w: 32, h: 24 },
  { id: 'sheltergate', x: 131, y: 13, w: 22, h: 21 },
  { id: 'yard', x: 96, y: 31, w: 27, h: 18 },
  { id: 'graveyard', x: 156, y: 22, w: 21, h: 18 },
  { id: 'bridge', x: 13, y: 33, w: 25, h: 22 },
  { id: 'dock', x: 41, y: 36, w: 24, h: 23 },
  { id: 'cabin1', x: 8, y: 58, w: 17, h: 18 },
  { id: 'cabin2', x: 28, y: 62, w: 17, h: 18 },
  { id: 'cabin3', x: 48, y: 62, w: 17, h: 18 },
  { id: 'cabin4', x: 8, y: 79, w: 17, h: 18 },
  { id: 'cabin5', x: 28, y: 83, w: 17, h: 18 },
  { id: 'hold', x: 48, y: 83, w: 28, h: 24 },
  { id: 'infirmary', x: 68, y: 52, w: 25, h: 28 },
  { id: 'breach', x: 6, y: 100, w: 19, h: 17 },
  { id: 'common', x: 79, y: 83, w: 35, h: 32 },
  { id: 'workshops', x: 79, y: 118, w: 35, h: 24 },
  { id: 'games', x: 117, y: 101, w: 23, h: 23 },
  { id: 'maintenance', x: 117, y: 127, w: 23, h: 19 },
  { id: 'administration', x: 126, y: 43, w: 27, h: 24 },
  { id: 'dispatch', x: 96, y: 52, w: 27, h: 28 },
  { id: 'archive', x: 156, y: 43, w: 21, h: 21 },
  { id: 'records', x: 126, y: 70, w: 29, h: 28 },
  { id: 'study', x: 159, y: 67, w: 23, h: 22 },
  { id: 'sparebedroom', x: 185, y: 70, w: 21, h: 20 },
  { id: 'parlour', x: 158, y: 92, w: 27, h: 25 },
  { id: 'projection', x: 188, y: 93, w: 22, h: 24 },
  { id: 'winter', x: 164, y: 120, w: 34, h: 21 },
  { id: 'library', x: 143, y: 144, w: 27, h: 28 },
  { id: 'grandbedroom', x: 173, y: 144, w: 28, h: 24 },
  { id: 'salon', x: 145, y: 175, w: 26, h: 25 },
  { id: 'hearth', x: 174, y: 171, w: 24, h: 23 },
  { id: 'kitchen', x: 51, y: 111, w: 25, h: 23 },
  { id: 'servicecounter', x: 27, y: 119, w: 21, h: 22 },
  { id: 'maindiner', x: 24, y: 144, w: 34, h: 27 },
  { id: 'sodabar', x: 61, y: 145, w: 22, h: 23 },
  { id: 'well', x: 5, y: 176, w: 27, h: 25 },
  { id: 'stalls', x: 35, y: 176, w: 21, h: 20 },
  { id: 'washroom', x: 35, y: 199, w: 26, h: 23 },
  { id: 'face', x: 106, y: 218, w: 31, h: 26 },
  { id: 'dig1', x: 86, y: 147, w: 23, h: 26 },
  { id: 'dig2', x: 112, y: 149, w: 28, h: 23 },
  { id: 'dig3', x: 61, y: 174, w: 22, h: 25 },
  { id: 'dig4', x: 86, y: 176, w: 24, h: 23 },
  { id: 'dig5', x: 113, y: 175, w: 29, h: 28 },
  { id: 'dig6', x: 70, y: 202, w: 33, h: 24 },
];

export function RoomAtlas({ selected, snapshot, onSelect, compact = false }: {
  selected: RoomId;
  snapshot: HabitatSnapshot;
  onSelect: (id: RoomId) => void;
  /** Small touch maps are orientation aids; the native selector owns navigation. */
  compact?: boolean;
}) {
  const [hovered, setHovered] = useState<RoomId | null>(null);
  const current = hovered ?? selected;
  return (
    <nav className="ns-atlas" aria-label="Explore the rooms">
      <h2>The habitat</h2>
      <svg className={'ns-atlas__map'+(compact?' is-compact':'')} viewBox="0 0 216 250" aria-label="Room atlas" aria-hidden={compact || undefined}>
        {PLACES.map((place) => {
          const people = snapshot.people.filter((person) => observerRoom(person.room) === place.id);
          const sealed = place.id === 'breach';
          return (
            <g
              key={place.id}
              className={`ns-atlas__room${place.id === selected ? ' is-selected' : ''}${sealed ? ' is-sealed' : ''}`}
              data-side={ROOM_BY_ID[place.id].side}
              role={compact ? undefined : 'button'}
              aria-disabled={sealed}
              tabIndex={sealed || compact ? -1 : 0}
              aria-label={`${ROOM_BY_ID[place.id].name}${sealed ? ', sealed' : `, ${people.length} ${people.length === 1 ? 'resident' : 'residents'}`}`}
              aria-pressed={place.id === selected}
              onClick={() => { if (!sealed && !compact) onSelect(place.id); }}
              onMouseEnter={() => setHovered(place.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(place.id)}
              onBlur={() => setHovered(null)}
              onKeyDown={(event) => {
                if (!sealed && !compact && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  onSelect(place.id);
                }
              }}
            >
              <rect x={place.x} y={place.y} width={place.w} height={place.h} />
              {people.map((person, index) => (
                <rect
                  className="ns-atlas__person"
                  key={person.id}
                  x={place.x + 5 + (index % 5) * 4}
                  y={place.y + place.h - 7 - Math.floor(index / 5) * 4}
                  width="2" height="3"
                />
              ))}
              <title>{ROOM_BY_ID[place.id].name}</title>
            </g>
          );
        })}
      </svg>
      <p className="ns-atlas__caption" aria-live="polite">{ROOM_BY_ID[current].name}</p>
      <label className="ns-atlas__select">
        <span>Go to a room</span>
        <select value={selected} onChange={(event) => onSelect(event.target.value as RoomId)}>
          {ROOM_WINGS.map((wing) => (
            <optgroup key={wing.name} label={wing.name}>
              {wing.rooms.map((id) => <option key={id} value={id}>{ROOM_BY_ID[id].name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="ns-atlas__legend">
        <span data-side="hull">Hull</span><span data-side="rock">Rock</span><span data-side="surface">Surface</span>
      </div>
      <p className="ns-atlas__hint">Choose any room to observe it.</p>
    </nav>
  );
}
