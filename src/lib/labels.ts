// Display names, colors and icons shared by the calendar, lists and dialogs.
import type { ClassKind, EventCategory } from '../types';

/** Default block colors by category (courses and CCAs use their own color). */
export const CATEGORY_COLORS: Record<string, string> = {
  hangout: '#e0699f',
  cca: '#5fa83f',
  admin: '#d08a2c',
  appointment: '#3fa7a0',
  other: '#7a8194',
  homework: '#6d5dfc',
  personal: '#4b9be0',
  travel: '#9aa3b5',
  exam: '#d65f5f',
  quiz: '#d65f5f',
  presentation: '#b35fd6',
  help: '#3fa7a0',
  meeting: '#4b9be0',
};

export const EVENT_LABELS: Record<EventCategory, string> = {
  hangout: 'Hangout / outing',
  cca: 'CCA / club / activity session',
  appointment: 'Appointment',
  admin: 'Admin',
  exam: 'Exam',
  quiz: 'Quiz',
  presentation: 'Presentation',
  help: 'Help session',
  meeting: 'Group meeting',
  other: 'Other',
};

/** Event types drawn with extra emphasis. */
export const ASSESSMENT_EVENTS: EventCategory[] = ['exam', 'quiz', 'presentation'];

/** Icons for events, shown on the calendar and in lists. */
export const EVENT_ICONS: Partial<Record<EventCategory, string>> = {
  exam: '📝',
  quiz: '📝',
  presentation: '🎤',
  help: '🙋',
  meeting: '👥',
  cca: '🧗',
};

/** Icons for a class session that's something special this week. */
export const KIND_ICONS: Partial<Record<ClassKind, string>> = {
  Quiz: '📝',
  Exam: '📝',
  Presentation: '🎤',
  'Help session': '🙋',
};

/** "📝 " or "" */
export const withIcon = (icon: string | undefined) => (icon ? `${icon} ` : '');

/** Swatches offered by the color picker. */
export const COLOR_PRESETS = [
  '#6d5dfc',
  '#4b9be0',
  '#3fa7c9',
  '#3fa7a0',
  '#3fa76a',
  '#5fa83f',
  '#e4a13a',
  '#d08a2c',
  '#d65f5f',
  '#e0699f',
  '#b35fd6',
  '#5a5f8a',
];
