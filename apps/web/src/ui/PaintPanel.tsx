import { CUBE_FACES, UNKNOWN_COLOR } from '@rubiks/core';
import type { AppController, Snapshot } from '../controller/AppController';
import { Icon } from './Icon';

interface Props {
  snap: Snapshot;
  controller: AppController;
}

export function PaintPanel({ snap, controller }: Props) {
  if (snap.mode !== 'paint') {
    return (
      <div className="stack">
        <section>
          <h2>Copy a real cube</h2>
          <p>Paint the stickers to match a physical cube, then solve or save it.</p>
          <ol className="steps">
            <li>Hold your cube with the white center at the bottom, the green center facing you and the red center on the left.</li>
            <li>Pick a color, then tap or drag across stickers to paint them.</li>
            <li>Rotate the view to reach every face.</li>
            <li>Press “Use this state”. The app checks that the cube can really exist.</li>
          </ol>
          <button className="pill-btn primary wide" onClick={() => controller.startPaint()}>
            <Icon name="brush" /> Start painting
          </button>
        </section>
      </div>
    );
  }

  const per = snap.size * snap.size;
  const result = snap.paintResult;
  const palette = [...CUBE_FACES.map((f, i) => ({ id: i, name: f.colorName, color: f.color })), { id: UNKNOWN_COLOR, name: 'Not painted', color: '' }];

  return (
    <div className="stack">
      <section>
        <h2>Colors</h2>
        <div className="palette">
          {palette.map((p) => {
            const count = snap.paintCounts[p.id === UNKNOWN_COLOR ? 6 : p.id];
            const selected = snap.paintColor === p.id;
            return (
              <button
                key={p.id}
                className={`swatch ${selected ? 'selected' : ''} ${p.id === UNKNOWN_COLOR ? 'unknown' : ''}`}
                style={p.color ? ({ '--swatch': p.color } as React.CSSProperties) : undefined}
                onClick={() => controller.setPaintColor(p.id)}
                title={p.name}
                aria-pressed={selected}
              >
                <span className="swatch-color" />
                <span className={`swatch-count mono ${p.id !== UNKNOWN_COLOR && count !== per ? 'off' : ''}`}>
                  {p.id === UNKNOWN_COLOR ? count : `${count}/${per}`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="row wrap">
          <button className="pill-btn" onClick={() => controller.clearPaint()}>
            Clear all
          </button>
          <button className="pill-btn" onClick={() => controller.solvedPaint()}>
            Start from solved
          </button>
        </div>
      </section>

      {result && !result.ok && (
        <section className="problems">
          <h2>Can’t use this state yet</h2>
          <ul>
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="row">
        <button className="pill-btn primary" onClick={() => controller.applyPaint()}>
          <Icon name="check" /> Use this state
        </button>
        <button className="pill-btn" onClick={() => controller.cancelPaint()}>
          Cancel
        </button>
      </section>
    </div>
  );
}
