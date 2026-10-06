import { CORNER_FACELETS, CORNER_FACES, EDGE_FACELETS, EDGE_FACES } from '../cube/cube3';
import { getCube } from '../puzzles';

/**
 * A 3x3x3 described by its pieces instead of its stickers (Kociemba's cubie
 * model). Position i holds corner `cp[i]` twisted by `co[i]` (0-2), and edge
 * `ep[i]` flipped by `eo[i]` (0-1). Positions and pieces use the indices of
 * CORNER_FACELETS and EDGE_FACELETS: corners URF UFL ULB UBR DFR DLF DBL DRB,
 * edges UR UF UL UB DR DF DL DB FR FL BL BR.
 */
export interface Cubies {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

const U = 0;
const D = 3;

/**
 * Read pieces from stickers given as face indices (0-5 = U R F D L B, i.e.
 * already relabeled by center color). Returns null for impossible pieces.
 */
export function cubiesFromFaces(f: ArrayLike<number>): Cubies | null {
  const c: Cubies = { cp: [], co: [], ep: [], eo: [] };
  for (const facelets of CORNER_FACELETS) {
    const ori = facelets.findIndex((i) => f[i] === U || f[i] === D);
    if (ori < 0) return null;
    const c1 = f[facelets[(ori + 1) % 3]];
    const c2 = f[facelets[(ori + 2) % 3]];
    const piece = CORNER_FACES.findIndex((faces) => faces[1] === c1 && faces[2] === c2);
    if (piece < 0) return null;
    c.cp.push(piece);
    c.co.push(ori);
  }
  for (const [a, b] of EDGE_FACELETS) {
    let piece = EDGE_FACES.findIndex(([x, y]) => x === f[a] && y === f[b]);
    let ori = 0;
    if (piece < 0) {
      piece = EDGE_FACES.findIndex(([x, y]) => x === f[b] && y === f[a]);
      ori = 1;
    }
    if (piece < 0) return null;
    c.ep.push(piece);
    c.eo.push(ori);
  }
  return c;
}

export function solvedCubies(): Cubies {
  return { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: new Array(8).fill(0), ep: [...Array(12).keys()], eo: new Array(12).fill(0) };
}

/** `a` followed by `m`. */
export function multiply(a: Cubies, m: Cubies): Cubies {
  return {
    cp: m.cp.map((p) => a.cp[p]),
    co: m.cp.map((p, i) => (a.co[p] + m.co[i]) % 3),
    ep: m.ep.map((p) => a.ep[p]),
    eo: m.ep.map((p, i) => (a.eo[p] + m.eo[i]) % 2),
  };
}

export const FACE_TURNS = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, `${f}2`, `${f}'`]);

let moveTable: Map<string, Cubies> | null = null;

/** Piece effect of each face turn, derived from the sticker model so both always agree. */
export function moveCubies(token: string): Cubies {
  if (!moveTable) {
    const cube = getCube(3);
    moveTable = new Map(
      FACE_TURNS.map((t) => [t, cubiesFromFaces(cube.apply(cube.solved(), cube.parseMove(t)))!]),
    );
  }
  const m = moveTable.get(token);
  if (!m) throw new Error(`Not a face turn: ${token}`);
  return m;
}

export function applyMoves(c: Cubies, tokens: readonly string[]): Cubies {
  return tokens.reduce((acc, t) => multiply(acc, moveCubies(t)), c);
}

/** Position and twist of a corner piece. */
export function findCorner(c: Cubies, piece: number): { pos: number; ori: number } {
  const pos = c.cp.indexOf(piece);
  return { pos, ori: c.co[pos] };
}

/** Position and flip of an edge piece. */
export function findEdge(c: Cubies, piece: number): { pos: number; ori: number } {
  const pos = c.ep.indexOf(piece);
  return { pos, ori: c.eo[pos] };
}

export function cornerSolved(c: Cubies, piece: number): boolean {
  return c.cp[piece] === piece && c.co[piece] === 0;
}

export function edgeSolved(c: Cubies, piece: number): boolean {
  return c.ep[piece] === piece && c.eo[piece] === 0;
}
