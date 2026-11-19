# Kairos

A day planner built for ADHD brains: it fits classes, meals, travel and tasks around each other, and lets you move anything.

## Run it

```
npm install
npm run dev      # app at http://localhost:5173 + local database server on :5175
npm start        # build, then serve app + database at http://127.0.0.1:5175
npm test         # unit tests for weeks, travel, scheduler
```

Data lives in a SQLite database on this computer: `data/kairos.db` (git-ignored), using
Node's built-in SQLite (Node 22+). The server keeps an automatic backup at most once an hour
(restore from Places → Backup → Database backups). If the server isn't running, the app keeps
changes in the browser and saves them to the database when it's back.

## Where things live

| File | What |
|---|---|
| `src/types.ts` | Data model (semesters, modules, classes, routines, events, tasks, places, routes) |
| `src/lib/weeks.ts` | Week patterns (`3-13`, `odd`, `even 2-12`) and semester layouts (`1-6, Recess, 7-13, ...`) |
| `src/lib/expand.ts` | Turns data into calendar blocks; flexible routines slide around clashes; travel blocks |
| `src/lib/scheduler.ts` | Auto-scheduler for tasks (stable, earliest deadline first, rolls missed tasks forward) |
| `src/store.ts` | State with undo/redo (last 30 edits) |
| `src/lib/sync.ts` | Loads/saves the data via the local database; browser copy as offline fallback |
| `server/index.mjs` | Local database server (SQLite file + hourly backups), also serves the built app |
| `src/lib/nusmods.ts` | Import from a NUSMods share link |
| `src/components/` | Calendar, Now/Next card, panels, dialogs |

## Roadmap

- **v1 (done):** resizable/hideable sidebar; CCAs, clubs & activities, weekly (Robotics MWR 18:00–20:00) or booked session by session (Hoofers); Re-plan today / this week / all future / all time; special days (holidays, break weeks, finals) shown as tinted, striped columns with a label; skip a session (stays faded, others can use the time) or delete it (restore from the Deleted tab, which also holds deleted events, tasks, classes, routines and CCAs); tasks can sit under a course or a CCA/club/activity; exams, quizzes, presentations and help sessions (as events or by turning one class session into one); draggable travel blocks; one-way or two-way routes; semesters with real term dates (UW–Madison Fall 2026 default, NUS AY26/27 Sem 2 preset); courses with lectures/discussions/labs on week patterns, holidays and per-week skips; tasks under courses with deadlines, auto-scheduling (🗓 checkbox) and red ⚠️ when late; flexible routines (meals, shower, sleep, meal prep); hangouts and admin events; optional locations with travel blocks and per-trip edits; Now/Next card, running-late button; undo/redo (30); responsive web for computer and phone; JSON backup
- **v2:** cloud data (Supabase) so phone and laptop share data; one-way Google Calendar sync that updates automatically; native Android app (Capacitor); notifications ("leave in 10 min", "lunch now")
- **v3:** Android home-screen widgets; light/dark mode toggle in settings; settings to silence warnings, with separate toggles for daily routines, tasks, and travel; toggle whether travel blocks can be dragged; setting to hide special-day indicators (holidays, break and exam weeks); setting to hide location on event previews; custom color presets; optimizations (task splitting, smarter planning, performance)
- **v4:** gamification (streaks, points, rewards for finishing tasks and leaving on time)
