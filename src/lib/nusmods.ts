// Import a NUSMods share link into a semester.
// Link format: https://nusmods.com/timetable/sem-2/share?CS2040S=LEC:1,TUT:05&GEA1000=TUT:D17
import type { ClassKind, ClassSeries, Module, Semester } from '../types';
import { uid } from './time';
import { MODULE_COLORS } from './defaults';

const ABBR: Record<string, string> = {
  LEC: 'Lecture', TUT: 'Tutorial', TUT2: 'Tutorial Type 2', TUT3: 'Tutorial Type 3', LAB: 'Laboratory', REC: 'Recitation',
  SEC: 'Sectional Teaching', SEM: 'Seminar-Style Module Class', DLEC: 'Design Lecture', PLEC: 'Packaged Lecture',
  PTUT: 'Packaged Tutorial', PLAB: 'Packaged Laboratory', WS: 'Workshop', MINI: 'Mini-Project',
};
const DAYS: Record<string, number> = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };

const kindOf = (lessonType: string): ClassKind => {
  if (/lecture/i.test(lessonType)) return 'Lecture';
  if (/tutorial|sectional/i.test(lessonType)) return 'Tutorial';
  if (/lab/i.test(lessonType)) return 'Lab';
  if (/recitation/i.test(lessonType)) return 'Recitation';
  if (/seminar|workshop/i.test(lessonType)) return 'Seminar';
  return 'Other';
};
const hhmm = (s: string) => `${s.slice(0, 2)}:${s.slice(2, 4)}`;

interface NmLesson { classNo: string; lessonType: string; day: string; startTime: string; endTime: string; venue: string; weeks: number[] | unknown }

/** "AY26/27" style year for a semester start date: Aug+ starts a new year. */
function acadYear(sem: Semester): string {
  const [y, m] = sem.startDate.split('-').map(Number);
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export async function importNusmods(link: string, sem: Semester, colorOffset: number) {
  const url = new URL(link.trim());
  const semMatch = url.pathname.match(/sem-(\d)|st-(i+)/);
  const semNo = semMatch?.[1] ? Number(semMatch[1]) : semMatch?.[2] ? 2 + semMatch[2].length : NaN;
  if (!semNo) throw new Error('Link should look like nusmods.com/timetable/sem-1/share?...');
  const ay = acadYear(sem);
  const modules: Module[] = [];
  const classes: ClassSeries[] = [];
  const warnings: string[] = [];

  let i = 0;
  for (const [code, sel] of url.searchParams) {
    if (!/^[A-Z]{2,4}\d{4}[A-Z]*$/i.test(code)) continue;
    const res = await fetch(`https://api.nusmods.com/v2/${ay}/modules/${code.toUpperCase()}.json`);
    if (!res.ok) { warnings.push(`${code}: not found for ${ay}.`); continue; }
    const json = await res.json();
    const sd = (json.semesterData as { semester: number; timetable: NmLesson[] }[]).find((s) => s.semester === semNo);
    if (!sd) { warnings.push(`${code}: no timetable for that semester.`); continue; }
    const mod: Module = { id: uid(), semesterId: sem.id, code: json.moduleCode, name: json.title, color: MODULE_COLORS[(colorOffset + i++) % MODULE_COLORS.length] };
    modules.push(mod);
    for (const part of sel.split(/[,;]/)) {
      const [abbr, rawNo] = part.split(':');
      if (!abbr || rawNo === undefined) continue;
      const type = ABBR[abbr.toUpperCase()] ?? abbr;
      let lessons: NmLesson[];
      const idx = rawNo.match(/^\((\d+)\)$/);
      if (idx) {
        const l = sd.timetable[Number(idx[1])];
        lessons = l ? sd.timetable.filter((x) => x.lessonType === l.lessonType && x.classNo === l.classNo) : [];
      } else {
        lessons = sd.timetable.filter((x) => x.lessonType === type && x.classNo === rawNo);
      }
      if (!lessons.length) { warnings.push(`${code} ${abbr}:${rawNo} not found.`); continue; }
      for (const l of lessons) {
        if (!Array.isArray(l.weeks)) { warnings.push(`${code} ${l.lessonType}: unusual week format, add it by hand.`); continue; }
        classes.push({
          id: uid(), moduleId: mod.id, kind: kindOf(l.lessonType), days: [DAYS[l.day] ?? 0],
          start: hhmm(l.startTime), end: hhmm(l.endTime), weeks: l.weeks as number[],
          location: l.venue || undefined, skipDates: [], overrides: {},
        });
      }
    }
  }
  if (!modules.length && !warnings.length) throw new Error('No modules found in that link.');
  return { modules, classes, warnings };
}
