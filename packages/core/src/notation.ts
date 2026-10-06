/** Plain-language explanation of a cube move token, for the learning UI. */
export function describeCubeMove(token: string): string {
  const m = /^(\d*)([URFDLBurfdlbMESxyz])(w?)(\d*)(')?$/.exec(token);
  if (!m) return token;
  const [, prefix, letter, w, amount, prime] = m;
  const direction = amount === '2' ? 'half turn (180°)' : prime ? 'counter-clockwise' : 'clockwise';
  const faceNames: Record<string, string> = { U: 'Up', D: 'Down', R: 'Right', L: 'Left', F: 'Front', B: 'Back' };

  if ('xyz'.includes(letter)) {
    const follows = { x: 'R', y: 'U', z: 'F' }[letter]!;
    return `Turn the whole cube ${direction}, the same way as ${follows}.`;
  }
  if ('MES'.includes(letter)) {
    const slice = { M: 'Middle slice (between L and R)', E: 'Equator slice (between U and D)', S: 'Standing slice (between F and B)' }[letter]!;
    const follows = { M: 'L', E: 'D', S: 'F' }[letter]!;
    return `${slice}, ${direction} the same way as ${follows}.`;
  }
  const face = faceNames[letter.toUpperCase()];
  const wide = w === 'w' || letter !== letter.toUpperCase();
  let what: string;
  if (wide) what = `${prefix || 2} ${face} layers together`;
  else if (prefix) what = `layer ${prefix} counted from the ${face} face`;
  else what = `${face} face`;
  return `Turn the ${what} ${direction}, as seen looking straight at the ${face} face.`;
}
