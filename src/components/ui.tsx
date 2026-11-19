import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import type { Occ } from '../types';

export type ModalState =
  | null
  | { kind: 'occ'; occ: Occ }
  | { kind: 'task'; id?: string; start?: Date; end?: Date }
  | { kind: 'event'; id?: string; start?: Date; end?: Date }
  | { kind: 'class'; id?: string; moduleId?: string }
  | { kind: 'module'; id?: string; semesterId?: string }
  | { kind: 'semester'; id?: string }
  | { kind: 'routine'; id?: string }
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

export function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const names = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <div className="daypicker">
      {names.map((n, i) => (
        <button type="button" key={i} className={value.includes(i) ? 'on' : ''}
          onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())}>{n}</button>
      ))}
    </div>
  );
}
