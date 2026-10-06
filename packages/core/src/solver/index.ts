import Cube from './vendor/solve.js';

/**
 * 3x3x3 solver using Kociemba's two-phase algorithm (cubejs, vendored in ./vendor).
 * Solutions are short (usually 18-22 moves) but are not a human method.
 *
 * Building the lookup tables takes a few seconds, so call `initCube3Solver`
 * off the UI thread (e.g. in a Web Worker) before the first solve.
 */

let ready = false;

export function initCube3Solver(): void {
  if (ready) return;
  Cube.initSolver();
  ready = true;
}

/**
 * Solve a 3x3x3 given as a 54-letter Kociemba facelet string with standard
 * centers (see `toKociembaFacelets`). Returns move tokens; empty when solved.
 */
export function solveCube3Facelets(facelets: string): string[] {
  initCube3Solver();
  const cube = Cube.fromString(facelets);
  if (cube.isSolved()) return [];
  return cube.solve().split(/\s+/).filter(Boolean);
}
