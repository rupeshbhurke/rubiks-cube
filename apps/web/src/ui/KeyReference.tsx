import { useEffect, useState } from 'react';
import { CUBE_FACES } from '@rubiks/core';

interface KeyRow {
  /** Key caps shown together, e.g. ['Ctrl', 'Z']. */
  keys: string[];
  label: string;
  /** Small swatch for face keys. */
  color?: string;
  /** KeyboardEvent.code values that light up this row. */
  codes?: string[];
}

interface KeyGroup {
  title: string;
  note?: string;
  /** Smallest cube size the group applies to. */
  minSize?: number;
  rows: KeyRow[];
}

const FACE_COLOR = Object.fromEntries(CUBE_FACES.map((f) => [f.letter, f.color]));

const face = (letter: string, name: string): KeyRow => ({
  keys: [letter],
  label: `${name} face`,
  color: FACE_COLOR[letter],
  codes: [`Key${letter}`],
});

const GROUPS: KeyGroup[] = [
  {
    title: 'Face turns',
    note: 'Clockwise, as seen looking straight at that face.',
    rows: [face('U', 'Up'), face('D', 'Down'), face('R', 'Right'), face('L', 'Left'), face('F', 'Front'), face('B', 'Back')],
  },
  {
    title: 'Slice turns',
    note: 'The layers between two faces.',
    minSize: 3,
    rows: [
      { keys: ['M'], label: 'Middle slice, turns like L', codes: ['KeyM'] },
      { keys: ['E'], label: 'Equator slice, turns like D', codes: ['KeyE'] },
      { keys: ['S'], label: 'Standing slice, turns like F', codes: ['KeyS'] },
    ],
  },
  {
    title: 'Whole cube',
    note: 'Turns the whole cube; nothing gets scrambled.',
    rows: [
      { keys: ['X'], label: 'Tilt forward and back, like R', codes: ['KeyX'] },
      { keys: ['Y'], label: 'Spin left and right, like U', codes: ['KeyY'] },
      { keys: ['Z'], label: 'Roll sideways, like F', codes: ['KeyZ'] },
    ],
  },
  {
    title: 'Direction',
    rows: [
      { keys: ['Shift', 'key'], label: "Counter-clockwise (prime, e.g. R')", codes: ['ShiftLeft', 'ShiftRight'] },
      { keys: ['key', 'key'], label: 'Press twice for a half turn (R2)' },
    ],
  },
  {
    title: 'History',
    rows: [
      { keys: ['Ctrl', 'Z'], label: 'Undo', codes: ['Ctrl+KeyZ'] },
      { keys: ['Ctrl', 'Y'], label: 'Redo (also Ctrl + Shift + Z)', codes: ['Ctrl+KeyY', 'Ctrl+Shift+KeyZ'] },
    ],
  },
  {
    title: 'Other',
    rows: [
      { keys: ['Esc'], label: 'Stop playback or cancel painting', codes: ['Escape'] },
      { keys: ['?'], label: 'Open the help', codes: ['Slash'] },
    ],
  },
];

const POINTER: KeyRow[] = [
  { keys: ['Drag sticker'], label: 'Turn that layer' },
  { keys: ['Flick'], label: 'Finish the turn with a quick swipe' },
  { keys: ['Drag background'], label: 'Look around the cube' },
  { keys: ['Scroll', 'Pinch'], label: 'Zoom in and out' },
];

interface Props {
  /** Current cube size, to dim groups that do not apply. */
  size: number;
  /** Light up rows as their keys are pressed. */
  live?: boolean;
  /** Tighter layout for the floating help panel. */
  compact?: boolean;
}

export function KeyReference({ size, live = false, compact = false }: Props) {
  const pressed = usePressedKey(live);
  const isPressed = (row: KeyRow) => {
    if (!pressed || !row.codes) return false;
    if (row.codes.includes(pressed.code)) return true;
    // Shift + letter also lights the Shift row.
    return pressed.shift && row.codes.includes('ShiftLeft') && pressed.code.startsWith('Key');
  };

  return (
    <div className={compact ? 'keyref compact' : 'keyref'}>
      {GROUPS.map((g) => {
        const unavailable = g.minSize !== undefined && size < g.minSize;
        return (
          <section key={g.title} className={unavailable ? 'unavailable' : undefined}>
            <h2>{g.title}</h2>
            {g.note && <p className="muted small keyref-note">{unavailable ? `Needs a ${g.minSize}×${g.minSize}×${g.minSize} or larger.` : g.note}</p>}
            <ul className="keyref-list">
              {g.rows.map((row) => (
                <KeyLine key={row.keys.join('+') + row.label} row={row} active={!unavailable && isPressed(row)} />
              ))}
            </ul>
          </section>
        );
      })}
      <section>
        <h2>Mouse and touch</h2>
        <ul className="keyref-list">
          {POINTER.map((row) => (
            <KeyLine key={row.label} row={row} wide />
          ))}
        </ul>
      </section>
    </div>
  );
}

function KeyLine({ row, active = false, wide = false }: { row: KeyRow; active?: boolean; wide?: boolean }) {
  return (
    <li className={`keyref-row ${active ? 'pressed' : ''} ${wide ? 'wide' : ''}`}>
      <span className="keyref-keys">
        {row.keys.map((k, i) => (
          <span key={i} className="keyref-combo">
            {i > 0 && <span className="plus">{row.keys[0] === 'key' || wide ? '/' : '+'}</span>}
            <kbd className={k === 'key' ? 'placeholder' : undefined}>{k}</kbd>
          </span>
        ))}
      </span>
      {row.color && <span className="keyref-swatch" style={{ background: row.color }} aria-hidden />}
      <span className="keyref-label">{row.label}</span>
    </li>
  );
}

/** The most recent key press, cleared shortly after. */
function usePressedKey(enabled: boolean): { code: string; shift: boolean } | null {
  const [pressed, setPressed] = useState<{ code: string; shift: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      // Ctrl shortcuts get a prefix so Ctrl + Z does not light the Z row.
      const prefix = e.ctrlKey || e.metaKey ? (e.shiftKey ? 'Ctrl+Shift+' : 'Ctrl+') : '';
      setPressed({ code: prefix + e.code, shift: e.shiftKey });
      clearTimeout(timer);
      timer = window.setTimeout(() => setPressed(null), 450);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [enabled]);
  return pressed;
}
