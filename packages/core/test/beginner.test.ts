import { describe, expect, it } from 'vitest';
import { applyAll, getCube, parseAlg, planBeginnerSolve, type GuideStep } from '../src';
import { applyMoves, cubiesFromFaces, solvedCubies } from '../src/learn/cubies';

const cube = getCube(3);

function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function play(state: Uint8Array, steps: GuideStep[]): Uint8Array {
  return applyAll(cube, state, steps.flatMap((s) => s.moves.map((t) => cube.parseMove(t))));
}

describe('piece model', () => {
  it('agrees with the sticker model', () => {
    const alg = "R U R' U' F2 D L' B2 U' R2 F' L D2 B";
    const fromStickers = cubiesFromFaces(applyAll(cube, cube.solved(), parseAlg(cube, alg)));
    expect(applyMoves(solvedCubies(), alg.split(' '))).toEqual(fromStickers);
  });
});

describe('beginner method', () => {
  it('returns no steps for a solved cube', () => {
    expect(planBeginnerSolve(cube.solved())).toEqual([]);
  });

  it('solves random cubes, stage by stage', () => {
    const random = seeded(42);
    const order = ['orient', 'cross', 'corners', 'middle', 'yellowCross', 'yellowEdges', 'yellowCornersPlace', 'yellowCornersTwist'];
    let longest = 0;
    for (let i = 0; i < 300; i++) {
      const state = applyAll(cube, cube.solved(), cube.scramble(random));
      const steps = planBeginnerSolve(state);
      expect(cube.isSolved(play(state, steps))).toBe(true);
      // Stages appear in order.
      const stages = steps.map((s) => order.indexOf(s.stage));
      expect(stages).toEqual([...stages].sort((a, b) => a - b));
      for (const s of steps) {
        expect(s.moves.length).toBeGreaterThan(0);
        expect(s.text.length).toBeGreaterThan(10);
      }
      longest = Math.max(longest, steps.reduce((n, s) => n + s.moves.length, 0));
    }
    expect(longest).toBeLessThan(260);
  });

  it('handles cubes turned with slices and rotations', () => {
    for (const alg of ["M E S", "x y R U", "z' M2 F", "x2", "y R"]) {
      const state = applyAll(cube, cube.solved(), parseAlg(cube, alg));
      const steps = planBeginnerSolve(state);
      expect(cube.isSolved(play(state, steps))).toBe(true);
    }
  });

  it('starts by putting white at the bottom when needed', () => {
    const state = applyAll(cube, cube.solved(), parseAlg(cube, "R U x"));
    const steps = planBeginnerSolve(state);
    expect(steps[0].stage).toBe('orient');
    expect(['x', "x'", 'x2', 'z', "z'"]).toContain(steps[0].moves[0]);
  });

  it('rejects impossible cubes', () => {
    const s = cube.solved();
    [s[5], s[10]] = [s[10], s[5]]; // flip one edge
    expect(() => planBeginnerSolve(s)).toThrow();
  });
});
