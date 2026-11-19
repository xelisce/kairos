// Core data model for Kairos. Everything the user edits lives in AppData,
// which is what undo/redo snapshots and what gets persisted.

export type ID = string;

/** Local wall-clock datetime, e.g. "2026-11-19T13:30" (no timezone). */
export type LocalDateTime = string;
/** Local date, e.g. "2026-11-19". */
export type LocalDate = string;
/** Time of day, e.g. "13:30". */
export type HHMM = string;

/** One calendar week of a semester: either a numbered teaching week or a named break. */
export type WeekLabel = { type: 'teaching'; n: number } | { type: 'break'; name: string };

/** 'nus': odd/even week classes, one day per lesson. 'us': MWF/TR style, every week. */
export type SemesterStyle = 'nus' | 'us';

export interface Semester {
  id: ID;
  name: string;
  style: SemesterStyle;
  /** Monday of the first week in `layout`. */
  startDate: LocalDate;
  /** Calendar weeks in order, starting at startDate. */
  layout: WeekLabel[];
  /** Single days with no classes (public holidays etc). */
  holidays: { date: LocalDate; name: string }[];
}

export interface Module {
  id: ID;
  semesterId: ID;
  code: string;
  name: string;
  color: string;
}

export type ClassKind = 'Lecture' | 'Discussion' | 'Tutorial' | 'Lab' | 'Recitation' | 'Seminar' | 'Quiz' | 'Exam' | 'Presentation' | 'Help session' | 'Other';

/** Kinds that count as assessments (shown with emphasis). */
export const ASSESSMENT_KINDS: ClassKind[] = ['Quiz', 'Exam', 'Presentation'];

/** A moved single occurrence. */
export interface TimeOverride {
  start: LocalDateTime;
  end: LocalDateTime;
}

export interface ClassSeries {
  id: ID;
  moduleId: ID;
  kind: ClassKind;
  /** Days it meets, 0 = Monday ... 6 = Sunday (e.g. MWF = [0, 2, 4]). */
  days: number[];
  start: HHMM;
  end: HHMM;
  /** Teaching week numbers this class runs in. */
  weeks: number[];
  location?: string;
  /** Dates where this class is cancelled. */
  skipDates: LocalDate[];
  /** Per-date moves, keyed by the original date. */
  overrides: Record<LocalDate, TimeOverride>;
  /** Per-date change of what the session is, e.g. this week's lab is a quiz. */
  kindOverrides: Record<LocalDate, ClassKind>;
}

/** CCA / club / recurring commitment with fixed times, e.g. Robotics MWR 18:00-20:00. */
export interface Activity {
  id: ID;
  title: string;
  days: number[];
  start: HHMM;
  end: HHMM;
  location?: string;
  color: string;
  /** Optional date range it runs in. */
  from?: LocalDate;
  until?: LocalDate;
  skipDates: LocalDate[];
  overrides: Record<LocalDate, TimeOverride>;
}

export type RoutineCategory = 'meal' | 'hygiene' | 'sleep' | 'chores' | 'exercise' | 'other';

/** Recurring daily block like lunch, dinner, shower, sleep, meal prep. */
export interface Routine {
  id: ID;
  title: string;
  category: RoutineCategory;
  enabled: boolean;
  /** Weekdays it applies to (0 = Mon). */
  days: number[];
  durationMin: number;
  preferredStart: HHMM;
  /** Flexible routines slide inside [windowStart, windowEnd] to dodge clashes. */
  flexible: boolean;
  windowStart: HHMM;
  windowEnd: HHMM;
  location?: string;
  color: string;
  skipDates: LocalDate[];
  overrides: Record<LocalDate, TimeOverride>;
}

export type EventCategory = 'hangout' | 'admin' | 'appointment' | 'exam' | 'quiz' | 'presentation' | 'help' | 'other';

/** One-off fixed-time thing: hangout, appointment, admin slot. */
export interface CalEvent {
  id: ID;
  title: string;
  category: EventCategory;
  start: LocalDateTime;
  end: LocalDateTime;
  location?: string;
  notes?: string;
  /** Link to a course (exams, quizzes, presentations, help sessions). */
  moduleId?: ID;
}

export type TaskCategory = 'homework' | 'admin' | 'personal' | 'other';

/** Something to do that needs a slot: homework, bidding for modules, applications. */
export interface Task {
  id: ID;
  title: string;
  category: TaskCategory;
  moduleId?: ID;
  durationMin: number;
  /** Hard deadline: scheduling after this is flagged red. */
  deadline?: LocalDateTime;
  /** Don't schedule before this. */
  earliest?: LocalDateTime;
  /** The "on calendar" checkbox. When true, the scheduler finds it a slot. */
  onCalendar: boolean;
  scheduled?: TimeOverride;
  /** User dragged it, so the scheduler leaves it alone. */
  pinned: boolean;
  done: boolean;
  /** Set when a missed task got moved forward automatically. */
  rolledForward?: boolean;
  location?: string;
  notes?: string;
  createdAt: LocalDateTime;
}

export interface Place {
  id: ID;
  name: string;
  isHome?: boolean;
  /** Extra names that map to this place, e.g. "COM1", "SoC". */
  aliases: string[];
}

/** Saved travel time between two places (symmetric). */
export interface Route {
  id: ID;
  a: ID;
  b: ID;
  minutes: number;
  /** Same time both ways (default). When false, only a -> b. */
  bidirectional: boolean;
}

export interface Settings {
  /** Hours the scheduler may place tasks in. */
  dayStart: HHMM;
  dayEnd: HHMM;
  /** Gap kept between scheduled things. */
  bufferMin: number;
  /** Extra minutes added to every trip (get out of the door, find the room). */
  travelBufferMin: number;
  /** Used when no saved route exists between two places. */
  defaultTravelMin: number;
  /** How far ahead the scheduler looks for slots. */
  horizonDays: number;
  /** Warn for unscheduled tasks due within this many hours. */
  warnHours: number;
}

export interface AppData {
  version: 1;
  settings: Settings;
  semesters: Semester[];
  modules: Module[];
  classes: ClassSeries[];
  activities: Activity[];
  routines: Routine[];
  events: CalEvent[];
  tasks: Task[];
  places: Place[];
  routes: Route[];
  /** Per-trip travel minute overrides, keyed by travel occurrence key. */
  travelOverrides: Record<string, number>;
  /** Travel blocks dragged to a different start time, keyed by travel key. */
  travelMoves: Record<string, LocalDateTime>;
}

// ---------- Derived (computed, never stored) ----------

export type OccSource =
  | { type: 'class'; seriesId: ID; date: LocalDate }
  | { type: 'routine'; routineId: ID; date: LocalDate }
  | { type: 'activity'; activityId: ID; date: LocalDate }
  | { type: 'event'; eventId: ID }
  | { type: 'task'; taskId: ID }
  | { type: 'travel'; key: string; minutes: number; from: string; to: string; overridden: boolean; moved: boolean };

export interface Occ {
  id: string;
  source: OccSource;
  title: string;
  subtitle?: string;
  start: Date;
  end: Date;
  location?: string;
  color: string;
  /** Can the user drag it? */
  movable: boolean;
  /** Red + warning icon with this message. */
  warning?: string;
  /** Exam / quiz / presentation: drawn with extra emphasis. */
  assessment?: boolean;
}
