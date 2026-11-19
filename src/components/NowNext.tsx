import { useEffect, useMemo, useState } from 'react';
import { addDays, differenceInMinutes, startOfDay } from 'date-fns';
import { useStore } from '../store';
import { expand } from '../lib/expand';
import { runningLate } from '../lib/actions';
import { fmtDur, fmtTime } from '../lib/time';
import { useUI } from './ui';
import type { Occ } from '../types';

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** "Now / Next" card: what you're doing, what's next, when to leave. */
export function NowNext() {
  const data = useStore((s) => s.data);
  const open = useUI((s) => s.open);
  const now = useNow();
  const occs = useMemo(
    () => expand(data, startOfDay(now), addDays(startOfDay(now), 2)).sort((a, b) => a.start.getTime() - b.start.getTime()),
    [data, now],
  );
  const current = occs.filter((o) => o.start <= now && o.end > now);
  const cur = current.find((o) => o.source.type === 'travel') ?? current.find((o) => o.source.type !== 'routine') ?? current[0];
  const upcoming = occs.filter((o) => o.start > now);
  const next = upcoming[0];
  const leave = upcoming.find((o) => o.source.type === 'travel' && differenceInMinutes(o.start, now) <= 180);

  return (
    <section className="nownext" aria-label="Now and next">
      <Card label="Now" occ={cur} now={now} onClick={(o) => open({ kind: 'occ', occ: o })} empty="Free time" />
      <Card label="Next" occ={next} now={now} onClick={(o) => open({ kind: 'occ', occ: o })} empty="Nothing else planned" />
      {leave && (
        <div className={`leave ${differenceInMinutes(leave.start, now) <= 10 ? 'urgent' : ''}`}>
          <span className="leave-big">Leave in {fmtDur(Math.max(0, differenceInMinutes(leave.start, now)))}</span>
          <span className="leave-small">at {fmtTime(leave.start)} → {leave.source.type === 'travel' ? leave.source.to : ''}</span>
        </div>
      )}
      <div className="late">
        <span>Running late?</span>
        {[5, 15, 30].map((m) => (
          <button key={m} className="chip" onClick={() => runningLate(occs, m, now)} title={`Push today's meals and tasks back ${m} minutes`}>+{m}m</button>
        ))}
      </div>
    </section>
  );
}

function Card({ label, occ, now, onClick, empty }: { label: string; occ?: Occ; now: Date; onClick: (o: Occ) => void; empty: string }) {
  if (!occ) return <div className="nn-card empty"><span className="nn-label">{label}</span><span className="nn-title">{empty}</span></div>;
  const startsIn = differenceInMinutes(occ.start, now);
  const endsIn = differenceInMinutes(occ.end, now);
  return (
    <button className={`nn-card ${occ.warning ? 'warn' : ''}`} style={{ borderLeftColor: occ.color }} onClick={() => onClick(occ)}>
      <span className="nn-label">{label}</span>
      <span className="nn-title">{occ.warning && '⚠️ '}{occ.title}</span>
      <span className="nn-meta">
        {fmtTime(occ.start)}–{fmtTime(occ.end)} · {startsIn > 0 ? `in ${fmtDur(startsIn)}` : `${fmtDur(endsIn)} left`}
      </span>
    </button>
  );
}
