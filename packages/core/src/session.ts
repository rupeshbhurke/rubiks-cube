import { applyAll } from './puzzles';
import type { Puzzle, State } from './types';

export interface SessionInit<M> {
  initial?: State;
  moves?: readonly M[];
  cursor?: number;
  scramble?: readonly string[];
}

/**
 * A puzzle being played: a starting state, the full move history and a cursor
 * into it. Moves before the cursor are applied; moves after it can be redone.
 * Undo, redo, replay and seeking all move the cursor, so no history is lost
 * until a new move is made while the cursor is not at the end.
 */
export class Session<M> {
  readonly initial: State;
  /** Scramble that produced `initial`, kept for display and saves. */
  readonly scramble: readonly string[] | undefined;
  private readonly _moves: M[];
  private _cursor: number;
  private _state: State;

  constructor(readonly puzzle: Puzzle<M>, init: SessionInit<M> = {}) {
    this.initial = (init.initial ?? puzzle.solved()).slice();
    this.scramble = init.scramble ? [...init.scramble] : undefined;
    this._moves = [...(init.moves ?? [])];
    this._cursor = Math.max(0, Math.min(init.cursor ?? this._moves.length, this._moves.length));
    this._state = applyAll(puzzle, this.initial, this._moves.slice(0, this._cursor));
  }

  get moves(): readonly M[] {
    return this._moves;
  }

  get cursor(): number {
    return this._cursor;
  }

  get state(): State {
    return this._state;
  }

  get canUndo(): boolean {
    return this._cursor > 0;
  }

  get canRedo(): boolean {
    return this._cursor < this._moves.length;
  }

  /** Apply a new move. Drops any moves after the cursor. */
  play(move: M): void {
    this._moves.length = this._cursor;
    this._moves.push(move);
    this._cursor++;
    this._state = this.puzzle.apply(this._state, move);
  }

  /** Step back one move. Returns the inverse move that was applied. */
  undo(): M | null {
    if (!this.canUndo) return null;
    const inverse = this.puzzle.invertMove(this._moves[--this._cursor]);
    this._state = this.puzzle.apply(this._state, inverse);
    return inverse;
  }

  /** Step forward one move. Returns the move that was applied. */
  redo(): M | null {
    if (!this.canRedo) return null;
    const move = this._moves[this._cursor++];
    this._state = this.puzzle.apply(this._state, move);
    return move;
  }

  /** Jump to any point in the history without animation. */
  seek(cursor: number): void {
    this._cursor = Math.max(0, Math.min(cursor, this._moves.length));
    this._state = this.stateAt(this._cursor);
  }

  stateAt(cursor: number): State {
    return applyAll(this.puzzle, this.initial, this._moves.slice(0, cursor));
  }

  moveTokens(): string[] {
    return this._moves.map((m) => this.puzzle.formatMove(m));
  }
}
