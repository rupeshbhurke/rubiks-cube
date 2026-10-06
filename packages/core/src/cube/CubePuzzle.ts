import { type Axis, type StickerGeometry, buildStickers, layerOf, rotateQuarter } from './geometry';
import { validateCube3 } from './cube3';
import { CUBE_FACES } from './faces';
import {
  type Puzzle,
  type PuzzleDescriptor,
  type State,
  type ValidationResult,
  NotationError,
  UNKNOWN_COLOR,
} from '../types';

/**
 * A layer turn: layers `lo..hi` (0 = most negative along `axis`) rotate by
 * `turns` quarter turns, counter-clockwise when looking from the positive end
 * of the axis (right-hand rule). Always normalized to -1, 1 or 2.
 */
export interface CubeMove {
  axis: Axis;
  lo: number;
  hi: number;
  turns: number;
}

export { CUBE_FACES };

/** Face letter -> axis and whether the face is at the positive end. */
const FACE_AXIS: Record<string, { axis: Axis; positive: boolean }> = {
  R: { axis: 0, positive: true },
  L: { axis: 0, positive: false },
  U: { axis: 1, positive: true },
  D: { axis: 1, positive: false },
  F: { axis: 2, positive: true },
  B: { axis: 2, positive: false },
};

const MOVE_RE = /^(\d*)([URFDLBurfdlbMESxyz])(w?)(\d*)(')?$/;

export function normalizeTurns(turns: number): number {
  const q = ((turns % 4) + 4) % 4;
  return q === 3 ? -1 : q;
}

export class CubePuzzle implements Puzzle<CubeMove> {
  readonly descriptor: PuzzleDescriptor;
  readonly id: string;
  readonly name: string;
  readonly faces = CUBE_FACES;
  readonly stickers: readonly StickerGeometry[];
  readonly stickerCount: number;

  private readonly index = new Map<string, number>();
  private readonly permCache = new Map<string, Uint16Array>();

  constructor(readonly n: number) {
    if (!Number.isInteger(n) || n < 2 || n > 10) throw new Error(`Unsupported cube size ${n}`);
    this.descriptor = { kind: 'cube', size: n };
    this.id = `cube${n}`;
    this.name = `${n}x${n}x${n}`;
    this.stickers = buildStickers(n);
    this.stickerCount = this.stickers.length;
    this.stickers.forEach((s, i) => this.index.set(key(s.cubie, s.normal), i));
  }

  solved(): State {
    return Uint8Array.from(this.stickers, (s) => s.face);
  }

  isSolved(state: State): boolean {
    const per = this.n * this.n;
    for (let face = 0; face < 6; face++) {
      const first = state[face * per];
      if (first === UNKNOWN_COLOR) return false;
      for (let i = 1; i < per; i++) if (state[face * per + i] !== first) return false;
    }
    return true;
  }

  /** Index of the single fixed center sticker of a face (odd sizes only). */
  isFixedCenter(sticker: number): boolean {
    if (this.n % 2 === 0) return false;
    const s = this.stickers[sticker];
    const mid = (this.n - 1) / 2;
    return s.row === mid && s.col === mid;
  }

  /** Stickers whose cubie lies in layers lo..hi along an axis. */
  inLayer(sticker: number, axis: Axis, lo: number, hi: number): boolean {
    const layer = layerOf(this.stickers[sticker].cubie[axis], this.n);
    return layer >= lo && layer <= hi;
  }

  apply(state: State, move: CubeMove): State {
    const q = ((move.turns % 4) + 4) % 4;
    let out = state;
    if (q === 0) return state.slice();
    const perm = this.quarterPerm(move.axis, move.lo, move.hi);
    for (let k = 0; k < q; k++) {
      const next = new Uint8Array(out.length);
      for (let j = 0; j < next.length; j++) next[j] = out[perm[j]];
      out = next;
    }
    return out;
  }

  /** perm[target] = source for one +90 degree turn of the given layers. */
  private quarterPerm(axis: Axis, lo: number, hi: number): Uint16Array {
    const cacheKey = `${axis}:${lo}:${hi}`;
    let perm = this.permCache.get(cacheKey);
    if (perm) return perm;
    perm = new Uint16Array(this.stickerCount);
    this.stickers.forEach((s, i) => {
      const layer = layerOf(s.cubie[axis], this.n);
      if (layer < lo || layer > hi) {
        perm![i] = i;
        return;
      }
      const target = this.index.get(key(rotateQuarter(s.cubie, axis), rotateQuarter(s.normal, axis)));
      if (target === undefined) throw new Error('Internal error: rotation left the cube');
      perm![target] = i;
    });
    this.permCache.set(cacheKey, perm);
    return perm;
  }

  parseMove(token: string): CubeMove {
    const n = this.n;
    const m = MOVE_RE.exec(token.trim().replace(/[’′]/g, "'"));
    if (!m) throw new NotationError(token);
    const [, prefixStr, letter, w, amountStr, prime] = m;
    const amount = amountStr ? Number(amountStr) : 1;
    let axis: Axis;
    let lo: number;
    let hi: number;
    let cw: number;

    if ('xyz'.includes(letter)) {
      if (prefixStr || w) throw new NotationError(token);
      axis = 'xyz'.indexOf(letter) as Axis;
      lo = 0;
      hi = n - 1;
      cw = -1;
    } else if ('MES'.includes(letter)) {
      if (prefixStr || w) throw new NotationError(token);
      if (n < 3) throw new NotationError(token, `slice moves need a cube of size 3 or more`);
      axis = 'MES'.indexOf(letter) as Axis;
      lo = 1;
      hi = n - 2;
      cw = letter === 'S' ? -1 : 1; // M follows L, E follows D, S follows F
    } else {
      const face = letter.toUpperCase();
      const lower = letter !== face;
      if (lower && w) throw new NotationError(token);
      const wide = lower || w === 'w';
      const prefix = prefixStr ? Number(prefixStr) : undefined;
      const from = wide ? 1 : (prefix ?? 1);
      const to = wide ? (prefix ?? 2) : (prefix ?? 1);
      if (from < 1 || to > n) throw new NotationError(token, `layer out of range for ${this.name}`);
      const info = FACE_AXIS[face];
      axis = info.axis;
      if (info.positive) {
        lo = n - to;
        hi = n - from;
        cw = -1;
      } else {
        lo = from - 1;
        hi = to - 1;
        cw = 1;
      }
    }
    const turns = normalizeTurns(cw * amount * (prime ? -1 : 1));
    if (turns === 0) throw new NotationError(token, 'move does nothing');
    return { axis, lo, hi, turns };
  }

  formatMove(move: CubeMove): string {
    const { axis, lo, hi } = move;
    const n = this.n;
    const q = normalizeTurns(move.turns);
    if (q === 0) throw new Error('Cannot format a move that does nothing');
    const suffix = (cw: number) => {
      const c = normalizeTurns(q * cw);
      return c === 1 ? '' : c === 2 ? '2' : "'";
    };
    const posFace = 'RUF'[axis];
    const negFace = 'LDB'[axis];

    if (lo === 0 && hi === n - 1) return 'xyz'[axis] + suffix(-1);
    if (n >= 3 && lo === 1 && hi === n - 2) return 'MES'[axis] + suffix(axis === 2 ? -1 : 1);
    if (hi === n - 1) return block(n - lo, posFace) + suffix(-1);
    if (lo === 0) return block(hi + 1, negFace) + suffix(1);
    if (lo === hi) {
      const fromPos = n - lo;
      const fromNeg = lo + 1;
      return fromPos <= fromNeg ? `${fromPos}${posFace}${suffix(-1)}` : `${fromNeg}${negFace}${suffix(1)}`;
    }
    throw new Error(`No notation for layers ${lo}-${hi} on axis ${axis}`);
  }

  invertMove(move: CubeMove): CubeMove {
    return { ...move, turns: normalizeTurns(-move.turns) };
  }

  scramble(random: () => number = Math.random): CubeMove[] {
    const n = this.n;
    const length = n === 2 ? 11 : n === 3 ? 22 : 20 * (n - 2);
    const maxDepth = n <= 3 ? 1 : Math.floor(n / 2);
    const moves: CubeMove[] = [];
    let lastAxis = -1;
    while (moves.length < length) {
      const axis = Math.floor(random() * 3) as Axis;
      if (axis === lastAxis) continue;
      const depth = 1 + Math.floor(random() * maxDepth);
      const positive = random() < 0.5;
      const turns = [1, 2, -1][Math.floor(random() * 3)];
      moves.push(positive ? { axis, lo: n - depth, hi: n - 1, turns } : { axis, lo: 0, hi: depth - 1, turns });
      lastAxis = axis;
    }
    return moves;
  }

  validate(state: State): ValidationResult {
    if (state.length !== this.stickerCount) {
      return { ok: false, errors: ['Wrong number of stickers.'], warnings: [] };
    }
    if (this.n === 3) return validateCube3(state);

    const errors: string[] = [];
    const unknown = state.filter((c) => c === UNKNOWN_COLOR).length;
    if (unknown > 0) errors.push(`${unknown} sticker${unknown === 1 ? ' is' : 's are'} not painted yet.`);
    const per = this.n * this.n;
    for (let color = 0; color < 6; color++) {
      const count = state.filter((c) => c === color).length;
      if (unknown === 0 && count !== per) {
        errors.push(`${this.faces[color].colorName} appears ${count} times; it needs exactly ${per}.`);
      }
    }
    return {
      ok: errors.length === 0,
      errors,
      warnings: ['Full solvability checks are only available for 3x3x3. Color counts were checked.'],
    };
  }
}

function key(a: readonly number[], b: readonly number[]): string {
  return `${a.join(',')}|${b.join(',')}`;
}

function block(depth: number, face: string): string {
  return depth === 1 ? face : depth === 2 ? `${face}w` : `${depth}${face}w`;
}
