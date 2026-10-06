import { CubePuzzle } from './cube/CubePuzzle';
import { type Puzzle, type PuzzleDescriptor, type State, NotationError, UNKNOWN_COLOR } from './types';

/** Puzzle types the app can create, keyed by descriptor kind. */
const cache = new Map<string, Puzzle<any>>();

export const CUBE_SIZES = [2, 3, 4, 5, 6, 7] as const;

export function descriptorKey(d: PuzzleDescriptor): string {
  return `${d.kind}:${d.size}`;
}

export function isSupportedDescriptor(d: unknown): d is PuzzleDescriptor {
  if (!d || typeof d !== 'object') return false;
  const { kind, size } = d as Record<string, unknown>;
  return kind === 'cube' && typeof size === 'number' && (CUBE_SIZES as readonly number[]).includes(size);
}

export function getPuzzle(d: PuzzleDescriptor): Puzzle<any> {
  const k = descriptorKey(d);
  let p = cache.get(k);
  if (!p) {
    if (!isSupportedDescriptor(d)) throw new Error(`Unsupported puzzle ${k}`);
    p = new CubePuzzle(d.size);
    cache.set(k, p);
  }
  return p;
}

export function getCube(size: number): CubePuzzle {
  return getPuzzle({ kind: 'cube', size }) as CubePuzzle;
}

export function parseAlg<M>(puzzle: Puzzle<M>, text: string): M[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => puzzle.parseMove(t));
}

export function applyAll<M>(puzzle: Puzzle<M>, state: State, moves: readonly M[]): State {
  return moves.reduce((s, m) => puzzle.apply(s, m), state);
}

/** One letter per sticker; unknown stickers become "X". */
export function stateToFacelets(puzzle: Puzzle<unknown>, state: State): string {
  return Array.from(state, (c) => (c === UNKNOWN_COLOR ? 'X' : puzzle.faces[c].letter)).join('');
}

export function faceletsToState(puzzle: Puzzle<unknown>, text: string): State {
  if (typeof text !== 'string' || text.length !== puzzle.stickerCount) {
    throw new Error(`Expected ${puzzle.stickerCount} facelets for ${puzzle.name}`);
  }
  const lookup = new Map(puzzle.faces.map((f, i) => [f.letter, i]));
  return Uint8Array.from(text, (ch) => {
    if (ch === 'X') return UNKNOWN_COLOR;
    const c = lookup.get(ch);
    if (c === undefined) throw new NotationError(ch, 'unknown facelet letter');
    return c;
  });
}

export function statesEqual(a: State, b: State): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
