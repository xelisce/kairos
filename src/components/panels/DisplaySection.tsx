// Settings > Display: warnings, dragging trips, special days, places on blocks, skipped fading,
// and your color swatches.
import { useState } from 'react';
import { useStore } from '../../store';
import type { DisplaySettings } from '../../types';
import { DEFAULT_DISPLAY, displayOf } from '../../lib/display';
import { MAX_SWATCHES } from '../../lib/limits';

type Toggle = 'silenceRoutines' | 'silenceTasks' | 'silenceTravel' | 'dragTravel' | 'showSpecialDays' | 'showLocations';

export function DisplaySection() {
  const settings = useStore((s) => s.data.settings);
  const commit = useStore((s) => s.commit);
  const d = displayOf(settings);
  const set = <K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]) =>
    commit(`Display ${key}`, (data) => {
      data.settings.display = { ...data.settings.display, [key]: value };
    });
  const check = (key: Toggle, label: string, invert = false) => (
    <label className="check">
      <input
        type="checkbox"
        checked={invert ? !d[key] : d[key]}
        onChange={(e) => set(key, invert ? !e.target.checked : e.target.checked)}
      />{' '}
      {label}
    </label>
  );
  const [newColor, setNewColor] = useState('#6d5dfc');
  const presets = d.colorPresets;
  const customPresets = settings.display?.colorPresets !== undefined;
  const full = presets.length >= MAX_SWATCHES;
  const color = newColor.toLowerCase();

  return (
    <>
      <h3>Display</h3>
      <h4 className="plans-head">Show warnings ⚠️ on</h4>
      {check('silenceRoutines', 'Routines (a meal or shower that no longer fits its window)', true)}
      {check('silenceTasks', 'Tasks (after the deadline, not planned, waiting on another task)', true)}
      {check('silenceTravel', 'Travel (arriving late, too little time for a trip)', true)}
      <p className="muted small">Turning these off only hides them: the planner still avoids the problems.</p>

      <h4 className="plans-head">Calendar</h4>
      {check('dragTravel', 'Travel blocks can be dragged')}
      {check('showSpecialDays', 'Show holidays, break and exam weeks (tinted columns with a label)')}
      {check('showLocations', 'Show places on calendar blocks')}
      <label className="field">
        <span className="field-label">
          How visible skipped sessions are: {Math.round(d.skippedOpacity * 100)}%
          {d.skippedOpacity !== DEFAULT_DISPLAY.skippedOpacity && (
            <>
              {' '}
              <button
                type="button"
                className="linkish"
                onClick={() => set('skippedOpacity', DEFAULT_DISPLAY.skippedOpacity)}
              >
                Reset
              </button>
            </>
          )}
        </span>
        <input
          type="range"
          min={0.1}
          max={0.8}
          step={0.02}
          value={d.skippedOpacity}
          onChange={(e) => set('skippedOpacity', Number(e.target.value))}
        />
      </label>

      <h4 className="plans-head">
        Color swatches{' '}
        {customPresets && (
          <button
            type="button"
            className="linkish"
            onClick={() =>
              commit('Reset color swatches', (data) => {
                if (data.settings.display) delete data.settings.display.colorPresets;
              })
            }
          >
            Reset
          </button>
        )}
      </h4>
      <p className="muted small">The colors offered when you pick one for a course, club or routine.</p>
      <div className="colorpicker">
        {presets.map((c) => (
          <button
            type="button"
            key={c}
            className="swatch removable"
            style={{ background: c }}
            title={`Remove ${c}`}
            aria-label={`Remove color ${c}`}
            onClick={() =>
              set(
                'colorPresets',
                presets.filter((x) => x !== c),
              )
            }
          >
            ✕
          </button>
        ))}
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          aria-label="New swatch color"
        />
        <button
          type="button"
          className="chip"
          disabled={full || presets.includes(color)}
          onClick={() => set('colorPresets', [...presets, color])}
        >
          + Add
        </button>
      </div>
      {full && <p className="muted small">That’s the most ({MAX_SWATCHES}). Remove one to add another.</p>}
    </>
  );
}
