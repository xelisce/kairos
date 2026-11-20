import { describe, expect, it } from 'vitest';
import { dependsOn, planOrder } from './dependencies';
import { task } from '../test/fixtures';

describe('dependencies', () => {
  const a = task({ id: 'a', deadline: '2026-09-01T23:59', dependsOn: ['b'] });
  const b = task({ id: 'b', deadline: '2026-09-09T23:59', dependsOn: ['c'] });
  const c = task({ id: 'c' });
  const byDeadline = (x: typeof a, y: typeof a) => (x.deadline ?? '9999').localeCompare(y.deadline ?? '9999');

  it('plan a task after the ones it depends on, otherwise by deadline', () => {
    expect(planOrder([a, b, c, task({ id: 'd', deadline: '2026-09-02T23:59' })], byDeadline).map((t) => t.id)).toEqual([
      'd',
      'c',
      'b',
      'a',
    ]);
  });

  it('see through chains, and survive loops', () => {
    expect(dependsOn(a, 'c', [a, b, c])).toBe(true);
    expect(dependsOn(c, 'a', [a, b, c])).toBe(false);
    const loopA = task({ id: 'x', dependsOn: ['y'] });
    const loopB = task({ id: 'y', dependsOn: ['x'] });
    expect(planOrder([loopA, loopB], byDeadline)).toHaveLength(2);
    expect(dependsOn(loopA, 'z', [loopA, loopB])).toBe(false);
  });
});
