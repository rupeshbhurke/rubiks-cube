import { describe, expect, it } from 'vitest';
import { applyAll, getCube, parseAlg, toKociembaFacelets } from '../src';
import { initCube3Solver, solveCube3Facelets } from '../src/solver';

const p = getCube(3);

describe('3x3x3 solver', () => {
  it('solves scrambled, rotated and slice-moved cubes', { timeout: 60_000 }, () => {
    initCube3Solver();
    const random = p.scramble().map((m) => p.formatMove(m)).join(' ');
    for (const alg of ["R U R' U'", "M E S x y R2 F' D", random]) {
      const state = applyAll(p, p.solved(), parseAlg(p, alg));
      const solution = solveCube3Facelets(toKociembaFacelets(state));
      expect(p.isSolved(applyAll(p, state, solution.map((t) => p.parseMove(t))))).toBe(true);
    }
    expect(solveCube3Facelets(toKociembaFacelets(p.solved()))).toEqual([]);
  });
});
