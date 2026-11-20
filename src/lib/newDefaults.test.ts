import { describe, expect, it } from 'vitest';
import { DEFAULT_NEW, newDefaults } from './newDefaults';
import { quickAddTask } from './actions';
import { useStore } from '../store';
import { defaultData } from './defaults';

describe('defaults for new things', () => {
  it('use the built-in ones until you change something', () => {
    expect(newDefaults({})).toEqual(DEFAULT_NEW);
    const mine = newDefaults({ newDefaults: { taskSplit: true, split: { maxSessionMin: 90 } as never } });
    expect(mine.taskSplit).toBe(true);
    expect(mine.split).toEqual({ ...DEFAULT_NEW.split, maxSessionMin: 90 });
    expect(mine.taskMin).toBe(60);
  });

  it('are what a brain-dumped task starts with', () => {
    const d = defaultData();
    d.settings.newDefaults = { quickMin: 45, quickOnCalendar: true };
    useStore.getState().replaceAll(d, 'test');
    quickAddTask('Read chapter 4');
    const t = useStore.getState().data.tasks.find((x) => x.title === 'Read chapter 4')!;
    expect([t.durationMin, t.onCalendar]).toEqual([45, true]);
  });
});
