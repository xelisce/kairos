import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { displayOf } from '../../lib/display';

/**
 * Location box with its own dropdown (saved places first, then places you've used before).
 * Type to filter; ▾ shows everything; arrow keys + Enter pick; Escape closes.
 */
export function LocationInput({
  value,
  onChange,
  places,
}: {
  value: string;
  onChange: (v: string) => void;
  places: string[];
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState(0);
  const query = value.trim().toLowerCase();
  const options =
    showAll || !query ? places : places.filter((p) => p.toLowerCase().includes(query) && p.toLowerCase() !== query);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <div className="combo">
      <input
        value={value}
        placeholder="Optional, e.g. Morgridge Hall"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setShowAll(false);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && options[active]) {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation(); // close the list, not the dialog
            setOpen(false);
          }
        }}
      />
      <button
        type="button"
        className="combo-btn"
        tabIndex={-1}
        aria-label="Show places"
        onMouseDown={(e) => {
          e.preventDefault();
          setShowAll(true);
          setOpen((o) => !o || !showAll);
          setActive(0);
        }}
      >
        ▾
      </button>
      {open && (
        <ul className="combo-list" role="listbox">
          {options.length === 0 && (
            <li className="combo-empty">
              {places.length
                ? 'No match. Your text will be used as is.'
                : 'No saved places yet. Add some in the Places tab, or just type one.'}
            </li>
          )}
          {options.map((p, i) => (
            <li
              key={p}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const sameDays = (a: number[], b: number[]) => {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/** Toggle days of the week (0 = Mon), with optional shortcuts like MWF / TR. */
export function DayPicker({
  value,
  onChange,
  // One letter per day, unambiguous: R = Thursday, U = Sunday.
  letters = ['M', 'T', 'W', 'R', 'F', 'S', 'U'],
  presets,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  letters?: string[];
  presets?: { label: string; days: number[] }[];
}) {
  return (
    <div className="daypicker-wrap">
      <div className="daypicker">
        {letters.map((letter, i) => (
          <button
            type="button"
            key={i}
            className={value.includes(i) ? 'on' : ''}
            aria-pressed={value.includes(i)}
            onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())}
          >
            {letter}
          </button>
        ))}
      </div>
      {presets && (
        <div className="chips">
          {presets.map((p) => (
            <button
              type="button"
              key={p.label}
              className={`chip ${sameDays(value, p.days) ? 'on' : ''}`}
              onClick={() => onChange(p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Number box you can clear and retype freely. The value is only checked
 * (and clamped to min/max) when you leave the box or press Enter.
 */
export function NumberInput({
  value,
  onCommit,
  min = 0,
  max,
  ...rest
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  'aria-label'?: string;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const commit = () => {
    setFocused(false);
    let n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) n = value;
    n = Math.round(Math.max(min, max !== undefined ? Math.min(max, n) : n));
    setText(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** Your swatches (Settings > Display); "Custom…" reveals the full color picker. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const COLOR_PRESETS = useStore((s) => displayOf(s.data.settings).colorPresets).map((c) => c.toLowerCase());
  const [custom, setCustom] = useState(!COLOR_PRESETS.includes(value.toLowerCase()));
  return (
    <div className="colorpicker">
      {COLOR_PRESETS.map((c) => (
        <button
          type="button"
          key={c}
          className={`swatch ${value.toLowerCase() === c ? 'on' : ''}`}
          style={{ background: c }}
          aria-label={`Color ${c}`}
          aria-pressed={value.toLowerCase() === c}
          onClick={() => {
            onChange(c);
            setCustom(false);
          }}
        />
      ))}
      <button type="button" className={`chip ${custom ? 'on' : ''}`} onClick={() => setCustom(!custom)}>
        Custom…
      </button>
      {custom && (
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Custom color" />
      )}
    </div>
  );
}
