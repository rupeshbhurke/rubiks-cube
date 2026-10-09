import { CENTER_FACELETS, CORNER_FACELETS, CORNER_FACES, EDGE_FACELETS, EDGE_FACES, validateCube3 } from '../cube/cube3';
import { CUBE_FACES } from '../cube/faces';
import { getCube } from '../puzzles';
import type { State } from '../types';
import {
  type Cubies,
  FACE_TURNS,
  applyMoves,
  cornerSolved,
  cubiesFromFaces,
  edgeSolved,
  findCorner,
  findEdge,
  moveCubies,
  solvedCubies,
} from './cubies';

/**
 * Plans a solve with the layer-by-layer beginner method, the way it is taught
 * to people: white cross, white corners, middle layer, then the yellow layer in
 * four algorithm stages. Every step comes with a plain-language explanation.
 *
 * The cube is solved with white on the bottom, so the moves never need a
 * whole-cube rotation after the first step. Algorithms that tutorials show
 * "with the cube held so X is in front" are rewritten for the actual face
 * instead (for example R U R' U' becomes B U B' U' for the back-right slot).
 */

export type StageId =
  | 'orient'
  | 'cross'
  | 'corners'
  | 'middle'
  | 'yellowCross'
  | 'yellowEdges'
  | 'yellowCornersPlace'
  | 'yellowCornersTwist';

export interface GuideStage {
  id: StageId;
  title: string;
  /** What the stage achieves and how, for the stage intro. */
  goal: string;
}

export interface GuideStep {
  stage: StageId;
  text: string;
  moves: string[];
  /** Pieces this step works on, each given by its sticker colors (color ids). */
  focus: number[][];
}

export const BEGINNER_STAGES: readonly GuideStage[] = [
  {
    id: 'orient',
    title: 'Hold the cube',
    goal: 'We solve with the white center at the bottom. Turning the whole cube does not change the puzzle.',
  },
  {
    id: 'cross',
    title: 'White cross',
    goal: 'Make a white cross on the bottom. The side color of each white edge must match the center above it.',
  },
  {
    id: 'corners',
    title: 'White corners',
    goal: 'Fill the four bottom corners. Hold the corner above its place and repeat the trick R U R\' U\' (using the face on its right) until it drops in.',
  },
  {
    id: 'middle',
    title: 'Middle layer',
    goal: 'Put the four edges without yellow into the middle layer. Line each one up with its center, then insert it to the left or right.',
  },
  {
    id: 'yellowCross',
    title: 'Yellow cross',
    goal: "Make a yellow cross on top with F R U R' U' F'. A dot becomes an L, an L becomes a line, a line becomes the cross.",
  },
  {
    id: 'yellowEdges',
    title: 'Yellow edges',
    goal: "Match the side colors of the yellow edges with the centers. Hold two matching edges at the back and right, then R U R' U R U2 R' U.",
  },
  {
    id: 'yellowCornersPlace',
    title: 'Place yellow corners',
    goal: "Move each top corner to its place; twisting comes next. Keep a correct corner at front-right and do U R U' L' U R' U' L.",
  },
  {
    id: 'yellowCornersTwist',
    title: 'Twist yellow corners',
    goal: "Turn each top corner until yellow faces up by repeating R' D' R D. Between corners turn only the top. The lower layers look broken until the end; that is expected.",
  },
];

const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;
const LETTERS = 'URFDLB';
const WHITE = CUBE_FACES.findIndex((f) => f.colorName === 'White'); // color id
const RIGHT_OF: Record<number, number> = { [F]: R, [R]: B, [B]: L, [L]: F };
const LEFT_OF: Record<number, number> = { [F]: L, [L]: B, [B]: R, [R]: F };
const OPPOSITE: Record<number, number> = { [F]: B, [B]: F, [R]: L, [L]: R };
/** Top edge position above each side face. */
const TOP_EDGE_OF: Record<number, number> = { [R]: 0, [F]: 1, [L]: 2, [B]: 3 };
const U_TURNS = [[], ['U'], ['U2'], ["U'"]];

