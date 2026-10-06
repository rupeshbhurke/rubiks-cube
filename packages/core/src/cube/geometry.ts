/**
 * Sticker geometry for an NxN cube.
 *
 * Coordinates are "doubled" integers so every cubie center is an integer:
 * along each axis a cubie sits at -(n-1), -(n-3), ..., n-1. Axes follow
 * Three.js: +x = Right, +y = Up, +z = Front.
 *
 * Sticker order follows the Kociemba facelet convention used by most solvers:
 * faces U, R, F, D, L, B, each read row by row as seen when looking at that face
 * in the standard unfolded net.
 */

export type Vec3 = [number, number, number];
export type Axis = 0 | 1 | 2;

export const FACE_LETTERS = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type FaceLetter = (typeof FACE_LETTERS)[number];

interface FaceFrame {
  normal: Vec3;
  /** Direction of increasing column. */
  right: Vec3;
  /** Direction of increasing row. */
  down: Vec3;
}

const FRAMES: readonly FaceFrame[] = [
  { normal: [0, 1, 0], right: [1, 0, 0], down: [0, 0, 1] }, // U
  { normal: [1, 0, 0], right: [0, 0, -1], down: [0, -1, 0] }, // R
  { normal: [0, 0, 1], right: [1, 0, 0], down: [0, -1, 0] }, // F
  { normal: [0, -1, 0], right: [1, 0, 0], down: [0, 0, -1] }, // D
  { normal: [-1, 0, 0], right: [0, 0, 1], down: [0, -1, 0] }, // L
  { normal: [0, 0, -1], right: [-1, 0, 0], down: [0, -1, 0] }, // B
];

export interface StickerGeometry {
  face: number;
  row: number;
  col: number;
  /** Doubled coordinates of the cubie that carries this sticker. */
  cubie: Vec3;
  /** Outward unit normal. */
  normal: Vec3;
}

export function buildStickers(n: number): StickerGeometry[] {
  const stickers: StickerGeometry[] = [];
  FRAMES.forEach((frame, face) => {
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const u = 2 * col - (n - 1);
        const v = 2 * row - (n - 1);
        const cubie = [0, 1, 2].map(
          (a) => frame.right[a] * u + frame.down[a] * v + frame.normal[a] * (n - 1),
        ) as Vec3;
        stickers.push({ face, row, col, cubie, normal: [...frame.normal] });
      }
    }
  });
  return stickers;
}

/** Rotate an integer vector +90 degrees (right-hand rule) about an axis. */
export function rotateQuarter([x, y, z]: Vec3, axis: Axis): Vec3 {
  switch (axis) {
    case 0:
      return [x, -z, y];
    case 1:
      return [z, y, -x];
    case 2:
      return [-y, x, z];
  }
}

/** Layer index (0 = most negative) of a doubled coordinate. */
export function layerOf(coord: number, n: number): number {
  return (coord + n - 1) / 2;
}
