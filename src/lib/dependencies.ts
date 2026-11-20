// Tasks that wait for others: "Milestone 3 depends on Milestone 2" means Milestone 3 isn't
// scheduled to start before every session of Milestone 2 has ended.
import type { Task } from '../types';
import { fromLocal } from './time';

/** The tasks `t` waits for: the ones it depends on that still exist and aren't done. */
export const blockersOf = (t: Task, tasks: Task[]): Task[] =>
  (t.dependsOn ?? []).map((id) => tasks.find((x) => x.id === id)).filter((x): x is Task => !!x && !x.done);

/** When `t` may start: once all of its unfinished dependencies' sessions have ended (null: no wait). */
export function readyAfter(t: Task, tasks: Task[]): Date | null {
  let after: Date | null = null;
  for (const b of blockersOf(t, tasks))
    for (const s of b.sessions) {
      const end = fromLocal(s.end);
      if (!after || end > after) after = end;
    }
  return after;
}

/** Does `t` depend on the task `id`, directly or through other tasks? */
export function dependsOn(t: Task, id: string, tasks: Task[], seen = new Set<string>()): boolean {
  for (const d of t.dependsOn ?? []) {
    if (d === id) return true;
    if (seen.has(d)) continue;
    seen.add(d);
    const next = tasks.find((x) => x.id === d);
    if (next && dependsOn(next, id, tasks, seen)) return true;
  }
  return false;
}

/**
 * The order to plan tasks in: by `cmp` (earliest deadline first), except that a task always
 * comes after the tasks it depends on. A loop (A needs B, B needs A) is broken by `cmp`.
 */
export function planOrder(tasks: Task[], cmp: (a: Task, b: Task) => number): Task[] {
  const left = [...tasks].sort(cmp);
  const ids = new Set(left.map((t) => t.id));
  const out: Task[] = [];
  const placed = new Set<string>();
  while (left.length) {
    const ready = (t: Task) => (t.dependsOn ?? []).every((d) => placed.has(d) || !ids.has(d));
    const i = Math.max(0, left.findIndex(ready));
    const [t] = left.splice(i, 1);
    out.push(t);
    placed.add(t.id);
  }
  return out;
}
