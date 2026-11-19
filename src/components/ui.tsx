import { useEffect, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import type { EventCategory, Occ } from '../types';

export type ModalState =
  | null
  | { kind: 'occ'; occ: Occ }
  | { kind: 'task'; id?: string; start?: Date; end?: Date }
  | { kind: 'event'; id?: string; start?: Date; end?: Date; category?: EventCategory; moduleId?: string }
  | { kind: 'class'; id?: string; moduleId?: string }
  | { kind: 'module'; id?: string; semesterId?: string }
  | { kind: 'semester'; id?: string }
  | { kind: 'routine'; id?: string }
  | { kind: 'activity'; id?: string }
  | { kind: 'newChoice'; start: Date; end: Date }
  | { kind: 'nusmods'; semesterId: string };

export const useUI = create<{ modal: ModalState; open: (m: ModalState) => void; close: () => void }>((set) => ({
  modal: null,
  open: (modal) => set({ modal }),
  close: () => set({ modal: null }),
}));

export function Modal({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="row">{children}</div>;
}

/** Location input with suggestions from saved places. */
export function LocationInput({ value, onChange, places }: { value: string; onChange: (v: string) => void; places: string[] }) {
  return (
    <>
      <input list="kairos-places" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Optional, e.g. COM1, Home" />
      <datalist id="kairos-places">{places.map((p) => <option key={p} value={p} />)}</datalist>
    </>
  );
}

export function DayPicker({ value, onChange, letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'], presets }: {
  value: number[]; onChange: (v: number[]) => void; letters?: string[]; presets?: { label: string; days: number[] }[];
}) {
  const same = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
  return (
    <div className="daypicker-wrap">
      <div className="daypicker">
        {letters.map((n, i) => (
          <button type="button" key={i} className={value.includes(i) ? 'on' : ''} aria-pressed={value.includes(i)}
            onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())}>{n}</button>
        ))}
      </div>
      {presets && (
        <div className="chips">
          {presets.map((p) => (
            <button type="button" key={p.label} className={`chip ${same(value, p.days) ? 'on' : ''}`} onClick={() => onChange(p.days)}>{p.label}</button>
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
export function NumberInput({ value, onCommit, min = 0, max, step, ...rest }: {
  value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; 'aria-label'?: string; className?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(String(value)); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    let n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) n = value;
    n = Math.max(min, max !== undefined ? Math.min(max, n) : n);
    n = Math.round(n);
    setText(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input {...rest} type="text" inputMode="numeric" value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      data-step={step} />
  );
}

export const COLOR_PRESETS = ['#6d5dfc', '#4b9be0', '#3fa7c9', '#3fa7a0', '#3fa76a', '#5fa83f', '#e4a13a', '#d08a2c', '#d65f5f', '#e0699f', '#b35fd6', '#5a5f8a'];

/** Preset swatches; "Custom" reveals the full color picker. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPreset = COLOR_PRESETS.includes(value.toLowerCase());
  const [custom, setCustom] = useState(!isPreset);
  return (
    <div className="colorpicker">
      {COLOR_PRESETS.map((c) => (
        <button type="button" key={c} className={`swatch ${value.toLowerCase() === c ? 'on' : ''}`} style={{ background: c }}
          aria-label={`Color ${c}`} aria-pressed={value.toLowerCase() === c} onClick={() => { onChange(c); setCustom(false); }} />
      ))}
      <button type="button" className={`chip ${custom ? 'on' : ''}`} onClick={() => setCustom(!custom)}>Custom…</button>
      {custom && <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Custom color" />}
    </div>
  );
}