const alg = (text: string) => text.split(' ');
const RIGHT_INSERT = alg("U R U' R' U' F' U F");
const LEFT_INSERT = alg("U' L' U L U F U' F'");
const ORIENT_EDGES = alg("F R U R' U' F'");
const SWAP_EDGES = alg("R U R' U R U2 R' U");
const CYCLE_CORNERS = alg("U R U' L' U R' U' L");
const TWIST_CORNER = alg("R' D' R D");

/** Rewrite an algorithm written for the Front face so it works with `front` in front. */
function forFront(moves: readonly string[], front: number): string[] {
  const map: Record<string, number> = { U, D, F: front, R: RIGHT_OF[front], L: LEFT_OF[front], B: OPPOSITE[front] };
  return moves.map((m) => LETTERS[map[m[0]]] + m.slice(1));
}

/** Smallest number of U turns (0-3) after which `test` holds, or -1. */
function uTurnsUntil(c: Cubies, test: (c: Cubies) => boolean): number {
  for (let k = 0; k < 4; k++) if (test(applyMoves(c, U_TURNS[k]))) return k;
  return -1;
}

export function planBeginnerSolve(state: State): GuideStep[] {
  const cube = getCube(3);
  const check = validateCube3(state);
  if (!check.ok) throw new Error(check.errors[0] ?? 'This cube cannot be solved.');

  const steps: GuideStep[] = [];

  // 0. Hold the cube with white at the bottom.
  let s = state;
  const rotation = ['', 'x', "x'", 'x2', 'z', "z'"].find((rot) => {
    const t = rot ? cube.apply(state, cube.parseMove(rot)) : state;
    return t[CENTER_FACELETS[D]] === WHITE;
  })!;
  if (rotation) {
    s = cube.apply(state, cube.parseMove(rotation));
    if (!cube.isSolved(s)) {
      steps.push({ stage: 'orient', text: 'Turn the whole cube so the white center is at the bottom.', moves: [rotation], focus: [] });
    }
  }
  if (cube.isSolved(s)) return [];

  const faceColor = CENTER_FACELETS.map((i) => s[i]);
  const name = (face: number) => CUBE_FACES[faceColor[face]].colorName.toLowerCase();
  const edgeColors = (p: number) => EDGE_FACES[p].map((f) => faceColor[f]);
  const cornerColors = (p: number) => CORNER_FACES[p].map((f) => faceColor[f]);
  const edgeName = (p: number) => EDGE_FACES[p].map(name).join('–');
  const cornerName = (p: number) => CORNER_FACES[p].map(name).join('–');

  let c = cubiesFromFaces(Array.from(s, (color) => faceColor.indexOf(color)))!;
  const push = (stage: StageId, text: string, moves: string[], focus: number[][] = []) => {
    if (moves.length === 0) return;
    steps.push({ stage, text, moves, focus });
    c = applyMoves(c, moves);
  };
  const turnTop = (k: number) => U_TURNS[k];
  const expect = (ok: boolean, stage: StageId) => {
    if (!ok) throw new Error(`Internal error: stage "${stage}" did not finish`);
  };

  // 1. White cross.
  const crossDone: number[] = [4, 5, 6, 7].filter((p) => edgeSolved(c, p));
  while (crossDone.length < 4) {
    const remaining = [4, 5, 6, 7].filter((p) => !crossDone.includes(p));
    const next = remaining.reduce((best, p) => (edgeDistance(c, p) < edgeDistance(c, best) ? p : best));
    const moves = solveEdges(c, [...crossDone, next]);
    const color = name(EDGE_FACES[next][1]);
    push('cross', `Place the white–${color} edge between the white and ${color} centers, keeping the edges already placed.`, moves, [edgeColors(next)]);
    crossDone.push(next);
  }

  expect([4, 5, 6, 7].every((p) => edgeSolved(c, p)), 'cross');

  // 2. White corners: X U X' U' lifts the corner out of a slot and drops it back in.
  const SLOT_FACE: Record<number, number> = { 4: R, 5: F, 6: L, 7: B };
  const trick = (slot: number) => forFront(alg("R U R' U'"), LEFT_OF[SLOT_FACE[slot]]);
  for (let guard = 0; guard < 12; guard++) {
    const todo = [4, 5, 6, 7].filter((p) => !cornerSolved(c, p));
    if (todo.length === 0) break;
    const p = todo.find((q) => findCorner(c, q).pos < 4) ?? todo[0];
    const focus = [cornerColors(p)];
    const pos = findCorner(c, p).pos;
    if (pos >= 4 && pos !== p) {
      push('corners', `The ${cornerName(p)} corner is stuck in the wrong bottom slot. Lift it out with ${trick(pos).join(' ')}.`, trick(pos), focus);
    }
    if (findCorner(c, p).pos < 4) {
      const k = uTurnsUntil(c, (cc) => findCorner(cc, p).pos === p - 4);
      push('corners', `Turn the top so the ${cornerName(p)} corner sits right above its place.`, turnTop(k), focus);
    }
    const moves: string[] = [];
    for (let n = 0; n < 6 && !cornerSolved(applyMoves(c, moves), p); n++) moves.push(...trick(p));
    const times = moves.length / 4;
    push(
      'corners',
      `Repeat ${trick(p).join(' ')} until the ${cornerName(p)} corner drops in with white facing down (${times} time${times === 1 ? '' : 's'}).`,
      moves,
      focus,
    );
  }

  expect([4, 5, 6, 7].every((p) => cornerSolved(c, p)), 'corners');

  // 3. Middle layer.
  const SLOT_FRONT: Record<number, number> = { 8: F, 9: L, 10: B, 11: R };
  for (let guard = 0; guard < 16; guard++) {
    const todo = [8, 9, 10, 11].filter((p) => !edgeSolved(c, p));
    if (todo.length === 0) break;
    const top = todo.find((p) => findEdge(c, p).pos < 4);
    if (top === undefined) {
      const p = todo[0];
      const moves = forFront(RIGHT_INSERT, SLOT_FRONT[findEdge(c, p).pos]);
      push('middle', `The ${edgeName(p)} edge is in the wrong slot or flipped. Push it out by inserting a top edge there: ${moves.join(' ')}.`, moves, [edgeColors(p)]);
      continue;
    }
    const { ori } = findEdge(c, top);
    const [a, b] = EDGE_FACES[top];
    const up = ori ? b : a;
    const side = ori ? a : b;
    const focus = [edgeColors(top)];
    const k = uTurnsUntil(c, (cc) => findEdge(cc, top).pos === TOP_EDGE_OF[side]);
    push('middle', `Turn the top until the ${name(side)} side of the ${edgeName(top)} edge sits above the ${name(side)} center.`, turnTop(k), focus);
    const right = RIGHT_OF[side] === up;
    const moves = forFront(right ? RIGHT_INSERT : LEFT_INSERT, side);
    push(
      'middle',
      `Insert the ${edgeName(top)} edge to the ${right ? 'right' : 'left'}, where its ${name(up)} side belongs (with ${name(side)} as the front): ${moves.join(' ')}.`,
      moves,
      focus,
    );
  }

  expect([4, 5, 6, 7, 8, 9, 10, 11].every((p) => edgeSolved(c, p)), 'middle');

  // 4. Yellow cross.
  for (let guard = 0; guard < 8; guard++) {
    const good = [0, 1, 2, 3].filter((i) => c.eo[i] === 0);
    if (good.length === 4) break;
    const topEdges = [0, 1, 2, 3].map((i) => edgeColors(c.ep[i]));
    if (good.length === 0) {
      push('yellowCross', `Yellow dot (no yellow edges on top). Do ${ORIENT_EDGES.join(' ')}.`, ORIENT_EDGES, topEdges);
      continue;
    }
    const line = (good.includes(0) && good.includes(2)) || (good.includes(1) && good.includes(3));
    const k = line
      ? uTurnsUntil(c, (cc) => cc.eo[0] === 0 && cc.eo[2] === 0)
      : uTurnsUntil(c, (cc) => cc.eo[2] === 0 && cc.eo[3] === 0);
    push('yellowCross', line ? 'Turn the top so the yellow line runs left to right.' : 'Turn the top so the yellow L points to the back and left.', turnTop(k), topEdges);
    push('yellowCross', `${line ? 'Yellow line' : 'Yellow L'}: do ${ORIENT_EDGES.join(' ')}.`, ORIENT_EDGES, topEdges);
  }

  expect([0, 1, 2, 3].every((i) => c.eo[i] === 0), 'yellowCross');

  // 5. Yellow edges match their centers.
  const matched = (cc: Cubies) => [0, 1, 2, 3].filter((i) => cc.ep[i] === i);
  for (let guard = 0; guard < 8; guard++) {
    const topEdges = [0, 1, 2, 3].map((i) => edgeColors(c.ep[i]));
    const all = uTurnsUntil(c, (cc) => matched(cc).length === 4);
    if (all >= 0) {
      push('yellowEdges', 'Turn the top so every yellow edge matches its center.', turnTop(all), topEdges);
      break;
    }
    // Some turn of the top always lines up at least two edges.
    const two = uTurnsUntil(c, (cc) => matched(cc).length >= 2);
    push('yellowEdges', 'Turn the top so two yellow edges match their centers.', turnTop(two), topEdges);
    const pair = matched(c);
    // Tutorials turn the whole cube so the pair is at the back and right; we pick that face as the front instead.
    const front = [F, R, B, L].find((f) => pair.includes(TOP_EDGE_OF[OPPOSITE[f]]) && pair.includes(TOP_EDGE_OF[RIGHT_OF[f]]));
    if (front !== undefined) {
      const moves = forFront(SWAP_EDGES, front);
      push('yellowEdges', `The matching edges are neighbors. With ${name(front)} as the front they sit at the back and right, so do ${moves.join(' ')}.`, moves, topEdges);
    } else {
      push('yellowEdges', `The matching edges are opposite each other. Do ${SWAP_EDGES.join(' ')} once to make two neighbors match.`, SWAP_EDGES, topEdges);
    }
  }

  expect([0, 1, 2, 3].every((i) => c.ep[i] === i), 'yellowEdges');

  // 6. Yellow corners to their places.
  const fixedCorner = (front: number) => {
    const m = applyMoves(solvedCubies(), forFront(CYCLE_CORNERS, front));
    return [0, 1, 2, 3].find((i) => m.cp[i] === i)!;
  };
  for (let guard = 0; guard < 8; guard++) {
    const correct = [0, 1, 2, 3].filter((i) => c.cp[i] === i);
    if (correct.length === 4) break;
    const front = correct.length > 0 ? [F, R, B, L].find((f) => fixedCorner(f) === correct[0])! : F;
    const moves = forFront(CYCLE_CORNERS, front);
    const corners = [0, 1, 2, 3].map((i) => cornerColors(c.cp[i]));
    push(
      'yellowCornersPlace',
      correct.length > 0
        ? `The ${cornerName(correct[0])} corner is in its place. Keep it at the front-right (with ${name(front)} as the front) and do ${moves.join(' ')}.`
        : `No top corner is in its place yet. Do ${moves.join(' ')} once; then one will be.`,
      moves,
      corners,
    );
  }

  expect([0, 1, 2, 3].every((i) => c.cp[i] === i), 'yellowCornersPlace');

  // 7. Twist the yellow corners.
  for (let guard = 0; guard < 8; guard++) {
    if ([0, 1, 2, 3].every((i) => c.co[i] === 0)) break;
    if (c.co[0] === 0) {
      const k = uTurnsUntil(c, (cc) => cc.co[0] !== 0);
      const nextCorner = applyMoves(c, turnTop(k)).cp[0];
      push('yellowCornersTwist', 'Turn only the top (U) to bring the next unfinished corner to the front-right.', turnTop(k), [cornerColors(nextCorner)]);
    }
    const piece = c.cp[0];
    const focus = [cornerColors(piece)];
    // The corner leaves the top between repeats, so wait until this same corner is back with yellow up.
    const done = (cc: Cubies) => cc.cp[0] === piece && cc.co[0] === 0;
    const moves: string[] = [];
    for (let n = 0; n < 6 && !done(applyMoves(c, moves)); n++) moves.push(...TWIST_CORNER);
    const times = moves.length / 4;
    push('yellowCornersTwist', `Repeat ${TWIST_CORNER.join(' ')} until yellow faces up on the front-right corner (${times} times).`, moves, focus);
  }
  const finish = uTurnsUntil(c, isSolved);
  expect(finish >= 0, 'yellowCornersTwist');
  push('yellowCornersTwist', 'Turn the top to finish the cube.', turnTop(finish));
  return steps;
}

