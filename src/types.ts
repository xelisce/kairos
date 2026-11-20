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

export type ClassKind =
  | 'Lecture'
  | 'Discussion'
  | 'Tutorial'
  | 'Lab'
  | 'Recitation'
  | 'Seminar'
  | 'Quiz'
  | 'Exam'
  | 'Presentation'
  | 'Help session'
  | 'Other';

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
  /** Skipped: still shown (faded), but other things can use that time. */
  skipDates: LocalDate[];
  /** Deleted: not shown at all (restore from Settings > Deleted). */
  deletedDates?: LocalDate[];
  /** Per-date moves, keyed by the original date. */
  overrides: Record<LocalDate, TimeOverride>;
  /** Per-date change of what the session is, e.g. this week's lab is a quiz. */
  kindOverrides: Record<LocalDate, ClassKind>;
  /** Per-date details, e.g. "Midterm review". */
  details?: Record<LocalDate, string>;
  /** Per-date place, e.g. a room change, or dinner out instead of at home. */
  locationOverrides?: Record<LocalDate, string>;
}

/**
 * CCA / club. Either repeats weekly with fixed times (Robotics MWR 18:00-20:00)
 * or is booked session by session (Hoofers): those sessions are CalEvents with activityId.
 */
export interface Activity {
  id: ID;
  title: string;
  /** false = no weekly pattern; add sessions one by one. For those, start/end are the usual session times. */
  recurring: boolean;
  days: number[];
  start: HHMM;
  end: HHMM;
  location?: string;
  color: string;
  /** Optional date range it runs in. */
  from?: LocalDate;
  until?: LocalDate;
  /** Skipped: still shown (faded), but other things can use that time. */
  skipDates: LocalDate[];
  /** Deleted: not shown at all (restore from Settings > Deleted). */
  deletedDates?: LocalDate[];
  overrides: Record<LocalDate, TimeOverride>;
  /** Per-date details, e.g. "Guest talk" or "Full team meeting". */
  details?: Record<LocalDate, string>;
  /** Per-date place, e.g. a room change, or dinner out instead of at home. */
  locationOverrides?: Record<LocalDate, string>;
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
  /** Skipped: still shown (faded), but other things can use that time. */
  skipDates: LocalDate[];
  /** Deleted: not shown at all (restore from Settings > Deleted). */
  deletedDates?: LocalDate[];
  /** Moved by hand on that day: pinned there, Re-plan leaves it alone until Reset. */
  overrides: Record<LocalDate, TimeOverride>;
  /** Length changed for that day only (minutes). Still auto-scheduled, keeps this length until Reset. */
  durationOverrides?: Record<LocalDate, number>;
  /** Per-date details, e.g. "Dinner with Alex". */
  details?: Record<LocalDate, string>;
  /** Per-date place, e.g. a room change, or dinner out instead of at home. */
  locationOverrides?: Record<LocalDate, string>;
}

export type EventCategory =
  'hangout' | 'cca' | 'admin' | 'appointment' | 'exam' | 'quiz' | 'presentation' | 'help' | 'meeting' | 'other';

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
  /** Link to a CCA / club (a booked session). */
  activityId?: ID;
  /** Skipped: still shown (faded), but other things can use that time. */
  skipped?: boolean;
}

export type TaskCategory = 'homework' | 'admin' | 'personal' | 'other';

/** One block of work on a task. */
export interface TaskSession {
  id: ID;
  start: LocalDateTime;
  end: LocalDateTime;
  done: boolean;
  /** You placed it, so the scheduler leaves it alone. */
  pinned: boolean;
}

/** How a task may be split into sessions. */
export interface TaskSplit {
  maxSessionMin: number;
  maxPerDayMin: number;
  /** Sessions shorter than this aren't made (except a last bit smaller than it). */
  minSessionMin: number;
}

/** Something to do that needs time: homework, bidding for modules, applications. */
export interface Task {
  id: ID;
  title: string;
  category: TaskCategory;
  /** Under a course... */
  moduleId?: ID;
  /** ...or under a CCA / club / activity (e.g. "Glaze pottery" under Pottery). */
  activityId?: ID;
  /** Total time it needs (all sessions together). */
  durationMin: number;
  /** Hard deadline: scheduling after this is flagged red. */
  deadline?: LocalDateTime;
  /** Don't schedule before this. */
  earliest?: LocalDateTime;
  /** The "on calendar" checkbox. When true, the scheduler finds time for it. */
  onCalendar: boolean;
  /** When you're working on it. One session unless `split` is set. */
  sessions: TaskSession[];
  /** Split into several sessions with these limits; unset = one session. */
  split?: TaskSplit;
  /** false: you add and place its sessions yourself; auto-schedule leaves it alone. */
  autoPlan?: boolean;
  /** The whole task is finished. */
  done: boolean;
  /** Set when a missed session got moved forward automatically. */
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
  /** No hours limit: tasks may go any time nothing else (sleep, classes...) is there. */
  anyTime?: boolean;
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
  /** 2 = skip/delete split (older data's skips were deletes). */
  version: number;
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
  /** Deleted events, tasks, classes, routines and CCAs, restorable from Settings > Deleted. */
  trash: TrashItem[];
  /** Trips and holidays: no tasks planned, classes, CCAs and routines hidden. */
  away: AwayRange[];
}

/** Time you're away (a trip, a holiday). */
export interface AwayRange {
  id: ID;
  title: string;
  start: LocalDateTime;
  end: LocalDateTime;
}

export type TrashItem =
  | { kind: 'event'; item: CalEvent; deletedAt: LocalDateTime }
  | { kind: 'task'; item: Task; deletedAt: LocalDateTime }
  | { kind: 'class'; item: ClassSeries; deletedAt: LocalDateTime }
  | { kind: 'routine'; item: Routine; deletedAt: LocalDateTime }
  | { kind: 'activity'; item: Activity; deletedAt: LocalDateTime };

// ---------- Derived (computed, never stored) ----------

export type OccSource =
  | { type: 'class'; seriesId: ID; date: LocalDate }
  | { type: 'routine'; routineId: ID; date: LocalDate }
  | { type: 'activity'; activityId: ID; date: LocalDate }
  | { type: 'event'; eventId: ID }
  | { type: 'task'; taskId: ID; sessionId: ID }
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
  /** What's special about this one, e.g. "Guest talk". Shown after the title. */
  detail?: string;
  /** Skipped: drawn faded behind everything, ignored when planning. */
  skipped?: boolean;
  /** A routine placed automatically (it can make room for a task by sliding in its window). */
  auto?: boolean;
}
