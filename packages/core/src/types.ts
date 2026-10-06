/**
 * A puzzle state is one color id per sticker. Color ids index into `Puzzle.faces`
 * (the color a face has when solved). `UNKNOWN_COLOR` marks a sticker that has not
 * been painted yet in the state editor.
 */
export type State = Uint8Array;

export const UNKNOWN_COLOR = 255;

/** Identifies a puzzle type. Extend this union when new puzzles are added. */
export type PuzzleDescriptor = { kind: 'cube'; size: number };

export interface FaceInfo {
  /** Single-letter face name used in facelet strings, e.g. "U". */
  letter: string;
  /** Human readable name, e.g. "Up". */
  name: string;
  /** Default sticker color as a CSS hex string. */
  color: string;
  /** Name of that color, e.g. "White". */
  colorName: string;
}

export interface ValidationResult {
  ok: boolean;
  /** Problems that make the state impossible to reach on a real puzzle. */
  errors: string[];
  /** Things the validator could not fully check. */
  warnings: string[];
}

/**
 * Behaviour every puzzle type provides. `M` is the puzzle's own move type; the
 * notation string produced by `formatMove` is the portable form used in saves.
 */
export interface Puzzle<M = unknown> {
  readonly descriptor: PuzzleDescriptor;
  /** Stable id, e.g. "cube3". */
  readonly id: string;
  /** Display name, e.g. "3x3x3". */
  readonly name: string;
  readonly faces: readonly FaceInfo[];
  readonly stickerCount: number;

  solved(): State;
  isSolved(state: State): boolean;
  apply(state: State, move: M): State;
  parseMove(token: string): M;
  formatMove(move: M): string;
  invertMove(move: M): M;
  scramble(random?: () => number): M[];
  validate(state: State): ValidationResult;
}

export class NotationError extends Error {
  constructor(readonly token: string, reason = 'unknown move') {
    super(`Invalid move "${token}": ${reason}`);
    this.name = 'NotationError';
  }
}
