import { useLayoutEffect, useRef } from 'react';
import { Icon } from './Icon';
import { KeyReference } from './KeyReference';

const NOTATION: [string, string][] = [
  ["R'", 'Prime: counter-clockwise.'],
  ['R2', 'Half turn (180°).'],
  ['x y z', 'Whole cube, like R, U and F.'],
  ['r / Rw', 'Wide: the face plus the next layer.'],
  ['2R', 'Big cubes: only the 2nd layer from R.'],
];

interface Props {
  size: number;
  onClose: () => void;
  /** Reports how much of the stage the panel covers, so the cube can move aside. */
  onInset: (left: number, bottom: number) => void;
}

/**
 * Floating keyboard help on the 3D stage. It is not modal: the cube stays
 * visible and every key keeps working, and each key press lights its row.
 */
export function HelpPanel({ size, onClose, onInset }: Props) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const panel = ref.current!;
    const stage = panel.parentElement!;
    // Layout offsets ignore the slide-in transform, so this measures the final position.
    const measure = () => {
      // Docked along the bottom on small screens, along the left otherwise.
      const docksBottom = panel.offsetWidth > stage.clientWidth * 0.6;
      if (docksBottom) onInset(0, stage.clientHeight - panel.offsetTop);
      else onInset(panel.offsetLeft + panel.offsetWidth, 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(stage);
    return () => {
      observer.disconnect();
      onInset(0, 0);
    };
  }, [onInset]);

  return (
    <aside ref={ref} className="help-panel" aria-label="Keyboard help">
      <header className="help-head">
        <h2>Keys and controls</h2>
        <span className="muted small">Try them, the cube stays live</span>
        <button className="icon-btn small-btn" title="Close help (?)" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="help-body">
        <KeyReference size={size} live compact />
        <details className="help-notation">
          <summary>Notation you will see in solutions</summary>
          <table className="table">
            <tbody>
              {NOTATION.map(([k, v]) => (
                <tr key={k}>
                  <td className="mono nowrap">{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </aside>
  );
}
