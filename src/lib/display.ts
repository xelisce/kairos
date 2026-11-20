// Settings > Display: which warnings show, whether trips can be dragged, special days, places
// on blocks, how faded skipped sessions are, and your color swatches. Only for showing things:
// the planner still sees every warning.
import type { DisplaySettings, Occ, Settings } from '../types';
import { COLOR_PRESETS } from './labels';
import { MAX_SWATCHES } from './limits';

export const DEFAULT_DISPLAY: DisplaySettings = {
  silenceRoutines: false,
  silenceTasks: false,
  silenceTravel: false,
  dragTravel: true,
  showSpecialDays: true,
  showLocations: true,
  skippedOpacity: 0.32,
  colorPresets: COLOR_PRESETS,
};

/** Your display settings, with defaults for anything you haven't set (and at most MAX_SWATCHES swatches). */
export function displayOf(s: Pick<Settings, 'display'>): DisplaySettings {
  const d = { ...DEFAULT_DISPLAY, ...s.display };
  return d.colorPresets.length > MAX_SWATCHES ? { ...d, colorPresets: d.colorPresets.slice(0, MAX_SWATCHES) } : d;
}

/** Is this block's warning one you turned off? */
export function isSilenced(o: Occ, d: DisplaySettings): boolean {
  const type = o.source.type;
  return (
    (type === 'routine' && d.silenceRoutines) ||
    (type === 'task' && d.silenceTasks) ||
    (type === 'travel' && d.silenceTravel)
  );
}

/** The block as you want to see it: without a warning you turned off. */
export const shown = (o: Occ, d: DisplaySettings): Occ =>
  o.warning && isSilenced(o, d) ? { ...o, warning: undefined } : o;
