import { FACE_LETTERS } from './geometry';
import { CUBE_FACES } from './faces';
import { type State, type ValidationResult, UNKNOWN_COLOR } from '../types';

/**
 * 3x3x3-specific piece tables (Kociemba facelet numbering: U=0..8, R=9..17,
 * F=18..26, D=27..35, L=36..44, B=45..53) and full solvability checks.
 */

export const CENTER_FACELETS = [4, 13, 22, 31, 40, 49] as const;

const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;

export const CORNER_FACELETS: readonly (readonly [number, number, number])[] = [
  [8, 9, 20], // URF
  [6, 18, 38], // UFL
  [0, 36, 47], // ULB
  [2, 45, 11], // UBR
  [29, 26, 15], // DFR
  [27, 44, 24], // DLF
  [33, 53, 42], // DBL
  [35, 17, 51], // DRB
];

export const CORNER_FACES: readonly (readonly [number, number, number])[] = [
  [U, R, F], [U, F, L], [U, L, B], [U, B, R],
  [D, F, R], [D, L, F], [D, B, L], [D, R, B],
];

export const EDGE_FACELETS: readonly (readonly [number, number])[] = [
  [5, 10], // UR
  [7, 19], // UF
  [3, 37], // UL
  [1, 46], // UB
  [32, 16], // DR
  [28, 25], // DF
  [30, 43], // DL
  [34, 52], // DB
  [23, 12], // FR
  [21, 41], // FL
  [50, 39], // BL
  [48, 14], // BR
];

export const EDGE_FACES: readonly (readonly [number, number])[] = [
  [U, R], [U, F], [U, L], [U, B], [D, R], [D, F],
  [D, L], [D, B], [F, R], [F, L], [B, L], [B, R],
];

const FACE_NAMES = ['Up', 'Right', 'Front', 'Down', 'Left', 'Back'];

function positionName(faces: readonly number[]): string {
  return faces.map((f) => FACE_NAMES[f]).join('-');
}

/**
 * Map each color id to the face whose center currently shows it, so states
 * reached with slice moves or whole-cube rotations still read as standard.
 * Returns null when the centers are not six distinct known colors.
 */
function centerRelabel(state: State): Map<number, number> | null {
  const map = new Map<number, number>();
  CENTER_FACELETS.forEach((idx, face) => map.set(state[idx], face));
  if (map.size !== 6 || map.has(UNKNOWN_COLOR)) return null;
  return map;
}

/** Facelet string with letters assigned by center color, as solvers expect. */
export function toKociembaFacelets(state: State): string {
  const map = centerRelabel(state);
  if (!map) throw new Error('Centers must be six different colors');
  return Array.from(state, (c) => {
    const face = map.get(c);
    if (face === undefined) throw new Error('Sticker color does not match any center');
    return FACE_LETTERS[face];
  }).join('');
}

function parity(perm: number[]): number {
  let p = 0;
  const seen = new Array(perm.length).fill(false);
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true;
      len++;
    }
    p ^= (len - 1) & 1;
  }
  return p;
}

export function validateCube3(state: State): ValidationResult {
  const errors: string[] = [];
  const unknown = state.filter((c) => c === UNKNOWN_COLOR).length;
  if (unknown > 0) {
    errors.push(`${unknown} sticker${unknown === 1 ? ' is' : 's are'} not painted yet.`);
    return { ok: false, errors, warnings: [] };
  }

  const counts = new Map<number, number>();
  state.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
  for (const [color, count] of counts) {
    if (count !== 9) errors.push(`${CUBE_FACES[color]?.colorName ?? 'A color'} appears ${count} times; every color needs exactly 9.`);
  }
  const map = centerRelabel(state);
  if (!map) errors.push('The six centers must all be different colors.');
  if (errors.length > 0 || !map) return { ok: false, errors, warnings: [] };

  const f = Array.from(state, (c) => map.get(c)!);

  const cp: number[] = [];
  let twist = 0;
  CORNER_FACELETS.forEach((facelets, pos) => {
    const ori = facelets.findIndex((i) => f[i] === U || f[i] === D);
    const c1 = ori < 0 ? -1 : f[facelets[(ori + 1) % 3]];
    const c2 = ori < 0 ? -1 : f[facelets[(ori + 2) % 3]];
    const piece = CORNER_FACES.findIndex((faces) => faces[1] === c1 && faces[2] === c2);
    if (piece < 0) {
      errors.push(`The ${positionName(CORNER_FACES[pos])} corner has a color combination that does not exist.`);
      return;
    }
    cp.push(piece);
    twist += ori;
  });

  const ep: number[] = [];
  let flip = 0;
  EDGE_FACELETS.forEach(([a, b], pos) => {
    let piece = EDGE_FACES.findIndex(([x, y]) => x === f[a] && y === f[b]);
    let ori = 0;
    if (piece < 0) {
      piece = EDGE_FACES.findIndex(([x, y]) => x === f[b] && y === f[a]);
      ori = 1;
    }
    if (piece < 0) {
      errors.push(`The ${positionName(EDGE_FACES[pos])} edge has a color combination that does not exist.`);
      return;
    }
    ep.push(piece);
    flip += ori;
  });
  if (errors.length > 0) return { ok: false, errors, warnings: [] };

  if (new Set(cp).size !== 8) errors.push('The same corner piece appears more than once.');
  if (new Set(ep).size !== 12) errors.push('The same edge piece appears more than once.');
  if (errors.length > 0) return { ok: false, errors, warnings: [] };

  if (twist % 3 !== 0) errors.push('A corner is twisted in place. Check the corner sticker colors.');
  if (flip % 2 !== 0) errors.push('An edge is flipped in place. Check the edge sticker colors.');
  if (parity(cp) !== parity(ep)) errors.push('Two pieces are swapped. Check for two edges or two corners painted the wrong way round.');

  return { ok: errors.length === 0, errors, warnings: [] };
}
