import { describeCubeMove } from '@rubiks/core';
import type { AppController, Snapshot } from '../controller/AppController';
import { Icon } from './Icon';

interface Props {
  snap: Snapshot;
  controller: AppController;
}

export function SolvePanel({ snap, controller }: Props) {
  if (snap.size !== 3) {
    return (
      <div className="stack">
        <section>
          <h2>Solver</h2>
          <p>The solver supports the 3×3×3 for now. Switch the puzzle size to 3×3×3 to use it.</p>
        </section>
      </div>
    );
  }

  const { solver } = snap;
  const remaining = solver.moves.length - solver.step;
  const next = solver.moves[solver.step];
  const busy = solver.status === 'loading';
  const done = solver.status === 'ready' && remaining === 0 && !solver.stale;
  const canStep = solver.status === 'ready' && !solver.stale && remaining > 0 && snap.mode === 'play';
  const playingSolution = snap.playing && !snap.replaying && solver.status === 'ready' && !done;

  return (
    <div className="stack">
      <section>
        <h2>Solver</h2>
        <p className="muted small">
          Finds a short solution (usually about 20 moves) with Kociemba's two-phase algorithm. Step through it to see how each
          move changes the cube.
        </p>
        <button
          className="pill-btn primary wide"
          disabled={busy || snap.mode !== 'play' || snap.solved}
          onClick={() => void controller.solve()}
        >
          <Icon name="wand" /> {busy ? 'Solving…' : solver.status === 'ready' && !solver.stale ? 'Solve again' : 'Find solution'}
        </button>
        {snap.solved && solver.status !== 'ready' && <p className="muted small">The cube is solved. Scramble it first.</p>}
        {busy && <p className="muted small">The first solve prepares lookup tables and can take a few seconds.</p>}
        {solver.status === 'error' && <p className="error">Solver failed: {solver.error}</p>}
      </section>

      {solver.status === 'ready' && (
        <section>
          <div className="section-head">
            <h2>Solution</h2>
            <span className="muted mono">
              {solver.step}/{solver.moves.length}
            </span>
          </div>
          {solver.stale ? (
            <p className="warning">The cube changed since this solution was found. Solve again.</p>
          ) : done ? (
            <p className="success">Solved in {solver.moves.length} moves.</p>
          ) : (
            <div className="next-move">
              <span className="next-token mono">{next}</span>
              <span>{describeCubeMove(next)}</span>
            </div>
          )}
          <div className="chips">
            {solver.moves.map((m, i) => (
              <span key={i} className={`chip mono static ${i < solver.step ? 'done' : 'future'} ${i === solver.step ? 'current' : ''}`}>
                {m}
              </span>
            ))}
          </div>
          <div className="row">
            <button className="pill-btn" disabled={!canStep} onClick={() => controller.solutionNext()}>
              <Icon name="next" /> Next move
            </button>
            {playingSolution ? (
              <button className="pill-btn" onClick={() => controller.stopPlayback()}>
                <Icon name="pause" /> Pause
              </button>
            ) : (
              <button className="pill-btn primary" disabled={!canStep} onClick={() => void controller.playSolution()}>
                <Icon name="play" /> Play all
              </button>
            )}
          </div>
          <p className="muted small">Solution moves are added to your history, so you can undo them or replay them later.</p>
        </section>
      )}
    </div>
  );
}
