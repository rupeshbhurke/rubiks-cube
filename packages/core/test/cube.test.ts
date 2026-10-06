import { describe, expect, it } from 'vitest';
import Cube from '../src/solver/vendor/solve.js';
import { CORNER_FACELETS, CORNER_FACES, EDGE_FACELETS, EDGE_FACES } from '../src/cube/cube3';
import {
  CUBE_SIZES,
  UNKNOWN_COLOR,
  applyAll,
  getCube,
  parseAlg,
  stateToFacelets,
  statesEqual,
  toKociembaFacelets,
} from '../src';

const cube3 = getCube(3);

function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe('3x3x3 model', () => {
  it('uses the Kociemba facelet layout', () => {
    const solved = cube3.solved();
    CORNER_FACELETS.forEach((f, i) => expect(f.map((x) => solved[x])).toEqual([...CORNER_FACES[i]]));
    EDGE_FACELETS.forEach((f, i) => expect(f.map((x) => solved[x])).toEqual([...EDGE_FACES[i]]));
  });

  it.each(['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'B', "B'", 'B2'])(
    'face move %s matches cubejs',
    (token) => {
      const ours = stateToFacelets(cube3, cube3.apply(cube3.solved(), cube3.parseMove(token)));
      expect(ours).toBe(new Cube().move(token).asString());
    },
  );

  it('matches cubejs on a long algorithm', () => {
    const alg = "R U R' U' F2 D L' B2 U' R2 F' L D2 B R' U2 F";
    expect(stateToFacelets(cube3, applyAll(cube3, cube3.solved(), parseAlg(cube3, alg)))).toBe(
      new Cube().move(alg).asString(),
    );
  });

  it.each([
    ['x', "R M' L'"],
    ['y', "U E' D'"],
    ['z', "F S B'"],
    ['r', "R M'"],
    ['Rw', "R M'"],
    ['u', "U E'"],
    ['f', 'F S'],
  ])('%s equals %s', (a, b) => {
    const s = cube3.solved();
    expect(statesEqual(applyAll(cube3, s, parseAlg(cube3, a)), applyAll(cube3, s, parseAlg(cube3, b)))).toBe(true);
  });

  it('detects solved independent of orientation', () => {
    expect(cube3.isSolved(applyAll(cube3, cube3.solved(), parseAlg(cube3, "x y2 z'")))).toBe(true);
    expect(cube3.isSolved(applyAll(cube3, cube3.solved(), parseAlg(cube3, 'M')))).toBe(false);
  });
});

describe.each(CUBE_SIZES)('%ix%i cube', (n) => {
  const p = getCube(n);

  it('every single-layer quarter turn has order 4', () => {
    for (const axis of [0, 1, 2] as const) {
      for (let layer = 0; layer < n; layer++) {
        const move = { axis, lo: layer, hi: layer, turns: 1 };
        let s = p.solved();
        for (let k = 0; k < 3; k++) {
          s = p.apply(s, move);
          expect(statesEqual(s, p.solved())).toBe(false);
        }
        expect(statesEqual(p.apply(s, move), p.solved())).toBe(true);
      }
    }
  });

  it('format and parse round-trip for every layer move', () => {
    for (const axis of [0, 1, 2] as const) {
      for (let layer = 0; layer < n; layer++) {
        for (const turns of [1, -1, 2]) {
          const move = { axis, lo: layer, hi: layer, turns };
          expect(p.parseMove(p.formatMove(move))).toEqual(move);
        }
      }
    }
  });

  it('scramble followed by its inverse returns to solved', () => {
    const scramble = p.scramble(seeded(n));
    const s = applyAll(p, p.solved(), scramble);
    expect(p.isSolved(s)).toBe(false);
    const back = applyAll(p, s, [...scramble].reverse().map((m) => p.invertMove(m)));
    expect(statesEqual(back, p.solved())).toBe(true);
    for (const m of scramble) expect(p.parseMove(p.formatMove(m))).toEqual(m);
  });

  it('validates color counts', () => {
    expect(p.validate(p.solved()).ok).toBe(true);
    const s = p.solved();
    s[0] = UNKNOWN_COLOR;
    expect(p.validate(s).ok).toBe(false);
  });
});

describe('notation', () => {
  it('rejects bad tokens', () => {
    for (const t of ['Q', 'R3w2x', 'Mw', '2x', '4R']) expect(() => cube3.parseMove(t)).toThrow();
    expect(() => getCube(2).parseMove('M')).toThrow();
  });

  it('parses big-cube notation', () => {
    const c5 = getCube(5);
    expect(c5.parseMove('3Rw')).toEqual({ axis: 0, lo: 2, hi: 4, turns: -1 });
    expect(c5.parseMove("2L'")).toEqual({ axis: 0, lo: 1, hi: 1, turns: -1 });
    expect(c5.parseMove('M')).toEqual({ axis: 0, lo: 1, hi: 3, turns: 1 });
    expect(c5.formatMove({ axis: 1, lo: 3, hi: 3, turns: -1 })).toBe('2U');
  });
});

describe('3x3x3 validation', () => {
  const swap = (s: Uint8Array, a: number, b: number) => ([s[a], s[b]] = [s[b], s[a]]);

  it('accepts scrambled and rotated states', () => {
    const s = applyAll(cube3, cube3.solved(), parseAlg(cube3, "R U M' x F2 E S' y"));
    expect(cube3.validate(s)).toMatchObject({ ok: true });
    expect(toKociembaFacelets(s)).toHaveLength(54);
  });

  it('rejects a twisted corner', () => {
    const s = cube3.solved();
    const [a, b, c] = CORNER_FACELETS[0];
    [s[a], s[b], s[c]] = [s[b], s[c], s[a]];
    expect(cube3.validate(s).errors.join()).toMatch(/twisted/);
  });

  it('rejects a flipped edge', () => {
    const s = cube3.solved();
    swap(s, EDGE_FACELETS[0][0], EDGE_FACELETS[0][1]);
    expect(cube3.validate(s).errors.join()).toMatch(/flipped/);
  });

  it('rejects two swapped edges', () => {
    const s = cube3.solved();
    swap(s, EDGE_FACELETS[0][0], EDGE_FACELETS[1][0]);
    swap(s, EDGE_FACELETS[0][1], EDGE_FACELETS[1][1]);
    expect(cube3.validate(s).errors.join()).toMatch(/swapped/);
  });

  it('rejects impossible pieces', () => {
    const s = cube3.solved();
    s[EDGE_FACELETS[0][1]] = 3; // an Up-Down edge cannot exist
    expect(cube3.validate(s).ok).toBe(false);
  });
});
