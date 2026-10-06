/** Types for the vendored cubejs solver (only the parts this app uses). */
export interface CubeInstance {
  move(alg: string): CubeInstance;
  asString(): string;
  solve(maxDepth?: number): string;
  isSolved(): boolean;
}

export interface CubeStatic {
  new (): CubeInstance;
  fromString(facelets: string): CubeInstance;
  initSolver(): void;
}

declare const Cube: CubeStatic;
export default Cube;
