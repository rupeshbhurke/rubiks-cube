import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CUBE_SIZES } from '@rubiks/core';
import { AppController } from './controller/AppController';
import { PlayPanel } from './ui/PlayPanel';
import { SolvePanel } from './ui/SolvePanel';
import { PaintPanel } from './ui/PaintPanel';
import { SavesPanel } from './ui/SavesPanel';
import { HelpPanel } from './ui/HelpPanel';
import { KeyReference } from './ui/KeyReference';
import { Icon } from './ui/Icon';

type Tab = 'play' | 'solve' | 'paint' | 'saves' | 'keys';

const TABS: { id: Tab; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'solve', label: 'Solve' },
  { id: 'paint', label: 'Paint' },
  { id: 'saves', label: 'Saves' },
  { id: 'keys', label: 'Keys' },
];

const HELP_KEY = 'rubiks.helpOpen';

function readHelpOpen(): boolean {
  try {
    return localStorage.getItem(HELP_KEY) === '1';
  } catch {
    return false;
  }
}

export function App() {
  const [controller] = useState(() => new AppController());
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const stageRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('play');
  const [help, setHelp] = useState(readHelpOpen);
  const onInset = useCallback((left: number, bottom: number) => controller.setViewInset(left, bottom), [controller]);

  useEffect(() => {
    try {
      localStorage.setItem(HELP_KEY, help ? '1' : '0');
    } catch {
      // Remembering the help state is only a convenience.
    }
  }, [help]);

  useEffect(() => {
    controller.mount(stageRef.current!);
    if (import.meta.env.DEV) Object.assign(window, { __app: controller });
    return () => controller.unmount();
  }, [controller]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setHelp((h) => !h);
      } else {
        controller.handleKey(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  // Paint mode belongs to the Paint tab; leaving the tab keeps the painting but shows it.
  useEffect(() => {
    if (snap.mode === 'paint') setTab('paint');
  }, [snap.mode]);

  const status = snap.mode === 'paint' ? 'Painting' : snap.solved ? 'Solved' : `${snap.cursor} move${snap.cursor === 1 ? '' : 's'}`;

  return (
    <div className="app">
      <main className={help ? 'stage help-open' : 'stage'} ref={stageRef}>
        <header className="topbar">
          <div className="brand">
            <span className="logo" aria-hidden />
            <h1>Cube</h1>
          </div>
          <label className="size-select">
            <span className="visually-hidden">Puzzle</span>
            <select value={snap.size} onChange={(e) => controller.setSize(Number(e.target.value))}>
              {CUBE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}×{n}×{n}
                </option>
              ))}
            </select>
          </label>
          <span className={`status ${snap.solved && snap.mode === 'play' ? 'status-solved' : ''}`}>{status}</span>
          <div className="spacer" />
          <button className="icon-btn" title="Reset camera" onClick={() => controller.resetCamera()}>
            <Icon name="camera" />
          </button>
          <button
            className={help ? 'icon-btn active' : 'icon-btn'}
            title={help ? 'Hide keys (?)' : 'Show keys (?)'}
            aria-pressed={help}
            onClick={() => setHelp((h) => !h)}
          >
            <Icon name="help" />
          </button>
        </header>

        {snap.mode === 'play' && (
          <div className="quickbar">
            <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={snap.cursor === 0} onClick={() => controller.undo()}>
              <Icon name="undo" />
            </button>
            <button
              className="icon-btn"
              title="Redo (Ctrl+Y)"
              disabled={snap.cursor >= snap.moves.length}
              onClick={() => controller.redo()}
            >
              <Icon name="redo" />
            </button>
            <span className="divider" />
            <button className="pill-btn primary" onClick={() => controller.scramble()}>
              <Icon name="shuffle" /> Scramble
            </button>
            <button className="pill-btn" onClick={() => controller.reset()}>
              <Icon name="reset" /> Reset
            </button>
          </div>
        )}
        {snap.mode === 'paint' && <div className="stage-hint">Tap or drag across stickers to paint them</div>}
        {help && <HelpPanel size={snap.size} onClose={() => setHelp(false)} onInset={onInset} />}
      </main>

      <aside className="panel">
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="panel-body">
          {tab === 'play' && <PlayPanel snap={snap} controller={controller} />}
          {tab === 'solve' && <SolvePanel snap={snap} controller={controller} />}
          {tab === 'paint' && <PaintPanel snap={snap} controller={controller} />}
          {tab === 'saves' && <SavesPanel snap={snap} controller={controller} />}
          {tab === 'keys' && <KeyReference size={snap.size} live />}
        </div>
      </aside>

      <div className="toasts" aria-live="polite">
        {snap.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => controller.dismissToast(t.id)}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
