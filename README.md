# Kairos

A day planner built for ADHD brains: it fits classes, meals, travel and tasks around each other, and lets you move anything.

## Run it

Needs Node 22+ (for the built-in SQLite).

```
npm install
npm run dev      # app at http://localhost:5173 + local database server on :5175
npm start        # build, then serve app + database at http://127.0.0.1:5175
npm run check    # type-check, lint and test
npm test         # tests only
npm run format   # Prettier
```

Data lives in a SQLite database on this computer: `data/kairos.db` (git-ignored). The server keeps
an automatic backup at most once an hour (restore from Places → Backup → Database backups). If the
server isn't running, the app keeps changes in the browser and saves them to the database when it's back.

## How it fits together

Everything you enter is one `AppData` object (`src/types.ts`). Edits go through `store.commit`, which
records an undo step and re-runs the task scheduler. The calendar never stores blocks: `expand()` works
them out for whatever range is on screen (classes by academic week, CCAs, events, tasks, routines fitted
into their windows, then trips between places).

| Path                      | What                                                                              |
| ------------------------- | --------------------------------------------------------------------------------- |
| `src/types.ts`            | Data model                                                                        |
| `src/store.ts`            | State, undo/redo (30 steps), browser fallback copy                                |
| `src/lib/expand.ts`       | Data → calendar blocks for a date range                                           |
| `src/lib/routines.ts`     | Fitting meals, shower… into their windows                                         |
| `src/lib/travel.ts`       | Trips between places                                                              |
| `src/lib/places.ts`       | Matching a location to a saved place (names, aliases), route times, renaming      |
| `src/lib/tasks.ts`        | Task sessions, progress and split limits                                          |
| `src/lib/scheduler.ts`    | Auto-scheduling tasks (stable, earliest deadline first, checks each day's layout) |
| `src/lib/actions.ts`      | Every edit the UI makes (move, skip, delete, re-plan, reset…)                     |
| `src/lib/weeks.ts`        | Week patterns (`3-13`, `odd`), semester layouts, presets, special days            |
| `src/lib/migrate.ts`      | Upgrading saved data from older versions                                          |
| `src/lib/sync.ts`         | Loading/saving through the local database                                         |
| `src/lib/labels.ts`       | Colors, icons and names                                                           |
| `src/lib/nusmods.ts`      | Import from a NUSMods share link                                                  |
| `src/components/`         | `CalendarView`, `NowNext`, top-bar buttons                                        |
| `src/components/dialogs/` | One file per dialog; `ModalHost` shows the open one                               |
| `src/components/panels/`  | Sidebar tabs (Tasks, Classes, Routines, Places, Deleted)                          |
| `src/components/ui/`      | Shared building blocks (dialog frame, inputs, dd/mm/yyyy dates, dialog state)     |
| `server/index.mjs`        | Local database server (SQLite + hourly backups); also serves the built app        |
| `src/**/*.test.ts`        | Tests, next to the code they test (`src/test/fixtures.ts` has shared sample data) |

## Roadmap

- **v1 (done):** resizable/hideable sidebar; CCAs, clubs & activities, weekly (Robotics MWR 18:00–20:00) or booked session by session (Hoofers); Re-plan today / this week / all future / all time; special days (holidays, break weeks, finals) shown as tinted, striped columns with a label; skip a session (stays faded, others can use the time) or delete it (restore from the Deleted tab, which also holds deleted events, tasks, classes, routines and CCAs); tasks can sit under a course or a CCA/club/activity; exams, quizzes, presentations and help sessions (as events or by turning one class session into one); draggable travel blocks; one-way or two-way routes; semesters with real term dates (UW–Madison Fall 2026 default, NUS AY26/27 Sem 2 preset); courses with lectures/discussions/labs on week patterns, holidays and per-week skips; tasks under courses with deadlines, auto-scheduling (🗓 checkbox) and red ⚠️ when late; missed tasks roll forward 5h after they end (Re-plan moves them right away); flexible routines (meals, shower, sleep, meal prep); hangouts and admin events; optional locations with travel blocks and per-trip edits; Now/Next card, running-late button; undo/redo (30); responsive web for computer and phone; JSON backup
- **v2 (done):** task splitting + Taskline view (plus: skip one-off events, time away for trips, edits from two windows merged)
  - Task splitting: a task becomes several work sessions before its deadline. Defaults: sessions of at most 2h, at most 2h a day, none shorter than 30 min; done as early as possible. Each session can be dragged or ticked on its own; missed sessions roll forward 5h after they end (Re-plan right away)
  - Taskline: a left-to-right timeline for one semester, grouped by course (exams as ◆) or by time (due this week / next week / later). Each task is a bar from its start date ("not before", else the day it was added) to its deadline, with a dot per session (● planned, ✓ done, ○ missed, red after the deadline). Day/week zoom, today line, show-done toggle. Switch with 🗓 Calendar | 📊 Taskline at the top. Drag ◆ to move a deadline, drag a dot to move that session to another day, click a dot to open it
  - Tasks outside the semester (personal, admin, other) are hidden by default, with toggles to show each kind
  - Built so a semester's tasks, classes and events can later be exported as one unit (see v5)
- **v3:** cloud data (Supabase) so phone and laptop share data; one-way Google Calendar sync that updates automatically; native Android app (Capacitor); notifications ("leave in 10 min", "lunch now")
- **v4:** Android home-screen widgets; light/dark mode toggle in settings; settings to silence warnings, with separate toggles for daily routines, tasks, and travel; toggle whether travel blocks can be dragged; setting to hide special-day indicators (holidays, break and exam weeks); setting to hide location on event previews; custom color presets; setting for how faded skipped sessions are; optimizations (smarter planning, performance)
- **v5:** gamification (streaks, points, rewards for finishing tasks and leaving on time); export a finished semester (its courses, classes, tasks and events) to a file and take it off the calendar and timeline, with import to bring it back; title autocomplete for events and tasks: as you type, a faded suggestion from your past titles appears and Tab accepts it (like code completion in VS Code)
- **v6:** schedule import scripts: custom scripts that fetch timings from a website (e.g. Sub Zero ice rink "Public Skate" sessions) and add them as events. Shows a list of found timings to approve before anything is added; only future timings; you choose how far ahead (next 1 week, 2 weeks, 1 month, 2 months, 6 months…); themes: pick a whole look for the app (colors, fonts, how blocks are drawn) from a few built-in themes, or make your own; fonts as part of a theme: choose the app's font (a few built-in ones, or any Google Font) and text size, separately for headings, calendar blocks and body text
