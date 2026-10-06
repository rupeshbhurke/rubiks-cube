/** How to make a move with the keyboard (and mouse, for whole-cube turns). */
export function moveHint(token: string): string {
  const letter = token.replace(/^\d+/, '')[0];
  const key = letter.toUpperCase();
  const keys = token.endsWith("'") ? `Shift + ${key}` : token.endsWith('2') ? `${key} twice` : key;
  const mouse = 'xyz'.includes(letter) ? ' · Mouse: right-drag or Shift + drag the cube' : '';
  return `Keys: ${keys}${mouse}`;
}
