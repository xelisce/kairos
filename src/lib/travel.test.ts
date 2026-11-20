import { describe, expect, it } from 'vitest';
import { defaultData } from './defaults';
import { expand } from './expand';
import { nameTaken, renamePlace, resolvePlace } from './places';
import { fromLocal } from './time';
import { clock, hm, lengthMin, sampleData } from '../test/fixtures';

const monday = () => [fromLocal('2026-08-31'), fromLocal('2026-09-01')] as const;

describe('places', () => {
  const d = defaultData();
  d.places.push(
    { id: 'b', name: 'Brogden Psychology Building', aliases: ['BPB'] },
    { id: 'm', name: 'Morgridge Hall', aliases: ['MH'] },
    { id: 'p', name: 'Plant Sciences', aliases: ['PS'] },
    { id: 'c', name: 'COM1', aliases: [] },
  );

  it('match names and aliases as whole words, any length', () => {
    expect(resolvePlace(d, '107 BPB')!.id).toBe('b');
    expect(resolvePlace(d, '2532 MH')!.id).toBe('m');
    expect(resolvePlace(d, '108 PS')!.id).toBe('p');
    expect(resolvePlace(d, 'COM1-0204')!.id).toBe('c');
    expect(resolvePlace(d, '107 Brogden Psychology Building')!.id).toBe('b');
    expect(resolvePlace(d, 'Psychology dept')!.known).toBe(false); // "PS" isn't a word in it
    expect(resolvePlace(d, '107 BPB')!.short).toBe('BPB');
  });

  it('know when a name is already used (by a name or alias, any capitalisation)', () => {
    expect(nameTaken(d.places, ' com1 ')).toBe(true);
    expect(nameTaken(d.places, 'bpb')).toBe(true);
    expect(nameTaken(d.places, 'COM1', 'c')).toBe(false); // renaming COM1 itself
    expect(nameTaken(d.places, 'Union South')).toBe(false);
  });

  it('rename the old name inside locations too, whole words only', () => {
    const data = defaultData();
    data.places.push(
      { id: 'b', name: 'Brogden Psychology Building', aliases: [] },
      { id: 'e', name: 'EH', aliases: [] },
    );
    const at = (location: string, id: string) => ({
      id,
      title: id,
      category: 'other' as const,
      start: '2026-11-20T10:00',
      end: '2026-11-20T11:00',
      location,
    });
    data.events = [
      at('107 Brogden Psychology Building', '1'),
      at('brogden psychology building', '2'),
      at('Chemistry', '3'),
    ];
    renamePlace(data, 'b', 'Brogden');
    renamePlace(data, 'e', 'Engineering Hall');
    expect(data.events.map((e) => e.location)).toEqual(['107 Brogden', 'Brogden', 'Chemistry']);
  });
});

describe('trips', () => {
  it('go there and back, with the extra minutes for finding the room', () => {
    const trips = expand(sampleData(), ...monday()).filter((o) => o.source.type === 'travel');
    expect(trips).toHaveLength(2);
    expect(clock(trips[0].start)).toBe(hm(11, 30) - 35); // 30 + 5
  });

  it('show the short name and use the saved route time', () => {
    const d = defaultData();
    d.routines = [];
    d.places.push({ id: 'b', name: 'Brogden Psychology Building', aliases: ['BPB'] });
    d.routes.push({ id: 'r', a: d.places[0].id, b: 'b', minutes: 30, bidirectional: true });
    d.events = [
      {
        id: 'e',
        title: 'Class',
        category: 'other',
        start: '2026-11-20T13:00',
        end: '2026-11-20T14:00',
        location: '107 BPB',
      },
    ];
    const trip = expand(d, fromLocal('2026-11-20'), fromLocal('2026-11-21')).find((o) => o.id.endsWith(':in'))!;
    expect(trip.title).toBe('🚶 BPB');
    expect(lengthMin(trip)).toBe(30 + d.settings.travelBufferMin);
  });

  it('one-way routes only apply in their direction', () => {
    const d = sampleData();
    d.routes[0].bidirectional = false; // Home -> COM1 only
    const back = expand(d, ...monday()).find((o) => o.id.endsWith(':home'))!;
    expect(lengthMin(back)).toBe(d.settings.defaultTravelMin);
  });

  it('moving a trip later warns that you would arrive late', () => {
    const d = sampleData();
    const trip = expand(d, ...monday()).find((o) => o.id.endsWith(':in'))!;
    if (trip.source.type !== 'travel') throw new Error('expected a trip');
    d.travelMoves[trip.source.key] = '2026-08-31T11:10';
    const moved = expand(d, ...monday()).find((o) => o.id === trip.id)!;
    expect(clock(moved.start)).toBe(hm(11, 10));
    expect(moved.warning).toMatch(/late/);
  });
});