function isSolved(c: Cubies): boolean {
  return c.cp.every((p, i) => p === i && c.co[i] === 0) && c.ep.every((p, i) => p === i && c.eo[i] === 0);
}

/* ---------- Small search for the cross ---------- */

/** next[move][pos * 2 + ori] = where an edge there goes. */
let edgeNext: number[][] | null = null;
/** dist[piece][pos * 2 + ori] = face turns needed to solve that edge alone. */
let edgeDist: number[][] | null = null;

function tables(): { next: number[][]; dist: number[][] } {
  if (!edgeNext || !edgeDist) {
    edgeNext = FACE_TURNS.map((t) => {
      const m = moveCubies(t);
      const next = new Array(24);
      m.ep.forEach((from, to) => {
        for (const ori of [0, 1]) next[from * 2 + ori] = to * 2 + ((ori + m.eo[to]) % 2);
      });
      return next;
    });
    edgeDist = [...Array(12).keys()].map((piece) => {
      const dist = new Array(24).fill(-1);
      dist[piece * 2] = 0;
      const queue = [piece * 2];
      while (queue.length) {
        const s = queue.shift()!;
        for (const next of edgeNext!) {
          if (dist[next[s]] < 0) {
            dist[next[s]] = dist[s] + 1;
            queue.push(next[s]);
          }
        }
      }
      return dist;
    });
  }
  return { next: edgeNext, dist: edgeDist };
}

