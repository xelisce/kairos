import { useState } from 'react';
import { useStore } from '../../store';
import type { Place } from '../../types';
import { nameTaken, renamePlace } from '../../lib/places';
import { uid } from '../../lib/time';
import { Field, NumberInput, Row } from '../ui';
import { MAX_BLOCK_MIN, MAX_TEXT } from '../../lib/limits';

/** Places (with aliases) and usual travel times. */
export function PlacesPanel() {
  return (
    <div className="panel">
      <PlacesSection />
      <RoutesSection />
    </div>
  );
}

function PlacesSection() {
  const places = useStore((s) => s.data.places);
  const commit = useStore((s) => s.commit);
  const [name, setName] = useState('');
  const taken = nameTaken(places, name);

  const add = () => {
    const n = name.trim();
    if (!n || taken) return;
    commit(`Add ${n}`, (d) => {
      d.places.push({ id: uid(), name: n, aliases: [] });
    });
    setName('');
  };
  const setAliases = (p: Place, text: string) => {
    const aliases = text
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (aliases.join(',') === p.aliases.join(',')) return;
    commit(`Aliases for ${p.name}`, (d) => {
      const x = d.places.find((y) => y.id === p.id);
      if (x) x.aliases = aliases;
    });
  };
  const remove = (p: Place) =>
    commit(`Delete ${p.name}`, (d) => {
      d.places = d.places.filter((x) => x.id !== p.id);
      d.routes = d.routes.filter((r) => r.a !== p.id && r.b !== p.id);
    });

  return (
    <>
      <h3>Places</h3>
      <p className="muted small">
        If a location contains a place name or alias as a word (e.g. “107 BPB” contains “BPB”), Kairos adds travel time
        automatically. Unknown places use the default estimate.
      </p>
      <ul className="places">
        {places.map((p) => (
          <li key={p.id}>
            <PlaceName
              name={p.name}
              home={!!p.isHome}
              onRename={(n) =>
                nameTaken(places, n, p.id)
                  ? alert(`There's already a place called “${n}”.`)
                  : commit(`Rename ${p.name} → ${n}`, (d) => renamePlace(d, p.id, n))
              }
            />
            <input
              // Re-made when the aliases change (undo, another device), so the box shows them.
              key={p.aliases.join(',')}
              className="alias"
              defaultValue={p.aliases.join(', ')}
              placeholder="aliases, comma separated"
              onBlur={(e) => setAliases(p, e.target.value)}
            />
            {!p.isHome && (
              <button className="icon-btn" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="quick">
        <input
          maxLength={MAX_TEXT}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New place (e.g. COM1, CS building)"
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn" disabled={!name.trim() || taken} onClick={add}>
          Add
        </button>
      </div>
      {taken && <p className="muted small">There's already a place called “{name.trim()}”.</p>}
    </>
  );
}

/** Double-click (or Enter on focus) to rename; Enter/blur saves, Escape cancels. */
function PlaceName({ name, home, onRename }: { name: string; home: boolean; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);
  const startEditing = () => {
    setText(name);
    setEditing(true);
  };
  const finish = (save: boolean) => {
    setEditing(false);
    const v = text.trim();
    if (save && v && v !== name) onRename(v);
    else setText(name);
  };
  if (editing) {
    return (
      <input
        className="place-edit"
        autoFocus
        maxLength={MAX_TEXT}
        value={text}
        aria-label="Place name"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true);
          if (e.key === 'Escape') {
            e.stopPropagation();
            finish(false);
          }
        }}
      />
    );
  }
  return (
    <b
      className="place-name"
      tabIndex={0}
      title="Double-click to rename"
      onDoubleClick={startEditing}
      onKeyDown={(e) => e.key === 'Enter' && startEditing()}
    >
      {home ? '🏠 ' : ''}
      {name}
    </b>
  );
}

const EMPTY_ROUTE = { a: '', b: '', minutes: '20', both: true };

function RoutesSection() {
  const places = useStore((s) => s.data.places);
  const routes = useStore((s) => s.data.routes);
  const commit = useStore((s) => s.commit);
  const [route, setRoute] = useState(EMPTY_ROUTE);
  const placeName = (id: string) => places.find((p) => p.id === id)?.name ?? '?';
  const canSave = !!route.a && !!route.b && route.a !== route.b;

  const save = () => {
    if (!canSave) return;
    commit(`Route ${placeName(route.a)}${route.both ? '↔' : '→'}${placeName(route.b)}`, (d) => {
      // Replace the same route (and its reverse, if this one is two-way).
      d.routes = d.routes.filter(
        (r) => !((r.a === route.a && r.b === route.b) || (route.both && r.a === route.b && r.b === route.a)),
      );
      d.routes.push({
        id: uid(),
        a: route.a,
        b: route.b,
        minutes: Math.max(0, Number(route.minutes) || 0),
        bidirectional: route.both,
      });
    });
    setRoute(EMPTY_ROUTE);
  };
  const editRoute = (id: string, label: string, change: (r: (typeof routes)[number]) => void) =>
    commit(label, (d) => {
      const r = d.routes.find((x) => x.id === id);
      if (r) change(r);
    });

  const placeSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">…</option>
      {places.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <h3>Usual travel times</h3>
      <ul className="routes">
        {routes.map((r) => {
          const label = `${placeName(r.a)}–${placeName(r.b)}`;
          return (
            <li key={r.id}>
              <span className="route-name">
                {placeName(r.a)} {r.bidirectional !== false ? '↔' : '→'} {placeName(r.b)}
              </span>
              <NumberInput
                className="mins"
                max={MAX_BLOCK_MIN}
                value={r.minutes}
                aria-label="Minutes"
                onCommit={(v) => editRoute(r.id, `Route ${label} ${v}m`, (x) => (x.minutes = v))}
              />{' '}
              min
              <label className="check small" title="Same time both ways">
                <input
                  type="checkbox"
                  checked={r.bidirectional !== false}
                  onChange={(e) =>
                    editRoute(r.id, `${label} ${e.target.checked ? 'both ways' : 'one way'}`, (x) => {
                      x.bidirectional = e.target.checked;
                    })
                  }
                />{' '}
                both ways
              </label>
              <button
                className="icon-btn"
                aria-label="Delete route"
                onClick={() =>
                  commit('Delete route', (d) => {
                    d.routes = d.routes.filter((x) => x.id !== r.id);
                  })
                }
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <Row>
        <Field label="From">{placeSelect(route.a, (a) => setRoute({ ...route, a }))}</Field>
        <Field label="To">{placeSelect(route.b, (b) => setRoute({ ...route, b }))}</Field>
        <Field label="Min">
          <input
            type="text"
            inputMode="numeric"
            value={route.minutes}
            onChange={(e) => setRoute({ ...route, minutes: e.target.value.replace(/[^\d]/g, '') })}
          />
        </Field>
        <button className="btn align-end" disabled={!canSave} onClick={save}>
          Save
        </button>
      </Row>
      <label className="check">
        <input type="checkbox" checked={route.both} onChange={(e) => setRoute({ ...route, both: e.target.checked })} />{' '}
        Same time both ways (untick if e.g. the way back takes longer)
      </label>
    </>
  );
}
