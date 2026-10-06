import { useRef, useState } from 'react';
import type { AppController, Snapshot } from '../controller/AppController';
import { Icon } from './Icon';

interface Props {
  snap: Snapshot;
  controller: AppController;
}

export function SavesPanel({ snap, controller }: Props) {
  const [name, setName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const current = snap.saves.find((s) => s.id === snap.currentSaveId);

  return (
    <div className="stack">
      <section>
        <h2>Save this cube</h2>
        <p className="muted small">Saves keep the starting state and every move, so you can replay them later.</p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            controller.saveAs(name);
            setName('');
          }}
        >
          <input
            className="text-input"
            placeholder="Name (optional)"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="pill-btn primary" type="submit">
            <Icon name="save" /> Save
          </button>
        </form>
        {current && (
          <button className="pill-btn wide" onClick={() => controller.saveCurrent()}>
            Update “{current.save.name}”
          </button>
        )}
      </section>

      <section>
        <h2>Share and files</h2>
        <div className="row wrap">
          <button className="pill-btn" onClick={() => void controller.copyShareLink()}>
            <Icon name="link" /> Copy share link
          </button>
          <button className="pill-btn" onClick={() => controller.exportSave()}>
            <Icon name="download" /> Export file
          </button>
          <button className="pill-btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> Import file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void controller.importFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Saved cubes</h2>
          <span className="muted mono">{snap.saves.length}</span>
        </div>
        {snap.saves.length === 0 && <p className="muted small">Nothing saved yet. Saves stay in this browser.</p>}
        <ul className="save-list">
          {snap.saves.map(({ id, save }) => (
            <li key={id} className={id === snap.currentSaveId ? 'current' : ''}>
              <button className="save-main" onClick={() => controller.load(id)} title="Load">
                <span className="save-name">{save.name}</span>
                <span className="muted small">
                  {save.puzzle.size}×{save.puzzle.size} · {save.moves.length} move{save.moves.length === 1 ? '' : 's'} ·{' '}
                  {new Date(save.updatedAt).toLocaleString()}
                </span>
              </button>
              <button className="icon-btn" title="Export file" onClick={() => controller.exportSave(id)}>
                <Icon name="download" />
              </button>
              <button
                className="icon-btn danger"
                title="Delete"
                onClick={() => {
                  if (window.confirm(`Delete "${save.name}"? This cannot be undone.`)) controller.deleteSave(id);
                }}
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
