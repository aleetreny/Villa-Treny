import { describe, expect, it } from 'vitest';
import { SLEEPS } from './engine/state';
import { RESIDENTS, RESIDENT_BY_ID } from './residents';
import { ROOM_BY_ID, ROOMS, type RoomId } from './rooms';

const homes = [...new Set(Object.values(SLEEPS))];

describe('room names represent the people and places in the canon', () => {
  it('gives each place a distinct name, including the archived passages', () => {
    expect(new Set(ROOMS.map((room) => room.name.toLocaleLowerCase('en'))).size).toBe(ROOMS.length);
    expect(ROOM_BY_ID.longwalk.name).toBe('The Long Walk');
    expect(ROOM_BY_ID.row.name).toBe('The Row');
    expect(ROOM_BY_ID.breach.name).toBe('The Breach');
  });

  it('never names a shared home after just one resident', () => {
    for (const id of homes) {
      const residents = RESIDENTS.filter((resident) => SLEEPS[resident.id] === id);
      expect(residents.length).toBeGreaterThan(1);
      for (const resident of residents) {
        const first = resident.name.split(' ')[0];
        expect(ROOM_BY_ID[id].name, `${id} is shared by ${residents.map((person) => person.name).join(', ')}`)
          .not.toMatch(new RegExp(`^${first}['’]s$`));
      }
    }
  });

  it('names every canonical housemate in their home description with the correct spelling', () => {
    for (const resident of RESIDENTS) {
      expect(ROOM_BY_ID[SLEEPS[resident.id]].description, `The home of ${resident.name}`)
        .toContain(resident.name);
    }
  });

  it('keeps the six established shared-home names when approved artwork changes', () => {
    const physicalNames: readonly [RoomId, string][] = [
      ['dig1', 'The Joined Rooms'],
      ['dig2', 'The Unfinished Rooms'],
      ['dig3', 'The Near Rooms'],
      ['dig4', 'The Square Room'],
      ['dig5', 'The Far Room'],
      ['dig6', 'The Small Room'],
    ];
    for (const [id, name] of physicalNames) {
      expect(ROOM_BY_ID[id].name).toBe(name);
    }
  });

  it('keeps the spare bedrooms unassigned and names Kes’s room for his actual duty', () => {
    expect(homes).not.toContain('sparebedroom');
    expect(homes).not.toContain('grandbedroom');
    expect(ROOM_BY_ID.dispatch.name).toBe(RESIDENT_BY_ID.K.duty);
    expect(ROOM_BY_ID.dispatch.description).toContain(RESIDENT_BY_ID.K.name);
  });
});
