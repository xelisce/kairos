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
npm run apk      # build the Android app -> android/app/build/outputs/apk/debug/app-debug.apk
```

### Android app

The phone app is the same site wrapped by [Capacitor](https://capacitorjs.com) (`capacitor.config.json`,
`android/`). It signs in to the same account and saves to the cloud like the website. Building it needs
JDK 21 (Gradle finds it through `org.gradle.java.home` in `~/.gradle/gradle.properties`) and the Android
SDK (`android/local.properties` has `sdk.dir`, git-ignored). After changing the web code, `npm run apk`
builds the site, copies it into the Android project and builds a debug APK.

To install it, copy the APK to the phone and open it (allow installing from that app when asked), or
with USB debugging on: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. App icons
come from `assets/` (`npx capacitor-assets generate --android`).

Live at **https://kairos-xelisce.vercel.app**. Sign in (click the save badge at the top) and your data
is saved to your account, so every device shows the same calendar, and changes on one show on the
others within seconds. It also opens and saves offline, and catches up once you're back online.

Where data is saved:

- **Signed in:** in the cloud (Supabase), with an automatic backup at most once an hour.
- **Signed out, running on this computer:** in a SQLite database, `data/kairos.db` (git-ignored), also
  backed up hourly.
- **Signed out on the website:** only in that browser.

Restore backups from Settings → Backup → Automatic backups. The browser also keeps a copy, so the app
opens with your data even when nothing else can be reached.

### Cloud setup (once)

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. Copy `.env.example` to `.env.local` and fill in the URL and publishable key.
3. In Supabase → Authentication → URL Configuration, set the Site URL to the hosted address.

### Deploying

The site is hosted on Vercel, connected to this GitHub repo: every push to `main` updates the live
site, and other branches get preview links. The two `VITE_SUPABASE_*` settings are set in the Vercel
project.

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
| `src/lib/dependencies.ts` | Tasks that wait for others: what blocks a task, and the order to plan them        |
| `src/lib/away.ts`         | Time away: which hours are blocked                                                |
| `src/lib/travelPlans.ts`  | A trip's travel plans: kinds, sorting, calendar blocks, stretching the trip       |
| `src/lib/display.ts`      | Settings > Display (silenced warnings, swatches, special days...)                 |
| `src/lib/newDefaults.ts`  | What new tasks, events, routines and trips start with (Settings > New items)      |
| `src/lib/limits.ts`       | Upper limits on typed values (swatches, lengths, years)                           |
| `src/lib/theme.ts`        | Light / dark / same as device                                                     |
| `src/lib/taskline.ts`     | Data for the Taskline view (bars, dots, groups)                                   |
| `src/lib/time.ts`         | Local date/time helpers and dd/mm/yyyy parsing                                    |
| `src/lib/defaults.ts`     | A new user's starting data (routines, home, a semester)                           |
| `src/lib/scheduler.ts`    | Auto-scheduling tasks (stable, earliest deadline first, checks each day's layout) |
| `src/lib/actions.ts`      | Every edit the UI makes (move, skip, delete, re-plan, reset…)                     |
| `src/lib/weeks.ts`        | Week patterns (`3-13`, `odd`), semester layouts, presets, special days            |
| `src/lib/migrate.ts`      | Upgrading saved data from older versions                                          |
| `src/lib/sync.ts`         | Saving: to the cloud when signed in, else the local database; merges conflicts    |
| `src/lib/cloud.ts`        | Supabase: sign-in, loading/saving your data, backups, live updates                |
| `src/lib/merge.ts`        | Three-way merge when two windows or devices change the data at once               |
| `src/lib/storage.ts`      | localStorage that never throws                                                    |
| `src/lib/native.ts`       | Running inside the Android app: where data is kept, saving files via share sheet  |
| `supabase/schema.sql`     | Cloud tables, row security and the versioned save function                        |
| `public/sw.js`            | Offline support: keeps the app's files so it opens without a connection           |
| `src/lib/labels.ts`       | Colors, icons and names                                                           |
| `src/lib/nusmods.ts`      | Import from a NUSMods share link                                                  |
| `src/components/`         | `CalendarView`, `NowNext`, top-bar buttons, `ErrorBoundary`                       |
| `src/hooks/`              | Small React hooks (narrow screen, sidebar, undo shortcuts, saved prefs, clock)    |
| `src/components/dialogs/` | One file per dialog; `ModalHost` shows the open one                               |
| `src/components/panels/`  | Sidebar tabs (Tasks, Classes, Routines, Places, Settings with Deleted inside)     |
| `src/components/ui/`      | Shared building blocks (dialog frame, inputs, dd/mm/yyyy dates, dialog state)     |
| `server/index.mjs`        | Local database server (SQLite + hourly backups); also serves the built app        |
| `src/**/*.test.ts`        | Tests, next to the code they test (`src/test/fixtures.ts` has shared sample data) |

## Roadmap

- **v1 (done):** resizable/hideable sidebar; CCAs, clubs & activities, weekly (Robotics MWR 18:00–20:00) or booked session by session (Hoofers); Re-plan today / this week / all future / all time; special days (holidays, break weeks, finals) shown as tinted, striped columns with a label; skip a session (stays faded, others can use the time) or delete it (restore from the Deleted tab, which also holds deleted events, tasks, classes, routines and CCAs); tasks can sit under a course or a CCA/club/activity; exams, quizzes, presentations and help sessions (as events or by turning one class session into one); draggable travel blocks; one-way or two-way routes; semesters with real term dates (UW–Madison Fall 2026 default, NUS AY26/27 Sem 2 preset); courses with lectures/discussions/labs on week patterns, holidays and per-week skips; tasks under courses with deadlines, auto-scheduling (🗓 checkbox) and red ⚠️ when late; missed tasks roll forward 5h after they end (Re-plan moves them right away); flexible routines (meals, shower, sleep, meal prep); hangouts and admin events; optional locations with travel blocks and per-trip edits; Now/Next card, running-late button; undo/redo (30); responsive web for computer and phone; JSON backup
- **v2 (done):** task splitting + Taskline view (plus: skip one-off events, time away for trips, edits from two windows merged)
  - Task splitting: a task becomes several work sessions before its deadline. Defaults: sessions of at most 2h, at most 2h a day, none shorter than 30 min; done as early as possible. Each session can be dragged or ticked on its own; missed sessions roll forward 5h after they end (Re-plan right away)
  - Taskline: a left-to-right timeline for one semester, grouped by course (exams as ◆) or by time (due this week / next week / later). Each task is a bar from its start date ("not before", else the day it was added) to its deadline, with a dot per session (● planned, ✓ done, ○ missed, red after the deadline). Day/week zoom, today line, show-done toggle. Switch with 🗓 Calendar | 📊 Taskline at the top. Drag ◆ to move a deadline, drag a dot to move that session to another day, click a dot to open it
  - Tasks outside the semester (personal, admin, other) are hidden by default, with toggles to show each kind
  - Built so a semester's tasks, classes and events can later be exported as one unit (see v8)
- **v3 (done):** web app in the cloud (plus a proper phone layout: swipe the calendar for the next/previous day, pinch to zoom the Taskline, its settings in a ⚙ dialog): sign in and your data is saved to your account (Supabase), so every device sees the same calendar; hosted online so it opens in any browser, including your phone; live updates (a change on one device shows on the others within seconds); works offline and saves once you're back online
- **v4 (done):** settings: silence warnings, with separate toggles for daily routines, tasks and travel; whether travel blocks can be dragged; hide special-day indicators (holidays, break and exam weeks); hide locations on calendar blocks; your own color presets; how faded skipped sessions are; clearing a routine's place for one day leaves it with no place (a separate Reset brings back the usual one)
- **v5:** native Android app (Capacitor): the same app as an icon on your phone, signed in to the same account; installed straight from an APK (no Play Store needed)
- **v6:** notifications, scheduled a day or two ahead and updated whenever your calendar changes: "leave in 10 min" (travel), "lunch now" (routines), "session starting" (tasks); a toggle for each kind. In the Android app they're exact phone alarms (asks to allow exact alarms, which Android 14 blocks by default); on the website they come through the browser (web push, so they arrive even with the tab closed)
- **v7:** Android home-screen widgets; optimizations (smarter planning, performance); timezones: times are saved with their timezone, and the calendar shows them in the zone you're in, so moving between Madison and Singapore (or a flight across zones) doesn't shift anything. Includes a setting for your current timezone (or follow the device), daylight-saving changes handled everywhere (planner, travel, Taskline), and events booked in another zone shown at the right local time
- **v8:** a tutorial for every device: a short walkthrough the first time you open Kairos, made for where you are (the website on a phone, the website on a laptop, and the Android app), showing that device's own gestures and buttons (e.g. swipe for the next day and pinch the Taskline on a phone; drag, scroll-to-zoom and keyboard shortcuts on a laptop; notifications and widgets in the app). Can be replayed any time from settings
- **v9:** gamification (streaks, points, rewards for finishing tasks and leaving on time); export a finished semester (its courses, classes, tasks and events) to a file and take it off the calendar and timeline, with import to bring it back; title autocomplete for events and tasks: as you type, a faded suggestion from your past titles appears and Tab accepts it (like code completion in VS Code)
- **v10:** schedule import scripts: custom scripts that fetch timings from a website (e.g. Sub Zero ice rink "Public Skate" sessions) and add them as events. Shows a list of found timings to approve before anything is added; only future timings; you choose how far ahead (next 1 week, 2 weeks, 1 month, 2 months, 6 months…); flight lookup: type a flight number and date in a trip's travel plans (e.g. UA 1234 on 24 Nov) and Kairos fills in the departure and arrival times, airports and terminals from a flight-data service, for you to check before saving; themes: pick a whole look for the app (colors, fonts, how blocks are drawn) from a few built-in themes, or make your own; fonts as part of a theme: choose the app's font (a few built-in ones, or any Google Font) and text size, separately for headings, calendar blocks and body text
- **v11:** one-way Google Calendar sync that updates automatically: pick which Google calendars to bring in; their events show read-only in Kairos and count as busy time for the planner
