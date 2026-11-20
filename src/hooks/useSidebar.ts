import { useEffect, useState } from 'react';
import { readJson, writeStored } from '../lib/storage';

export const SIDEBAR_MIN = 260;
export const SIDEBAR_MAX = 600;
export const SIDEBAR_DEFAULT = 360;

const clampWidth = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w));

/** Sidebar width (drag the edge) and open/closed state, remembered per browser. */
export function useSidebar() {
  const [width, setWidthRaw] = useState(() => {
    const saved = readJson<number>('kairos:sidebarWidth');
    return typeof saved === 'number' && Number.isFinite(saved) ? clampWidth(saved) : SIDEBAR_DEFAULT;
  });
  const [open, setOpen] = useState(() => readJson<boolean>('kairos:sidebarOpen') ?? true);
  useEffect(() => void writeStored('kairos:sidebarWidth', width), [width]);
  useEffect(() => void writeStored('kairos:sidebarOpen', open), [open]);
  const setWidth = (w: number) => setWidthRaw(clampWidth(w));

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => setWidth(startW + ev.clientX - startX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return { width, setWidth, open, setOpen, startDrag };
}
