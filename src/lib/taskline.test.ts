import { describe, expect, it } from 'vitest';
import { currentSemester, tasklineGroups, type TasklineOpts } from './taskline';
import { fromLocal } from './time';
import { sampleData, session, task } from '../test/fixtures';

const opts = (over: Partial<TasklineOpts> = {}): TasklineOpts => ({
  groupBy: 'course',
  showDone: false,
  extras: [],
  ...over,
});
const now = fromLocal('2026-09-02T12:00');

const data = () => {
  const d = sampleData();
  d.tasks = [
    task({
      id: 'hw',
      moduleId: 'm',
      earliest: '2026-08-31T09:00',
      deadline: '2026-09-04T23:59',
      sessions: [
        session('a', '2026-09-01T09:00', '2026-09-01T10:00', { done: true }),
        session('b', '2026-09-01T14:00', '2026-09-01T15:00'),
        session('c', '2026-09-05T09:00', '2026-09-05T10:00'),
      ],
    }),
    task({ id: 'gym', category: 'personal', deadline: '2026-09-10T23:59' }),
    task({ id: 'old', moduleId: 'm', done: true, deadline: '2026-09-01T23:59' }),
  ];
  d.events = [
    {
      id: 'mid',
      title: 'Midterm',
      category: 'exam',
      moduleId: 'm',
      start: '2026-10-07T10:00',
      end: '2026-10-07T12:00',
    },
  ];
  return d;
};

describe('taskline', () => {
  it('groups by course with exams as markers, one dot per session', () => {
    const d = data();
    const [cs1] = tasklineGroups(d, d.semesters[0], opts(), now);
    expect(cs1.title).toBe('CS1');
    expect(cs1.markers.map((m) => m.title)).toEqual(['Midterm']);
    const [bar] = cs1.bars;
    expect(bar.task.id).toBe('hw');
    expect(bar.dots.map((x) => [x.state, x.late])).toEqual([
      ['done', false],
      ['missed', false],
      ['planned', true],
    ]);
    // The bar runs from "not before" to past the late session.
    expect(bar.from).toEqual(fromLocal('2026-08-31'));
    expect(bar.to).toEqual(fromLocal('2026-09-05T10:00'));
  });

  it('personal/admin/other tasks and done tasks only show when you ask', () => {
    const d = data();
    const ids = (o: TasklineOpts) =>
      tasklineGroups(d, d.semesters[0], o, now).flatMap((g) => g.bars.map((b) => b.task.id));
    expect(ids(opts())).toEqual(['hw']);
    expect(ids(opts({ extras: ['personal'], showDone: true }))).toEqual(['old', 'hw', 'gym']);
  });

  it('groups by time: due this week, next week…', () => {
    const d = data();
    const groups = tasklineGroups(d, d.semesters[0], opts({ groupBy: 'time', extras: ['personal'] }), now);
    expect(groups.map((g) => [g.title, g.bars.map((b) => b.task.id)])).toEqual([
      ['Due this week', ['hw']],
      ['Due next week', ['gym']],
    ]);
  });

  it('picks the semester you are in', () => {
    expect(currentSemester(data(), now)?.id).toBe('s');
  });
});
