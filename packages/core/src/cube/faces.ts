import type { FaceInfo } from '../types';

/** Faces in Kociemba order with the standard (Western) color scheme. */
export const CUBE_FACES: readonly FaceInfo[] = [
  { letter: 'U', name: 'Up', color: '#f4f4f4', colorName: 'White' },
  { letter: 'R', name: 'Right', color: '#c8102e', colorName: 'Red' },
  { letter: 'F', name: 'Front', color: '#009b48', colorName: 'Green' },
  { letter: 'D', name: 'Down', color: '#ffd500', colorName: 'Yellow' },
  { letter: 'L', name: 'Left', color: '#ff5800', colorName: 'Orange' },
  { letter: 'B', name: 'Back', color: '#0046ad', colorName: 'Blue' },
];
