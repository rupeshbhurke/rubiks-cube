import { describe, expect, it } from 'vitest';
import {
  Session,
  createSave,
  decodeShare,
  encodeShare,
  getCube,
  parseAlg,
  restoreSession,
  statesEqual,
} from '../src';

const p = getCube(3);

describe('Session', () => {
  it('undoes, redoes and truncates history', () => {
    const s = new Session(p);
    for (const m of parseAlg(p, "R U R' U'")) s.play(m);
    const end = s.state;
    expect(s.undo()).toEqual(p.parseMove('U'));
    expect(s.cursor).toBe(3);
    s.redo();
    expect(statesEqual(s.state, end)).toBe(true);
    s.seek(1);
    expect(statesEqual(s.state, p.apply(p.solved(), p.parseMove('R')))).toBe(true);
    s.play(p.parseMove('F'));
    expect(s.moveTokens()).toEqual(['R', 'F']);
    expect(s.canRedo).toBe(false);
  });
});

describe('save files', () => {
  it('round-trip through JSON', () => {
    const initial = p.apply(p.solved(), p.parseMove('R2'));
    const s = new Session(p, { initial, moves: parseAlg(p, "U F' M2 x"), cursor: 3, scramble: ['R2'] });
    const file = JSON.parse(JSON.stringify(createSave(s, 'Test')));
    const { save, session } = restoreSession(file);
    expect(save.name).toBe('Test');
    expect(session.cursor).toBe(3);
    expect(session.scramble).toEqual(['R2']);
    expect(statesEqual(session.state, s.state)).toBe(true);
    expect(session.moveTokens()).toEqual(s.moveTokens());
  });

  it('rejects tampered files', () => {
    const file = createSave(new Session(p, { moves: parseAlg(p, 'R U') }), 'x');
    expect(() => restoreSession({ ...file, moves: ['R'] })).toThrow(/does not match/);
    expect(() => restoreSession({ ...file, format: 'other' })).toThrow();
    expect(() => restoreSession({ ...file, puzzle: { kind: 'cube', size: 99 } })).toThrow();
  });
});

describe('share links', () => {
  it('round-trip', () => {
    const big = getCube(4);
    const s = new Session(big, {
      initial: big.apply(big.solved(), big.parseMove('Rw')),
      moves: parseAlg(big, "2R U' x"),
      cursor: 2,
      scramble: ['Rw'],
    });
    const code = encodeShare(s);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeShare(code);
    expect(back.puzzle).toBe(big);
    expect(back.cursor).toBe(2);
    expect(back.moveTokens()).toEqual(s.moveTokens());
    expect(statesEqual(back.initial, s.initial)).toBe(true);
  });

  it('rejects damaged links', () => {
    expect(() => decodeShare('!!!')).toThrow();
    expect(() => decodeShare('eyJwIjoiY3ViZTo5OSJ9')).toThrow();
  });
});
