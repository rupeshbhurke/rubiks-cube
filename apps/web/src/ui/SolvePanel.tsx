import { useEffect, useRef, useState } from 'react';
import { BEGINNER_STAGES, describeCubeMove } from '@rubiks/core';
import type { AppController, PlanSnapshot, Snapshot } from '../controller/AppController';
import { Icon } from './Icon';
import { moveHint } from './moveHint';

interface Props {
  snap: Snapshot;
  controller: AppController;
}

type SolveMode = 'guided' | 'quick';

export function SolvePanel({ snap, controller }: Props) {
  const plan = snap.solver.plan;
  const [mode, setMode] = useState<SolveMode>(plan?.kind ?? 'guided');

  useEffect(() => {
    if (plan) setMode(plan.kind);
  }, [plan?.kind]);

  if (snap.size !== 3) {
    return (
      <div className="stack">
        <section>
          <h2>Solve</h2>
          <p>Solving is available for the 3×3×3 for now. Switch the puzzle size to 3×3×3 to use it.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="segmented" role="tablist" aria-label="Solve mode">
        <button role="tab" aria-selected={mode === 'guided'} className={mode === 'guided' ? 'active' : ''} onClick={() => setMode('guided')}>
          Learn step by step
        </button>
        <button role="tab" aria-selected={mode === 'quick'} className={mode === 'quick' ? 'active' : ''} onClick={() => setMode('quick')}>
          Fast solution
        </button>
      </div>
      {mode === 'guided' ? (
        <Guided snap={snap} controller={controller} plan={plan?.kind === 'guided' ? plan : null} />
      ) : (
        <Quick snap={snap} controller={controller} plan={plan?.kind === 'quick' ? plan : null} />
      )}
    </div>
  );
}

/* ---------- Guided beginner solve ---------- */

function Guided({ snap, controller, plan }: Props & { plan: PlanSnapshot | null }) {
  const finished = plan && plan.pointer >= plan.moves.length && !plan.stale;

  if (!plan) {
    return (
      <section>
        <h2>Beginner method</h2>
        <p>Learn to solve the cube layer by layer, the way most people learn it. Each step explains what to do and why.</p>
        <ol className="stage-preview">
          {BEGINNER_STAGES.filter((s) => s.id !== 'orient').map((s) => (
            <li key={s.id}>{s.title}</li>
          ))}
        </ol>
        <button className="pill-btn primary wide" disabled={snap.mode !== 'play' || snap.solved} onClick={() => controller.startGuided()}>
          <Icon name="wand" /> Teach me to solve this cube
        </button>
        {snap.solved && <p className="muted small">The cube is solved. Scramble it first, or paint your own cube.</p>}
      </section>
    );
  }

  const step = plan.steps[plan.step];
  const stageIndex = step ? BEGINNER_STAGES.findIndex((s) => s.id === step.stage) : BEGINNER_STAGES.length;
  const stage = BEGINNER_STAGES[stageIndex];
  const stagesInPlan = new Set(plan.steps.map((s) => s.stage));

  return (
    <>
      <StageTracker plan={plan} current={stageIndex} stagesInPlan={stagesInPlan} />

      {plan.stale ? (
        <section className="callout warning-callout">
          <p>
            The cube left the plan. Undo your last move to continue, or plan again from here.
          </p>
          <div className="row">
            <button className="pill-btn primary" onClick={() => controller.startGuided()}>
              Plan from here
            </button>
            <button className="pill-btn" onClick={() => controller.undo()}>
              <Icon name="undo" /> Undo
            </button>
          </div>
        </section>
      ) : finished ? (
        <section className="callout success-callout">
          <h2>Solved!</h2>
          <p>
            You solved it with the beginner method in {plan.moves.length} moves. Scramble again and try to do more of the steps yourself.
          </p>
        </section>
      ) : (
        step && (
          <>
            <section className="stage-card">
              <div className="section-head">
                <h2>
                  {stage.id === 'orient' ? 'Get ready' : `Stage ${stageIndex}`} · {stage.title}
                </h2>
                <span className="muted mono small">
                  step {plan.step + 1}/{plan.steps.length}
                </span>
              </div>
              <p className="muted small">{stage.goal}</p>
            </section>
            <StepCard plan={plan} controller={controller} disabled={snap.mode !== 'play'} playing={snap.playing && !snap.replaying} />
          </>
        )
      )}

      <p className="muted small">
        Tip: do the moves yourself with the keyboard or by dragging. The guide follows along, and the pieces to work on glow.
      </p>
      <button className="link-btn" onClick={() => controller.clearPlan()}>
        Stop the guide
      </button>
    </>
  );
}

function StageTracker({ plan, current, stagesInPlan }: { plan: PlanSnapshot; current: number; stagesInPlan: Set<string | undefined> }) {
  return (
    <ol className="stage-tracker" aria-label="Stages">
      {BEGINNER_STAGES.map((s, i) => {
        if (s.id === 'orient' && !stagesInPlan.has('orient')) return null;
        const state = plan.stale ? (i < current ? 'done' : 'todo') : i < current ? 'done' : i === current ? 'current' : 'todo';
        const skipped = !stagesInPlan.has(s.id) && i < current;
        return (
          <li key={s.id} className={`stage-item ${state}`} title={skipped ? 'Already done' : undefined}>
            <span className="stage-dot" aria-hidden>
              {state === 'done' ? <Icon name="check" /> : null}
            </span>
            <span className="stage-name">{s.title}</span>
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({ plan, controller, disabled, playing }: { plan: PlanSnapshot; controller: AppController; disabled: boolean; playing: boolean }) {
  const step = plan.steps[plan.step];
  const next = plan.moves[plan.pointer];
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector('.chip.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [plan.pointer]);

  return (
    <section className="step-card">
      <p className="step-text">{step.text}</p>
      <div className="chips" ref={listRef}>
        {plan.moves.slice(step.start, step.end).map((m, i) => {
          const index = step.start + i;
          return (
            <span key={index} className={`chip mono static ${index < plan.pointer ? 'done' : 'future'} ${index === plan.pointer ? 'current' : ''}`}>
              {m}
            </span>
          );
        })}
      </div>
      {next && (
        <div className="next-move">
          <span className="next-token mono">{next}</span>
          <span>
                  {plan.half ? `Half done. Turn once more to finish ${next}.` : describeCubeMove(next)}
                  <span className="move-hint">{moveHint(next)}</span>
                </span>
        </div>
      )}
      <div className="row wrap">
        <button className="pill-btn" disabled={disabled || !next} onClick={() => controller.planNext()}>
          <Icon name="next" /> Next move
        </button>
        {playing ? (
          <button className="pill-btn" onClick={() => controller.stopPlayback()}>
            <Icon name="pause" /> Pause
          </button>
        ) : (
          <>
            <button className="pill-btn primary" disabled={disabled || !next} onClick={() => void controller.playPlanStep()}>
              <Icon name="play" /> Show this step
            </button>
            <button className="pill-btn" disabled={disabled || !next} onClick={() => void controller.playPlan()}>
              Play to the end
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/* ---------- Fast computer solution ---------- */

function Quick({ snap, controller, plan }: Props & { plan: PlanSnapshot | null }) {
  const busy = snap.solver.quick === 'loading';
  const remaining = plan ? plan.moves.length - plan.pointer : 0;
  const next = plan?.moves[plan.pointer];
  const done = plan && remaining === 0 && !plan.stale;
  const canStep = !!plan && !plan.stale && remaining > 0 && snap.mode === 'play';
  const playingSolution = snap.playing && !snap.replaying && !!plan && !done;

  return (
    <>
      <section>
        <h2>Fast solution</h2>
        <p className="muted small">
          Finds a short solution (usually about 20 moves) with Kociemba's two-phase algorithm. Great for checking a cube, hard to
          learn from.
        </p>
        <button className="pill-btn primary wide" disabled={busy || snap.mode !== 'play' || snap.solved} onClick={() => void controller.solve()}>
          <Icon name="wand" /> {busy ? 'Solving…' : plan && !plan.stale ? 'Solve again' : 'Find solution'}
        </button>
        {snap.solved && !plan && <p className="muted small">The cube is solved. Scramble it first.</p>}
        {busy && <p className="muted small">The first solve prepares lookup tables and can take a few seconds.</p>}
        {snap.solver.quick === 'error' && <p className="error">Solver failed: {snap.solver.error}</p>}
      </section>

      {plan && (
        <section>
          <div className="section-head">
            <h2>Solution</h2>
            <span className="muted mono">
              {plan.pointer}/{plan.moves.length}
            </span>
          </div>
          {plan.stale ? (
            <p className="warning">The cube changed since this solution was found. Undo your move or solve again.</p>
          ) : done ? (
            <p className="success">Solved in {plan.moves.length} moves.</p>
          ) : (
            next && (
              <div className="next-move">
                <span className="next-token mono">{next}</span>
                <span>
                  {plan.half ? `Half done. Turn once more to finish ${next}.` : describeCubeMove(next)}
                  <span className="move-hint">{moveHint(next)}</span>
                </span>
              </div>
            )
          )}
          <div className="chips">
            {plan.moves.map((m, i) => (
              <span key={i} className={`chip mono static ${i < plan.pointer ? 'done' : 'future'} ${i === plan.pointer ? 'current' : ''}`}>
                {m}
              </span>
            ))}
          </div>
          <div className="row">
            <button className="pill-btn" disabled={!canStep} onClick={() => controller.planNext()}>
              <Icon name="next" /> Next move
            </button>
            {playingSolution ? (
              <button className="pill-btn" onClick={() => controller.stopPlayback()}>
                <Icon name="pause" /> Pause
              </button>
            ) : (
              <button className="pill-btn primary" disabled={!canStep} onClick={() => void controller.playPlan()}>
                <Icon name="play" /> Play all
              </button>
            )}
          </div>
          <p className="muted small">Solution moves are added to your history, so you can undo them or replay them later.</p>
        </section>
      )}
    </>
  );
}
