import { faceletsToState, getPuzzle, isSupportedDescriptor, stateToFacelets, statesEqual } from './puzzles';
import { Session } from './session';
import type { PuzzleDescriptor } from './types';

export const SAVE_FORMAT = 'rubiks-cube-save';
export const SAVE_VERSION = 1;

/**
 * Portable save file (JSON). `initial` plus `moves` fully define the session;
 * `state` is the state at `cursor`, stored so files can be checked on load and
 * read by other tools without replaying.
 */
export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  name: string;
  createdAt: string;
  updatedAt: string;
  puzzle: PuzzleDescriptor;
  initial: string;
  scramble?: string[];
  moves: string[];
  cursor: number;
  state: string;
}

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

export function createSave(
  session: Session<unknown>,
  name: string,
  now = new Date(),
  createdAt?: string,
): SaveFile {
  const { puzzle } = session;
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    name,
    createdAt: createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    puzzle: { ...puzzle.descriptor },
    initial: stateToFacelets(puzzle, session.initial),
    ...(session.scramble ? { scramble: [...session.scramble] } : {}),
    moves: session.moveTokens(),
    cursor: session.cursor,
    state: stateToFacelets(puzzle, session.state),
  };
}

/** Check an untrusted value (e.g. a parsed file) and rebuild its session. */
export function restoreSession(data: unknown): { save: SaveFile; session: Session<unknown> } {
  if (!data || typeof data !== 'object') throw new SaveError('Not a save file.');
  const d = data as Record<string, unknown>;
  if (d.format !== SAVE_FORMAT) throw new SaveError('Not a Rubik\'s cube save file.');
  if (d.version !== SAVE_VERSION) throw new SaveError(`Unsupported save version ${String(d.version)}.`);
  if (!isSupportedDescriptor(d.puzzle)) throw new SaveError('Unsupported puzzle type in save file.');
  if (!Array.isArray(d.moves) || !d.moves.every((m) => typeof m === 'string')) {
    throw new SaveError('Move list is missing or invalid.');
  }
  if (d.scramble !== undefined && (!Array.isArray(d.scramble) || !d.scramble.every((m) => typeof m === 'string'))) {
    throw new SaveError('Scramble is invalid.');
  }
  const puzzle = getPuzzle(d.puzzle);
  let session: Session<unknown>;
  try {
    const initial = faceletsToState(puzzle, d.initial as string);
    const moves = (d.moves as string[]).map((t) => puzzle.parseMove(t));
    const cursor = typeof d.cursor === 'number' ? d.cursor : moves.length;
    session = new Session(puzzle, { initial, moves, cursor, scramble: d.scramble as string[] | undefined });
  } catch (err) {
    throw new SaveError(`Save file is damaged: ${(err as Error).message}`);
  }
  if (typeof d.state === 'string' && d.state.length > 0) {
    const stored = faceletsToState(puzzle, d.state);
    if (!statesEqual(stored, session.state)) throw new SaveError('Saved state does not match the move history.');
  }
  const now = new Date().toISOString();
  const save: SaveFile = {
    ...createSave(session, typeof d.name === 'string' && d.name ? d.name : 'Imported cube'),
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : now,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : now,
  };
  return { save, session };
}

/* ---------- Share links ---------- */

interface SharePayload {
  /** puzzle "kind:size" */
  p: string;
  /** initial facelets, omitted when solved */
  i?: string;
  /** scramble, space separated */
  s?: string;
  /** moves, space separated */
  m?: string;
  /** cursor, omitted when at the end */
  c?: number;
}

/** Compact, URL-safe text for a session. Platform independent (no btoa). */
export function encodeShare(session: Session<unknown>): string {
  const { puzzle } = session;
  const moves = session.moveTokens();
  const payload: SharePayload = { p: `${puzzle.descriptor.kind}:${puzzle.descriptor.size}` };
  if (!statesEqual(session.initial, puzzle.solved())) payload.i = stateToFacelets(puzzle, session.initial);
  if (session.scramble?.length) payload.s = session.scramble.join(' ');
  if (moves.length) payload.m = moves.join(' ');
  if (session.cursor !== moves.length) payload.c = session.cursor;
  return base64UrlEncode(JSON.stringify(payload));
}

export function decodeShare(code: string): Session<unknown> {
  let payload: SharePayload;
  try {
    payload = JSON.parse(base64UrlDecode(code));
  } catch {
    throw new SaveError('Share link is damaged.');
  }
  const [kind, size] = String(payload.p).split(':');
  const descriptor = { kind, size: Number(size) };
  if (!isSupportedDescriptor(descriptor)) throw new SaveError('Share link has an unsupported puzzle.');
  const puzzle = getPuzzle(descriptor);
  const solved = puzzle.solved();
  const split = (s?: string) => (s ? s.split(' ').filter(Boolean) : []);
  try {
    const moves = split(payload.m).map((t) => puzzle.parseMove(t));
    return new Session(puzzle, {
      initial: payload.i ? faceletsToState(puzzle, payload.i) : solved,
      moves,
      cursor: payload.c ?? moves.length,
      scramble: payload.s ? split(payload.s) : undefined,
    });
  } catch (err) {
    throw new SaveError(`Share link is damaged: ${(err as Error).message}`);
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64UrlEncode(text: string): string {
  const bytes = Array.from(text, (ch) => {
    const code = ch.charCodeAt(0);
    if (code > 127) throw new Error('Share payload must be ASCII');
    return code;
  });
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    const chars = [18, 12, 6, 0].map((s) => B64[(n >> s) & 63]);
    out += chars.slice(0, Math.min(4, bytes.length - i + 1)).join('');
  }
  return out;
}

function base64UrlDecode(code: string): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const ch of code) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('Invalid character');
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 255);
    }
  }
  return out;
}
