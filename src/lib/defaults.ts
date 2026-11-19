import type { AppData, Routine } from '../types';
import { uid } from './time';
import { SEMESTER_PRESETS, semesterFromPreset } from './weeks';

const ALL = [0, 1, 2, 3, 4, 5, 6];

const routine = (r: Partial<Routine> & Pick<Routine, 'title' | 'category' | 'durationMin' | 'preferredStart'>): Routine => ({
  id: uid(),
  enabled: true,
  days: ALL,
  flexible: true,
  windowStart: r.preferredStart,
  windowEnd: r.preferredStart,
  color: '#3fa76a',
  skipDates: [],
  overrides: {},
  ...r,
});

export function defaultData(): AppData {
  const home = { id: uid(), name: 'Home', isHome: true, aliases: [] };
  return {
    version: 1,
    settings: {
      dayStart: '08:00',
      dayEnd: '22:00',
      bufferMin: 10,
      travelBufferMin: 5,
      defaultTravelMin: 20,
      horizonDays: 28,
      warnHours: 48,
    },
    // Currently on exchange at UW–Madison; NUS Sem 2 is one click away in the Classes tab.
    semesters: [semesterFromPreset(SEMESTER_PRESETS[0], uid())],
    modules: [],
    classes: [],
    activities: [],
    routines: [
      routine({ title: 'Breakfast', category: 'meal', durationMin: 20, preferredStart: '08:00', windowStart: '07:00', windowEnd: '10:30', color: '#e4a13a' }),
      routine({ title: 'Lunch', category: 'meal', durationMin: 45, preferredStart: '12:30', windowStart: '11:00', windowEnd: '15:00', color: '#e4a13a' }),
      routine({ title: 'Dinner', category: 'meal', durationMin: 60, preferredStart: '18:30', windowStart: '17:00', windowEnd: '21:00', color: '#e4a13a' }),
      routine({ title: 'Shower', category: 'hygiene', durationMin: 20, preferredStart: '22:30', windowStart: '20:00', windowEnd: '23:30', color: '#3fa7c9' }),
      routine({ title: 'Sleep', category: 'sleep', durationMin: 480, preferredStart: '23:30', flexible: false, windowStart: '23:30', windowEnd: '23:30', color: '#5a5f8a' }),
      routine({ title: 'Meal prep', category: 'chores', durationMin: 90, preferredStart: '16:00', windowStart: '13:00', windowEnd: '20:00', days: [6], color: '#3fa76a' }),
    ],
    events: [],
    tasks: [],
    places: [home],
    routes: [],
    travelOverrides: {},
    travelMoves: {},
  };
}

export const MODULE_COLORS = ['#6d5dfc', '#e0699f', '#3fa7a0', '#d08a2c', '#4b9be0', '#b35fd6', '#5fa83f', '#d65f5f'];
