import { useEffect, useRef } from 'react';
import { CUBE_FACES } from '@rubiks/core';
import type { AppController, Snapshot } from '../controller/AppController';
import { Icon } from './Icon';
import { moveHint } from './moveHint';

interface Props {
  snap: Snapshot;
  controller: AppController;
}

const FACE_COLOR: Record<string, string> = Object.fromEntries(CUBE_FACES.map((f) => [f.letter, f.color]));

export function PlayPanel({ snap, controller }: Props) {
  const disabled = snap.mode !== 'play';
  const groups = ['U', 'D', 'R', 'L', 'F', 'B', ...(snap.size >= 3 ? ['M', 'E', 'S'] : []), 'x', 'y', 'z'];

  return (
    <div className="stack">
      <section>
        <h2>Moves</h2>
        <div className="move-grid">
          {groups.map((g) => (
            <div key={g} className="move-group" style={{ '--face': FACE_COLOR[g] ?? 'var(--muted)' } as React.CSSProperties}>
              <span className="move-letter">{g}</span>
              {[g, `${g}'`, `${g}2`].map((t) => (
                <button key={t} className="move-btn" disabled={disabled} title={moveHint(t)} onClick={() => controller.move(t)}>
                  {t}
                </button>
              ))}
            </div>
          ))}
        </div>
        <p className="hint">Drag a sticker to turn its layer. Drag the background to look around. The Keys tab lists every keyboard shortcut.</p>
      </section>

      <History snap={snap} controller={controller} />

      <section>
        <h2>Animation speed</h2>
        <div className="row">
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.25}
            value={snap.speed}
            onChange={(e) => controller.setSpeed(Number(e.target.value))}
            aria-label="Animation speed"
          />
          <span className="mono">{snap.speed.toFixed(2)}×</span>
        </div>
      </section>
    </div>
  );
}

function History({ snap, controller }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const atEnd = snap.cursor >= snap.moves.length;
  const disabled = snap.mode !== 'play';

  useEffect(() => {
    listRef.current?.querySelector('.chip.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [snap.cursor]);

  return (
    <section>
      <div className="section-head">
        <h2>History</h2>
        <span className="muted mono">
          {snap.cursor}/{snap.moves.length}
        </span>
      </div>
      {snap.scramble && (
        <p className="scramble">
          <span className="muted">Scramble</span> <span className="mono">{snap.scramble.join(' ')}</span>
        </p>
      )}
      <div className="chips" ref={listRef}>
        <button className={`chip start ${snap.cursor === 0 ? 'current' : ''}`} disabled={disabled} onClick={() => controller.seek(0)}>
          start
        </button>
        {snap.moves.map((m, i) => (
          <button
            key={i}
            className={`chip mono ${i < snap.cursor ? 'done' : 'future'} ${i + 1 === snap.cursor ? 'current' : ''}`}
            disabled={disabled}
            onClick={() => controller.seek(i + 1)}
          >
            {m}
          </button>
        ))}
        {snap.moves.length === 0 && <span className="muted small">No moves yet.</span>}
      </div>
      <div className="transport">
        <button className="icon-btn" title="Go to start" disabled={disabled || snap.cursor === 0} onClick={() => controller.seek(0)}>
          <Icon name="first" />
        </button>
        <button className="icon-btn" title="Step back" disabled={disabled || snap.cursor === 0} onClick={() => controller.undo()}>
          <Icon name="prev" />
        </button>
        {snap.replaying ? (
          <button className="icon-btn accent" title="Pause" onClick={() => controller.stopPlayback()}>
            <Icon name="pause" />
          </button>
        ) : (
          <button
            className="icon-btn accent"
            title={atEnd ? 'Replay from start' : 'Play'}
            disabled={disabled || snap.moves.length === 0}
            onClick={() => void controller.replay()}
          >
            <Icon name="play" />
          </button>
        )}
        <button className="icon-btn" title="Step forward" disabled={disabled || atEnd} onClick={() => controller.redo()}>
          <Icon name="next" />
        </button>
        <button
          className="icon-btn"
          title="Go to end"
          disabled={disabled || atEnd}
          onClick={() => controller.seek(snap.moves.length)}
        >
          <Icon name="last" />
        </button>
      </div>
    </section>
  );
}
