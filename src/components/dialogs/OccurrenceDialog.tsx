// What you see when you click a block on the calendar.
import { useState } from 'react';
import { format } from 'date-fns';
import { useStore } from '../../store';
import type { ClassKind } from '../../types';
import {
  deleteOcc,
  resetOcc,
  setDetail,
  setSessionKind,
  setSessionLocation,
  setTaskOnCalendar,
  setTravel,
  skipOcc,
  toggleSessionDone,
  deleteSession,
  toggleTaskDone,
} from '../../lib/actions';
import { fmtDur, fmtTime } from '../../lib/time';
import { Field, LocationInput, Modal, Row, useModal, useUI } from '../ui';
import { kindOptions, locationSuggestions } from './shared';

export function OccurrenceDialog() {
  const { occ: o } = useModal('occ');
  const { open, close } = useUI();
  const data = useStore((s) => s.data);
  const src = o.source;

  const task = src.type === 'task' ? data.tasks.find((t) => t.id === src.taskId) : undefined;
  const session = src.type === 'task' ? task?.sessions.find((s) => s.id === src.sessionId) : undefined;
  const multiSession = !!task && (!!task.split || task.sessions.length > 1);
  const series = src.type === 'class' ? data.classes.find((c) => c.id === src.seriesId) : undefined;
  const isSession = src.type === 'class' || src.type === 'routine' || src.type === 'activity';
  const savedNotes =
    src.type === 'event' ? (data.events.find((e) => e.id === src.eventId)?.notes ?? '') : (task?.notes ?? '');
  const [detail, setDetailText] = useState(() =>
    src.type === 'event' || src.type === 'task' ? savedNotes : (o.detail ?? ''),
  );
  const usualPlace =
    src.type === 'class'
      ? (series?.location ?? '')
      : src.type === 'routine'
        ? (data.routines.find((r) => r.id === src.routineId)?.location ?? '')
        : src.type === 'activity'
          ? (data.activities.find((a) => a.id === src.activityId)?.location ?? '')
          : undefined;
  const [place, setPlace] = useState(o.location ?? '');
  const [travelMin, setTravelMin] = useState(src.type === 'travel' ? String(src.minutes) : '');

  const moved =
    (src.type === 'class' && !!series?.overrides[src.date]) ||
    (src.type === 'routine' && !!data.routines.find((r) => r.id === src.routineId)?.overrides[src.date]) ||
    (src.type === 'activity' && !!data.activities.find((a) => a.id === src.activityId)?.overrides[src.date]) ||
    (src.type === 'task' && !!session?.pinned);

  /** Run an action, then close. */
  const act = (fn: () => void) => () => {
    fn();
    close();
  };

  const editAll = () => {
    if (src.type === 'task') open({ kind: 'task', id: src.taskId });
    else if (src.type === 'event') open({ kind: 'event', id: src.eventId });
    else if (src.type === 'class') open({ kind: 'class', id: src.seriesId });
    else if (src.type === 'routine') open({ kind: 'routine', id: src.routineId });
    else if (src.type === 'activity') open({ kind: 'activity', id: src.activityId });
  };

  const lengthMin = Math.round((o.end.getTime() - o.start.getTime()) / 60000);

  return (
    <Modal title={o.title} onClose={close}>
      <p className="muted">
        {format(o.start, 'EEE d MMM')} · {fmtTime(o.start)}–{fmtTime(o.end)} ({fmtDur(lengthMin)})
        {o.subtitle && (
          <>
            <br />
            {o.subtitle}
          </>
        )}
        {o.location && (
          <>
            <br />
            at {o.location}
          </>
        )}
      </p>
      {o.warning && <p className="warn-box">⚠️ {o.warning}</p>}

      {src.type !== 'travel' && (
        <Field
          label={isSession ? 'Details for this session only' : 'Details'}
          hint={
            src.type === 'activity'
              ? 'e.g. Guest talk by …, Full team meeting'
              : src.type === 'class'
                ? 'e.g. Midterm review, bring laptop'
                : src.type === 'routine'
                  ? 'e.g. Dinner with Alex'
                  : undefined
          }
        >
          <div className="detail-row">
            <input
              value={detail}
              onChange={(e) => setDetailText(e.target.value)}
              placeholder="What's special about this one?"
              onKeyDown={(e) => {
                if (e.key === 'Enter') act(() => setDetail(o, detail))();
              }}
            />
            <button
              className="btn"
              disabled={detail === (o.detail ?? savedNotes)}
              onClick={act(() => setDetail(o, detail))}
            >
              Save
            </button>
          </div>
        </Field>
      )}

      {isSession && usualPlace !== undefined && (
        <Field
          label="Location for this session only"
          hint={usualPlace ? `Usually: ${usualPlace}. Clear it to go back to that.` : 'Usually no place set.'}
        >
          <div className="detail-row">
            <LocationInput value={place} onChange={setPlace} places={locationSuggestions(data)} />
            <button
              className="btn"
              disabled={place.trim() === (o.location ?? '')}
              onClick={act(() => setSessionLocation(o, place))}
            >
              Save
            </button>
          </div>
        </Field>
      )}

      {src.type === 'travel' && (
        <>
          <p>
            From <b>{src.from}</b> to <b>{src.to}</b>. Every trip is different, so you can change this one only.
          </p>
          <Row>
            <Field label="Minutes for this trip">
              <input
                type="text"
                inputMode="numeric"
                value={travelMin}
                onChange={(e) => setTravelMin(e.target.value.replace(/[^\d]/g, ''))}
              />
            </Field>
          </Row>
          <div className="actions">
            <button
              className="btn primary"
              onClick={act(() => setTravel(src.key, Math.max(0, Number(travelMin) || 0)))}
            >
              Save
            </button>
            {src.overridden && (
              <button className="btn" onClick={act(() => setTravel(src.key, null))}>
                Use saved route time
              </button>
            )}
            {src.moved && (
              <button className="btn" onClick={act(() => resetOcc(o))}>
                Back to usual leaving time
              </button>
            )}
          </div>
          <p className="muted small">
            Not going straight there? Drag this block on the calendar to leave earlier or later. To change the default
            for this route, go to Places.
          </p>
        </>
      )}

      {series && src.type === 'class' && (
        <Field label="This session is" hint="e.g. this week's lab is a quiz, or the lecture is a help session">
          <select
            value={series.kindOverrides?.[src.date] ?? series.kind}
            onChange={(e) => act(() => setSessionKind(o, e.target.value as ClassKind))()}
          >
            {kindOptions(series.kindOverrides?.[src.date] ?? series.kind).map((k) => (
              <option key={k} value={k}>
                {k}
                {k === series.kind ? ' (usual)' : ''}
              </option>
            ))}
          </select>
        </Field>
      )}

      {src.type !== 'travel' && (
        <div className="actions">
          {task && session && multiSession && (
            <button className="btn primary" onClick={act(() => toggleSessionDone(task.id, session.id))}>
              {session.done ? 'Session not done' : '✓ This session done'}
            </button>
          )}
          {task && (
            <button className={multiSession ? 'btn' : 'btn primary'} onClick={act(() => toggleTaskDone(task.id))}>
              {task.done ? 'Mark not done' : multiSession ? 'Whole task done' : '✓ Mark done'}
            </button>
          )}
          {(isSession || src.type === 'event') && (
            <button
              className="btn"
              title={
                o.skipped
                  ? 'Count it again when planning'
                  : 'Keep it on the calendar (faded) but let other things use this time'
              }
              onClick={act(() => skipOcc(o))}
            >
              {o.skipped ? 'Un-skip' : 'Skip this one'}
            </button>
          )}
          {task && session && multiSession && (
            <button
              className="btn danger"
              title={
                task.autoPlan === false
                  ? 'Remove just this session'
                  : 'Remove just this session (auto-schedule finds another time for it)'
              }
              onClick={act(() => deleteSession(task.id, session.id))}
            >
              Delete this session
            </button>
          )}
          <button
            className="btn danger"
            title="Remove it. Restore it from the Deleted tab."
            onClick={act(() => deleteOcc(o))}
          >
            {isSession ? 'Delete this one' : task && multiSession ? 'Delete whole task' : 'Delete'}
          </button>
          {moved && (
            <button className="btn" onClick={act(() => resetOcc(o))}>
              {src.type === 'task' ? 'Let auto-schedule move it' : 'Back to usual time'}
            </button>
          )}
          {task && (
            <button className="btn" onClick={act(() => setTaskOnCalendar(task.id, false))}>
              Remove from calendar
            </button>
          )}
          <button className="btn" onClick={editAll}>
            Edit{isSession ? ' all' : ''}…
          </button>
        </div>
      )}
      <p className="muted small">Tip: drag on the calendar to move, or drag the bottom edge to change the length.</p>
    </Modal>
  );
}