function edgeDistance(c: Cubies, piece: number): number {
  const { pos, ori } = findEdge(c, piece);
  return tables().dist[piece][pos * 2 + ori];
}

/** Shortest face-turn sequence that solves all `pieces` (edges) at once. IDA*. */
function solveEdges(c: Cubies, pieces: number[]): string[] {
  const { next, dist } = tables();
  const start = pieces.map((p) => {
    const { pos, ori } = findEdge(c, p);
    return pos * 2 + ori;
  });
  const h = (states: number[]) => Math.max(...states.map((s, i) => dist[pieces[i]][s]));
  const path: number[] = [];

  const dfs = (states: number[], budget: number, lastFace: number): boolean => {
    const est = h(states);
    if (est === 0) return true;
    if (est > budget) return false;
    for (let m = 0; m < FACE_TURNS.length; m++) {
      const face = Math.floor(m / 3);
      // Skip turning the same face twice, and fix the order of opposite faces.
      if (face === lastFace || (lastFace >= 0 && face === (lastFace + 3) % 6 && face < lastFace)) continue;
      path.push(m);
      if (dfs(states.map((s) => next[m][s]), budget - 1, face)) return true;
      path.pop();
    }
    return false;
  };

  for (let budget = 0; budget <= 12; budget++) {
    if (dfs(start, budget, -1)) return path.map((m) => FACE_TURNS[m]);
  }
  throw new Error('Internal error: cross search failed');
}

/**
 * Sticker indices of the piece with exactly these colors (color ids), or an
 * empty list when there is no such piece. 3x3x3 states only.
 */
export function findPieceStickers(state: State, colors: readonly number[]): number[] {
  const want = [...colors].sort().join();
  const groups: readonly (readonly number[])[] = colors.length === 3 ? CORNER_FACELETS : colors.length === 2 ? EDGE_FACELETS : [];
  const match = groups.find((g) => g.map((i) => state[i]).sort().join() === want);
  return match ? [...match] : [];
}
