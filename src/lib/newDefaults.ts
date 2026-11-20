// What a new task, event, trip, routine or CCA starts with. Changed in Settings > New items;
// anything you haven't changed uses these.
import type { NewItemDefaults, Settings } from '../types';
import { DEFAULT_SPLIT } from './tasks';

export const DEFAULT_NEW: NewItemDefaults = {
  taskMin: 60,
  taskCategory: 'homework',
  taskOnCalendar: true,
  taskAutoPlan: true,
  taskSplit: false,
  split: DEFAULT_SPLIT,
  deadlineTime: '23:59',
  notBeforeTime: '09:00',
  quickMin: 30,
  quickOnCalendar: false,
  eventMin: 120,
  awayStart: '06:00',
  awayEnd: '23:00',
  awayDays: 2,
  routineMin: 30,
  activityStart: '18:00',
  activityEnd: '20:00',
};

/** Your defaults: what you changed in Settings, the built-in ones for the rest. */
export const newDefaults = (s: Pick<Settings, 'newDefaults'>): NewItemDefaults => ({
  ...DEFAULT_NEW,
  ...s.newDefaults,
  split: { ...DEFAULT_NEW.split, ...s.newDefaults?.split },
});
