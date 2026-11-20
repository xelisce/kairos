import { useEffect, useRef, useState } from 'react';
import { parseDMY, toDMY } from '../../lib/time';
import { MAX_YEAR, MIN_YEAR } from '../../lib/limits';

/**
 * Date box that always reads dd/mm/yyyy, whatever the browser's region.
 * Type it (checked when you leave the box) or use 📅 for the usual picker.
 * `value`/`onChange` use "yyyy-mm-dd" ('' = empty).
 */
export function DateInput({
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  'aria-label'?: string;
}) {
  const [text, setText] = useState(toDMY(value));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focused) setText(toDMY(value));
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    if (!text.trim()) {
      setInvalid(false);
      if (value) onChange('');
      return;
    }
    const iso = parseDMY(text);
    if (!iso) {
      // Flash red and go back to the last good date.
      setInvalid(true);
      setText(toDMY(value));
      setTimeout(() => setInvalid(false), 1500);
      return;
    }
    setInvalid(false);
    setText(toDMY(iso));
    if (iso !== value) onChange(iso);
  };

  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  return (
    <div className={`dateinput ${invalid ? 'bad-input' : ''}`}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        aria-label={ariaLabel}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <button type="button" className="combo-btn" tabIndex={-1} aria-label="Pick a date" onClick={openPicker}>
        📅
      </button>
      <input
        ref={picker}
        type="date"
        className="hidden-picker"
        tabIndex={-1}
        aria-hidden="true"
        min={`${MIN_YEAR}-01-01`}
        max={`${MAX_YEAR}-12-31`}
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
      />
    </div>
  );
}

/** Date (dd/mm/yyyy) + time. `value`/`onChange` use "yyyy-mm-ddTHH:mm" ('' = empty). */
export function DateTimeInput({
  value,
  onChange,
  defaultTime = '09:00',
}: {
  value: string;
  onChange: (v: string) => void;
  /** Used when a date is picked before a time. */
  defaultTime?: string;
}) {
  const date = value ? value.slice(0, 10) : '';
  const time = value ? value.slice(11, 16) : '';
  return (
    <div className="datetimeinput">
      <DateInput value={date} aria-label="Date" onChange={(d) => onChange(d ? `${d}T${time || defaultTime}` : '')} />
      <input
        type="time"
        aria-label="Time"
        value={time}
        disabled={!date}
        onChange={(e) => date && onChange(`${date}T${e.target.value || defaultTime}`)}
      />
    </div>
  );
}
