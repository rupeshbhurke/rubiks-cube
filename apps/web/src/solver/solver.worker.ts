import { initCube3Solver, solveCube3Facelets } from '@rubiks/core/solver';

export type SolverRequest = { id: number; type: 'init' } | { id: number; type: 'solve'; facelets: string };
export type SolverResponse = { id: number; moves?: string[]; error?: string };

self.onmessage = (e: MessageEvent<SolverRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'init') {
      initCube3Solver();
      self.postMessage({ id: req.id } satisfies SolverResponse);
    } else {
      self.postMessage({ id: req.id, moves: solveCube3Facelets(req.facelets) } satisfies SolverResponse);
    }
  } catch (err) {
    self.postMessage({ id: req.id, error: (err as Error).message } satisfies SolverResponse);
  }
};
