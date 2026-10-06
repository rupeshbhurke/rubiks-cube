import type { SaveFile } from '@rubiks/core';

export interface SaveEntry {
  id: string;
  save: SaveFile;
}

const SAVES_KEY = 'rubiks.saves.v1';
const AUTOSAVE_KEY = 'rubiks.autosave.v1';
const SETTINGS_KEY = 'rubiks.settings.v1';

/**
 * Named saves in localStorage. Kept behind this small class so it can move to
 * IndexedDB or a server later without touching the UI.
 */
export class SaveStore {
  list(): SaveEntry[] {
    const entries = readJson<SaveEntry[]>(SAVES_KEY) ?? [];
    return entries.sort((a, b) => b.save.updatedAt.localeCompare(a.save.updatedAt));
  }

  get(id: string): SaveEntry | undefined {
    return this.list().find((e) => e.id === id);
  }

  put(save: SaveFile, id: string = newId()): SaveEntry {
    const entries = this.list().filter((e) => e.id !== id);
    const entry = { id, save };
    entries.push(entry);
    if (!writeJson(SAVES_KEY, entries)) throw new Error('Browser storage is full or blocked.');
    return entry;
  }

  remove(id: string): void {
    if (!writeJson(SAVES_KEY, this.list().filter((e) => e.id !== id))) {
      throw new Error('Browser storage is full or blocked.');
    }
  }

  loadAutosave(): unknown {
    return readJson(AUTOSAVE_KEY);
  }

  writeAutosave(save: SaveFile): void {
    writeJson(AUTOSAVE_KEY, save);
  }

  loadSettings<T>(): Partial<T> {
    return readJson<Partial<T>>(SETTINGS_KEY) ?? {};
  }

  writeSettings<T>(settings: T): void {
    writeJson(SETTINGS_KEY, settings);
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full or blocked (e.g. private mode)
  }
}
