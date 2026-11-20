import { describe, expect, it } from 'vitest';
import { parseDMY, toDMY } from './time';

describe('dd/mm/yyyy', () => {
  it('reads day-first dates', () => {
    expect(parseDMY('20/11/2026')).toBe('2026-11-20');
    expect(parseDMY('2-9-26')).toBe('2026-09-02');
  });

  it('rejects impossible dates', () => {
    expect(parseDMY('31/02/2026')).toBeNull();
    expect(parseDMY('11/20/2026')).toBeNull(); // there's no month 20
    expect(parseDMY('20/11/2206')).toBeNull(); // a typo for 2026
    expect(parseDMY('20/11/1926')).toBeNull();
  });

  it('shows day-first', () => {
    expect(toDMY('2026-09-07')).toBe('07/09/2026');
  });
});
