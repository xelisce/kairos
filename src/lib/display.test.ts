import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY, displayOf, shown } from './display';
import type { Occ } from '../types';

const occ = (type: 'routine' | 'task' | 'travel' | 'class'): Occ =>
  ({
    id: type,
    source: { type },
    title: type,
    start: new Date(),
    end: new Date(),
    color: '',
    movable: true,
    warning: 'late',
  }) as Occ;

describe('display settings', () => {
  it('start from the built-in ones', () => {
    expect(displayOf({})).toEqual(DEFAULT_DISPLAY);
    expect(displayOf({ display: { dragTravel: false } }).dragTravel).toBe(false);
  });

  it('hide only the warnings you silenced', () => {
    const d = displayOf({ display: { silenceRoutines: true, silenceTravel: true } });
    expect(shown(occ('routine'), d).warning).toBeUndefined();
    expect(shown(occ('travel'), d).warning).toBeUndefined();
    expect(shown(occ('task'), d).warning).toBe('late');
    expect(shown(occ('class'), d).warning).toBe('late');
  });
});
