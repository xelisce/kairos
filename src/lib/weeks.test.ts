import { describe, expect, it } from 'vitest';
import { fromLocal } from './time';
import {
  SEMESTER_PRESETS,
  dayMarker,
  formatLayout,
  formatWeeks,
  parseLayout,
  parseWeeks,
  semesterFromPreset,
} from './weeks';

describe('week patterns', () => {
  it('parses ranges, odd/even and lists', () => {
    expect(parseWeeks('3-13')).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(parseWeeks('odd')).toEqual([1, 3, 5, 7, 9, 11, 13]);
    expect(parseWeeks('even 2-12')).toEqual([2, 4, 6, 8, 10, 12]);
    expect(parseWeeks('1,3,5-7')).toEqual([1, 3, 5, 6, 7]);
    expect(() => parseWeeks('banana')).toThrow();
  });

  it('formats compactly', () => {
    expect(formatWeeks([1, 2, 3, 5])).toBe('1-3, 5');
    expect(formatWeeks([3, 5, 7, 9])).toBe('odd 3-9');
  });

  it('rejects odd/even for US-style semesters', () => {
    expect(() => parseWeeks('odd', 15, false)).toThrow();
    expect(formatWeeks([1, 3, 5, 7], false)).toBe('1, 3, 5, 7');
  });

  it('round-trips semester layouts', () => {
    const layout = parseLayout('1-6, Recess, 7-13, Reading, Exam, Exam');
    expect(layout).toHaveLength(17);
    expect(layout[6]).toEqual({ type: 'break', name: 'Recess' });
    expect(formatLayout(layout)).toBe('1-6, Recess, 7-13, Reading, Exam, Exam');
  });
});

describe('day markers', () => {
  const sems = [semesterFromPreset(SEMESTER_PRESETS[0], 's')];

  it('holidays beat week labels; finals are exam days', () => {
    expect(dayMarker(sems, fromLocal('2026-11-26'))).toEqual({ label: 'Thanksgiving', kind: 'break' });
    expect(dayMarker(sems, fromLocal('2026-09-07'))!.label).toBe('Labor Day');
    expect(dayMarker(sems, fromLocal('2026-12-15'))).toEqual({ label: 'Finals Week', kind: 'exam' });
    expect(dayMarker(sems, fromLocal('2026-11-18'))).toBeNull();
  });
});
