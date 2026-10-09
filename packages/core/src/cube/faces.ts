import type { FaceInfo } from '../types';

/**
 * Faces in Kociemba order. The solved cube starts the way people hold it to
 * solve: white at the bottom, green in front, red on the left (the Western
 * color scheme turned upside down around the front-back axis).
 */
export const CUBE_FACES: readonly FaceInfo[] = [
  { letter: 'U', name: 'Up', color: '#ffd500', colorName: 'Yellow' },
  { letter: 'R', name: 'Right', color: '#ff5800', colorName: 'Orange' },
  { letter: 'F', name: 'Front', color: '#009b48', colorName: 'Green' },
  { letter: 'D', name: 'Down', color: '#f4f4f4', colorName: 'White' },
  { letter: 'L', name: 'Left', color: '#c8102e', colorName: 'Red' },
  { letter: 'B', name: 'Back', color: '#0046ad', colorName: 'Blue' },
];
