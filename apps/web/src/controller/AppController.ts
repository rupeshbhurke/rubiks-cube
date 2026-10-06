import {
  type CubeMove,
  type CubePuzzle,
  type SaveFile,
  type State,
  type ValidationResult,
  CUBE_SIZES,
  Session,
  UNKNOWN_COLOR,
  createSave,
  decodeShare,
  encodeShare,
  getCube,
  restoreSession,
  type StageId,
  BEGINNER_STAGES,
  planBeginnerSolve,
  stateToFacelets,
  toKociembaFacelets,
} from '@rubiks/core';
import { CubeView } from '../view/CubeView';
import { CubeInteraction } from '../view/CubeInteraction';
import { SolverClient } from '../solver/SolverClient';
import { type SaveEntry, SaveStore } from '../storage/SaveStore';

export type Mode = 'play' | 'paint';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

export type PlanKind = 'guided' | 'quick';

export interface PlanStepSnapshot {
  stage?: StageId;
  text?: string;
  /** Range of this step in the plan's move list. */
  start: number;
  end: number;
}

export interface PlanSnapshot {
  kind: PlanKind;
  moves: string[];
  steps: PlanStepSnapshot[];
  /** Number of plan moves already done. */
  pointer: number;
  /** Index of the step being worked on; equals steps.length when finished. */
  step: number;
  /** Half of a double turn (like R2) has been done by hand. */
  half: boolean;
  /** The cube left the plan (for example after a different move). */
  stale: boolean;
}

export interface SolverSnapshot {
  /** State of the fast (computer) solver request. */
  quick: 'idle' | 'loading' | 'error';
  error?: string;
  plan: PlanSnapshot | null;
}

export interface Snapshot {
  size: number;
  puzzleName: string;
  moves: string[];
  cursor: number;
  scramble: readonly string[] | undefined;
  solved: boolean;
  /** Moves are being animated or a replay or solution is playing. */
  playing: boolean;
  replaying: boolean;
  mode: Mode;
  paintColor: number;
  paintCounts: number[];
  paintResult: ValidationResult | null;
  solver: SolverSnapshot;
  speed: number;
  saves: SaveEntry[];
  /** Id of the save the current session was loaded from or saved to. */
  currentSaveId: string | null;
  toasts: Toast[];
}

interface Settings {
  speed: number;
  size: number;
}

interface PlanStep extends PlanStepSnapshot {
  focus: number[][];
}

/** Moves to follow, with the state key expected before and after each move. */
interface Plan {
  kind: PlanKind;
  moves: string[];
  steps: PlanStep[];
  /** keys[i] = state key after i moves. */
  keys: string[];
  /** For double turns: keys after a quarter turn either way. */
  halfKeys: string[][];
  pointer: number;
  half: boolean;
  /** Quarter-turn direction already done when `half` is set. */
  halfTurns: number;
  stale: boolean;
}

interface QueuedTurn {
  move: CubeMove;
  after: State;
  duration?: number;
}

/** All 24 orientations of the cube, as whole-cube turns (identity excluded). */
const WHOLE_CUBE_TURNS = ['', 'x', 'x2', "x'", 'z', "z'"]
  .flatMap((up) => ['', 'y', 'y2', "y'"].map((spin) => [up, spin].filter(Boolean)))
  .filter((turns) => turns.length > 0);

const BASE_TURN_MS = 230;
const SCRAMBLE_TURN_MS = 75;

/**
 * Owns the puzzle session and connects it to the 3D view, input, solver and
 * storage. React components read `Snapshot`s and call the public actions.
 */
export class AppController {
  private puzzle: CubePuzzle;
  private session: Session<CubeMove>;
  private view: CubeView | null = null;
  private input: CubeInteraction | null = null;
  private readonly store = new SaveStore();
  private readonly solverClient = new SolverClient();

  private queue: QueuedTurn[] = [];
  private running = false;
  private idleWaiters: (() => void)[] = [];
  private playToken = 0;
  private replaying = false;
  private planPlaying = false;
  private celebrateWhenIdle = false;

  private mode: Mode = 'play';
  private paintState: State | null = null;
  private paintColor = 0;
  private paintResult: ValidationResult | null = null;

  private quick: { status: SolverSnapshot['quick']; error?: string } = { status: 'idle' };
  private plan: Plan | null = null;
  private lastSyncedKey = '';
  /** Camera side last chosen by the guide, so it only moves when the stage changes. */
  private guideView: 'top' | 'bottom' | null = null;

  private speed = 1;
  private currentSaveId: string | null = null;
  private currentSaveCreated: string | undefined;
  private saves: SaveEntry[] = [];
  private toasts: Toast[] = [];
  private toastId = 0;

  private listeners = new Set<() => void>();
  private snapshot: Snapshot;
  private autosaveTimer: number | undefined;
  private fromShareLink = false;

  constructor() {
    const settings = this.store.loadSettings<Settings>();
    this.speed = clamp(Number(settings.speed) || 1, 0.25, 3);
    const size = (CUBE_SIZES as readonly number[]).includes(Number(settings.size)) ? Number(settings.size) : 3;
    this.puzzle = getCube(size);
    this.session = new Session(this.puzzle);
    this.restoreStartup();
    this.saves = this.store.list();
    this.snapshot = this.buildSnapshot();
  }

  /* ---------- React binding ---------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  mount(container: HTMLElement): void {
    if (this.view) return;
    if (this.fromShareLink) {
      // Drop the share code from the address bar so a refresh uses the autosave.
      history.replaceState(null, '', window.location.pathname + window.location.search);
      this.fromShareLink = false;
    }
    this.view = new CubeView(container, this.puzzle, this.displayState());
    this.input = new CubeInteraction(this.view, container, {
      mode: () => this.mode,
      canTurn: () => this.mode === 'play' && !this.view?.celebrating,
      beforeTurn: () => {
        this.stopPlayback();
        this.flush();
      },
      commitTurn: (move) => {
        const wasSolved = this.puzzle.isSolved(this.session.state);
        this.session.play(move);
        this.afterStateChange(wasSolved);
        return this.session.state;
      },
      settled: () => this.maybeCelebrate(),
      paint: (sticker) => this.paintSticker(sticker),
    });
    if (this.puzzle.n === 3) void this.solverClient.prepare().catch(() => undefined);
  }

  unmount(): void {
    this.input?.dispose();
    this.view?.dispose();
    this.input = null;
    this.view = null;
    this.queue = [];
    this.running = false;
    this.resolveIdle();
  }

  dispose(): void {
    this.unmount();
    this.solverClient.dispose();
  }

  /* ---------- Moves ---------- */

  move(token: string): void {
    if (this.mode !== 'play') return;
    let move: CubeMove;
    try {
      move = this.puzzle.parseMove(token);
    } catch (err) {
      this.toast((err as Error).message, 'error');
      return;
    }
    this.stopPlayback();
    this.playMove(move);
  }

  undo(): void {
    if (this.mode !== 'play') return;
    this.stopPlayback();
    const inverse = this.session.undo();
    if (inverse) this.enqueue({ move: inverse, after: this.session.state });
    this.emit();
  }

  redo(): void {
    if (this.mode !== 'play') return;
    this.stopPlayback();
    this.redoStep();
  }

  /** Jump to a point in history. Neighbouring steps animate, far jumps are instant. */
  seek(cursor: number): void {
    if (this.mode !== 'play') return;
    this.stopPlayback();
    const diff = cursor - this.session.cursor;
    if (diff === 0) return;
    if (Math.abs(diff) === 1) {
      if (diff > 0) this.redoStep();
      else this.undo();
      return;
    }
    this.flush();
    this.session.seek(cursor);
    this.view?.setState(this.session.state);
    this.emit();
  }

  /** Play the history from the start (or from the cursor if mid-way). */
  async replay(): Promise<void> {
    if (this.mode !== 'play' || this.session.moves.length === 0) return;
    this.stopPlayback();
    if (!this.session.canRedo) this.seek(0);
    const token = ++this.playToken;
    this.replaying = true;
    this.emit();
    await this.wait(250);
    while (token === this.playToken && this.session.canRedo) {
      this.redoStep();
      await this.whenIdle();
      await this.wait(90 / this.speed);
    }
    if (token === this.playToken) {
      this.replaying = false;
      this.emit();
    }
  }

  stopPlayback(): void {
    if (!this.replaying && !this.planPlaying) return;
    this.playToken++;
    this.replaying = false;
    this.planPlaying = false;
    this.emit();
  }

  scramble(): void {
    if (this.mode !== 'play') return;
    this.stopPlayback();
    this.flush();
    const moves = this.puzzle.scramble();
    let state = this.puzzle.solved();
    this.view?.setState(state);
    for (const move of moves) {
      state = this.puzzle.apply(state, move);
      this.queue.push({ move, after: state, duration: SCRAMBLE_TURN_MS });
    }
    this.session = new Session(this.puzzle, {
      initial: state,
      scramble: moves.map((m) => this.puzzle.formatMove(m)),
    });
    this.detachSave();
    this.resetSolver();
    this.celebrateWhenIdle = false;
    void this.runQueue();
    this.emit();
  }

  reset(): void {
    this.stopPlayback();
    this.flush();
    if (this.mode === 'paint') this.cancelPaint();
    this.session = new Session(this.puzzle);
    this.view?.setState(this.session.state);
    this.detachSave();
    this.resetSolver();
    this.emit();
  }

  setSize(size: number): void {
    if (size === this.puzzle.n) return;
    this.stopPlayback();
    this.flush();
    this.mode = 'play';
    this.paintState = null;
    this.paintResult = null;
    this.loadSession(new Session(getCube(size)));
    this.detachSave();
    this.writeSettings();
  }

  setSpeed(speed: number): void {
    this.speed = clamp(speed, 0.25, 3);
    this.writeSettings();
    this.emit();
  }

  resetCamera(): void {
    this.view?.resetCamera();
  }

  /** Keep the cube clear of an overlay covering part of the stage (CSS px). */
  setViewInset(left: number, bottom: number): void {
    this.view?.setInset(left, bottom);
  }

  /* ---------- Solving ---------- */

  /** Plan a solve with the beginner method and guide the user through it. */
  startGuided(): void {
    if (!this.canPlan()) return;
    try {
      const steps = planBeginnerSolve(this.session.state);
      this.plan = this.buildPlan('guided', steps);
      this.lastSyncedKey = '';
      this.emit();
      // Getting white to the bottom is setup, not a lesson: do it right away and say so.
      const first = steps[0];
      if (first?.stage === 'orient') {
        const plan = this.plan;
        this.toast(`Turning the whole cube (${first.moves.join(' ')}) so the white center is at the bottom.`, 'info');
        void this.playPlanUntil(() => this.plan !== plan || plan.pointer >= first.moves.length);
      }
      return;
    } catch (err) {
      this.toast((err as Error).message, 'error');
    }
    this.emit();
  }

  /** Find a short computer solution (Kociemba) in the solver worker. */
  async solve(): Promise<void> {
    if (!this.canPlan()) return;
    const state = this.session.state;
    const key = this.stateKey(state);
    this.quick = { status: 'loading' };
    this.plan = null;
    this.emit();
    try {
      const moves = await this.solverClient.solve(toKociembaFacelets(state));
      this.quick = { status: 'idle' };
      if (this.stateKey(this.session.state) === key) {
        this.plan = this.buildPlan('quick', [{ moves, focus: [] }]);
        this.lastSyncedKey = '';
      }
    } catch (err) {
      this.quick = { status: 'error', error: (err as Error).message };
    }
    this.emit();
  }

  clearPlan(): void {
    this.stopPlayback();
    this.plan = null;
    this.emit();
  }

  /** Play the next move of the plan. */
  planNext(): void {
    this.stopPlayback();
    this.planStep();
  }

  /** Play the rest of the current step. */
  async playPlanStep(): Promise<void> {
    const p = this.plan;
    if (!p) return;
    const end = p.steps.find((s) => p.pointer < s.end)?.end ?? p.moves.length;
    await this.playPlanUntil(() => (this.plan?.pointer ?? end) >= end);
  }

  /** Play every remaining move of the plan. */
  async playPlan(): Promise<void> {
    await this.playPlanUntil(() => false);
  }

  private async playPlanUntil(done: () => boolean): Promise<void> {
    this.stopPlayback();
    const token = ++this.playToken;
    this.planPlaying = true;
    this.emit();
    while (token === this.playToken && !done() && this.planStep()) {
      await this.whenIdle();
      await this.wait(140 / this.speed);
    }
    if (token === this.playToken) {
      this.planPlaying = false;
      this.emit();
    }
  }

  /** Play one plan move. Returns false when there is nothing to play. */
  private planStep(): boolean {
    const p = this.plan;
    if (!p || p.stale || p.pointer >= p.moves.length || this.mode !== 'play') return false;
    let move = this.puzzle.parseMove(p.moves[p.pointer]);
    if (p.half) move = { ...move, turns: p.halfTurns }; // finish a half-done double turn
    this.playMove(move);
    return true;
  }

  private canPlan(): boolean {
    if (this.puzzle.n !== 3) {
      this.toast('Solving is available for the 3x3x3 only for now.', 'info');
      return false;
    }
    if (this.mode !== 'play') return false;
    this.stopPlayback();
    this.flush();
    if (this.puzzle.isSolved(this.session.state)) {
      this.toast('The cube is already solved. Scramble it first.', 'info');
      return false;
    }
    return true;
  }

  private buildPlan(kind: PlanKind, steps: { moves: string[]; text?: string; stage?: StageId; focus: number[][] }[]): Plan {
    let state = this.session.state;
    const plan: Plan = {
      kind,
      moves: [],
      steps: [],
      keys: [this.stateKey(state)],
      halfKeys: [],
      pointer: 0,
      half: false,
      halfTurns: 0,
      stale: false,
    };
    for (const step of steps) {
      const start = plan.moves.length;
      for (const token of step.moves) {
        const move = this.puzzle.parseMove(token);
        plan.halfKeys.push(
          Math.abs(move.turns) === 2
            ? [1, -1].map((turns) => this.stateKey(this.puzzle.apply(state, { ...move, turns })))
            : [],
        );
        state = this.puzzle.apply(state, move);
        plan.keys.push(this.stateKey(state));
        plan.moves.push(token);
      }
      plan.steps.push({ stage: step.stage, text: step.text, focus: step.focus, start, end: plan.moves.length });
    }
    return plan;
  }

  /** Match the cube against the plan after any change, so hand-made moves and undo are followed. */
  private syncPlan(): void {
    const p = this.plan;
    if (!p) return;
    const key = this.stateKey(this.session.state);
    if (key === this.lastSyncedKey) return;
    this.lastSyncedKey = key;
    // A position can appear twice in a plan (for example U' then U). Take the
    // nearest match, preferring forward so playback never loops back.
    const distance = (j: number) => (j >= p.pointer ? j - p.pointer : p.pointer - j + 0.5);
    let best = -1;
    p.keys.forEach((k, j) => {
      if (k === key && (best < 0 || distance(j) < distance(best))) best = j;
    });
    if (best >= 0) {
      const before = this.stepIndex(p);
      p.pointer = best;
      p.half = false;
      p.stale = false;
      const after = this.stepIndex(p);
      if (p.kind === 'guided' && after > before) this.announceStage(p, before, after);
      return;
    }
    const halfIndex = p.halfKeys[p.pointer]?.indexOf(key) ?? -1;
    if (halfIndex >= 0) {
      p.half = true;
      p.halfTurns = halfIndex === 0 ? 1 : -1;
      p.stale = false;
      return;
    }
    // Turning the whole cube to look at it is natural with a real cube; the
    // guide just re-plans for the new orientation instead of complaining.
    if (p.kind === 'guided' && this.isWholeCubeTurnOf(this.session.state, p.keys[p.pointer])) {
      const plan = p;
      queueMicrotask(() => {
        if (this.plan !== plan) return;
        this.startGuided();
        this.toast('You turned the whole cube, so the guide updated its moves.', 'info');
      });
      return;
    }
    p.stale = true;
    p.half = false;
  }

  /** True when `state` is the position with `key`, seen after a whole-cube turn. */
  private isWholeCubeTurnOf(state: State, key: string): boolean {
    return WHOLE_CUBE_TURNS.some((turns) => {
      const turned = turns.reduce((s, t) => this.puzzle.apply(s, this.puzzle.parseMove(t)), state);
      return this.stateKey(turned) === key;
    });
  }

  private stepIndex(p: Plan): number {
    const i = p.steps.findIndex((s) => p.pointer < s.end);
    return i < 0 ? p.steps.length : i;
  }

  /** Toast a beginner stage that was just finished. */
  private announceStage(p: Plan, before: number, after: number): void {
    const finished = p.steps[before]?.stage;
    if (!finished || finished === 'orient' || p.steps[after]?.stage === finished) return;
    if (after >= p.steps.length) return; // the solved celebration covers the last stage
    const title = BEGINNER_STAGES.find((s) => s.id === finished)?.title;
    if (title) this.toast(`✓ ${title} done`, 'success');
  }

  /** Light up the pieces the current guided step works on, and show the side where the work happens. */
  private updateFocus(): void {
    const p = this.plan;
    const guided = p && p.kind === 'guided' && this.mode === 'play' ? p : null;
    const step = guided && !guided.stale ? guided.steps[this.stepIndex(guided)] : undefined;
    this.view?.setFocus(step?.focus ?? []);
    if (!guided) {
      this.guideView = null;
      return;
    }
    if (!step) return;
    // The white cross and corners are built on the bottom layer.
    const side = step.stage === 'cross' || step.stage === 'corners' ? 'bottom' : 'top';
    if (side !== this.guideView) {
      this.guideView = side;
      this.view?.viewFrom(side);
    }
  }

  /* ---------- Paint mode ---------- */

  startPaint(): void {
    if (this.mode === 'paint') return;
    this.stopPlayback();
    this.flush();
    this.mode = 'paint';
    this.paintState = this.session.state.slice();
    this.paintResult = null;
    this.view?.setState(this.paintState);
    this.emit();
  }

  setPaintColor(color: number): void {
    this.paintColor = color;
    this.emit();
  }

  paintSticker(index: number): void {
    if (this.mode !== 'paint' || !this.paintState) return;
    if (this.puzzle.isFixedCenter(index)) {
      this.toast('Center colors are fixed. Hold your cube with white on top and green in front.', 'info');
      return;
    }
    if (this.paintState[index] === this.paintColor) return;
    this.paintState[index] = this.paintColor;
    this.view?.setSticker(index, this.paintColor);
    if (this.paintResult) this.view?.highlight([]);
    this.paintResult = null;
    this.emit();
  }

  /** Set every sticker except fixed centers to "not painted". */
  clearPaint(): void {
    if (!this.paintState) return;
    this.paintState = this.paintState.map((c, i) => (this.puzzle.isFixedCenter(i) ? c : UNKNOWN_COLOR));
    this.paintResult = null;
    this.view?.highlight([]);
    this.view?.setState(this.paintState);
    this.emit();
  }

  /** Start painting from a solved cube. */
  solvedPaint(): void {
    if (!this.paintState) return;
    this.paintState = this.puzzle.solved();
    this.paintResult = null;
    this.view?.highlight([]);
    this.view?.setState(this.paintState);
    this.emit();
  }

  applyPaint(): void {
    if (!this.paintState) return;
    const result = this.puzzle.validate(this.paintState);
    this.paintResult = result;
    if (!result.ok) {
      this.view?.highlight(Array.from(this.paintState.keys()).filter((i) => this.paintState![i] === UNKNOWN_COLOR));
      this.emit();
      return;
    }
    const initial = this.paintState;
    this.mode = 'play';
    this.paintState = null;
    this.paintResult = null;
    this.view?.highlight([]);
    this.loadSession(new Session(this.puzzle, { initial }));
    this.detachSave();
    this.toast(result.warnings.length ? result.warnings[0] : 'Cube state applied.', result.warnings.length ? 'info' : 'success');
  }

  cancelPaint(): void {
    if (this.mode !== 'paint') return;
    this.mode = 'play';
    this.paintState = null;
    this.paintResult = null;
    this.view?.highlight([]);
    this.view?.setState(this.session.state);
    this.emit();
  }

  /* ---------- Saves ---------- */

  saveAs(name: string): void {
    const trimmed = name.trim() || this.defaultSaveName();
    try {
      const entry = this.store.put(createSave(this.session, trimmed));
      this.saves = this.store.list();
      this.currentSaveId = entry.id;
      this.currentSaveCreated = entry.save.createdAt;
      this.toast(`Saved "${trimmed}".`, 'success');
    } catch (err) {
      this.toast((err as Error).message, 'error');
    }
    this.emit();
  }

  /** Overwrite the save the current session came from. */
  saveCurrent(): void {
    const entry = this.currentSaveId ? this.store.get(this.currentSaveId) : undefined;
    if (!entry) {
      this.saveAs('');
      return;
    }
    try {
      this.store.put(createSave(this.session, entry.save.name, new Date(), this.currentSaveCreated), entry.id);
      this.saves = this.store.list();
      this.toast(`Updated "${entry.save.name}".`, 'success');
    } catch (err) {
      this.toast((err as Error).message, 'error');
    }
    this.emit();
  }

  load(id: string): void {
    const entry = this.store.get(id);
    if (!entry) return;
    try {
      const { session } = restoreSession(entry.save);
      this.leavePaint();
      this.loadSession(session as Session<CubeMove>);
      this.currentSaveId = id;
      this.currentSaveCreated = entry.save.createdAt;
      this.toast(`Loaded "${entry.save.name}".`, 'success');
    } catch (err) {
      this.toast((err as Error).message, 'error');
    }
  }

  deleteSave(id: string): void {
    try {
      this.store.remove(id);
      this.saves = this.store.list();
      if (this.currentSaveId === id) this.detachSave();
    } catch (err) {
      this.toast((err as Error).message, 'error');
    }
    this.emit();
  }

  exportSave(id?: string): void {
    const save = id ? this.store.get(id)?.save : createSave(this.session, this.defaultSaveName());
    if (!save) return;
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${save.name.replace(/[^\w.-]+/g, '_') || 'cube'}.cube.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async importFile(file: File): Promise<void> {
    try {
      const data = JSON.parse(await file.text());
      const { save, session } = restoreSession(data);
      const entry = this.store.put(save);
      this.saves = this.store.list();
      this.leavePaint();
      this.loadSession(session as Session<CubeMove>);
      this.currentSaveId = entry.id;
      this.currentSaveCreated = save.createdAt;
      this.toast(`Imported "${save.name}".`, 'success');
    } catch (err) {
      this.toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : (err as Error).message, 'error');
    }
  }

  shareLink(): string {
    const url = new URL(window.location.href);
    url.hash = `s=${encodeShare(this.session)}`;
    return url.toString();
  }

  async copyShareLink(): Promise<void> {
    const link = this.shareLink();
    try {
      await navigator.clipboard.writeText(link);
      this.toast('Share link copied to the clipboard.', 'success');
    } catch {
      window.prompt('Copy this link:', link);
    }
  }

  /* ---------- Toasts ---------- */

  toast(text: string, kind: Toast['kind'] = 'info'): void {
    const id = ++this.toastId;
    this.toasts = [...this.toasts.slice(-2), { id, text, kind }];
    this.emit();
    setTimeout(() => this.dismissToast(id), kind === 'error' ? 5000 : 2800);
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  /* ---------- Keyboard ---------- */

  handleKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && e.code === 'KeyY') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (e.code === 'Escape') {
      this.stopPlayback();
      this.cancelPaint();
      return;
    }
    if (mod || e.altKey || e.repeat) return;
    const letter = /^Key([A-Z])$/.exec(e.code)?.[1];
    if (!letter || !'UDRLFBMESXYZ'.includes(letter)) return;
    const base = 'XYZ'.includes(letter) ? letter.toLowerCase() : letter;
    if ('MES'.includes(base) && this.puzzle.n < 3) return;
    e.preventDefault();
    this.move(base + (e.shiftKey ? "'" : ''));
  }

  /* ---------- Internals ---------- */

  private playMove(move: CubeMove): void {
    const wasSolved = this.puzzle.isSolved(this.session.state);
    this.session.play(move);
    this.enqueue({ move, after: this.session.state });
    this.afterStateChange(wasSolved);
  }

  private redoStep(): void {
    const wasSolved = this.puzzle.isSolved(this.session.state);
    const move = this.session.redo();
    if (move) {
      this.enqueue({ move, after: this.session.state });
      this.afterStateChange(wasSolved);
    }
  }

  private afterStateChange(wasSolved: boolean): void {
    if (!wasSolved && this.puzzle.isSolved(this.session.state) && !this.replaying) this.celebrateWhenIdle = true;
    this.emit();
  }

  private enqueue(turn: QueuedTurn): void {
    this.queue.push(turn);
    void this.runQueue();
  }

  private async runQueue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.emit();
    while (this.queue.length > 0) {
      const turn = this.queue.shift()!;
      if (!this.view) continue;
      // Speed up when moves pile up so input never feels laggy.
      const backlog = this.queue.length;
      const base = turn.duration ?? BASE_TURN_MS / this.speed;
      const duration = backlog > 3 ? base * 0.4 : backlog > 0 ? base * 0.7 : base;
      await this.view.animateMove(turn.move, turn.after, duration);
    }
    this.running = false;
    this.maybeCelebrate();
    this.resolveIdle();
    this.emit();
  }

  private maybeCelebrate(): void {
    if (this.running || this.queue.length > 0) return;
    if (this.celebrateWhenIdle && this.puzzle.isSolved(this.session.state)) {
      this.view?.celebrate();
      this.toast('Solved! 🎉', 'success');
    }
    this.celebrateWhenIdle = false;
  }

  /** Drop queued animations and show the current state at once. */
  private flush(): void {
    this.queue = [];
    this.view?.finishNow();
    this.view?.setState(this.displayState());
  }

  private whenIdle(): Promise<void> {
    if (!this.running && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private resolveIdle(): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((w) => w());
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private loadSession(session: Session<CubeMove>): void {
    this.flush();
    const sizeChanged = session.puzzle !== this.puzzle;
    this.puzzle = session.puzzle as CubePuzzle;
    this.session = session;
    if (this.view) {
      if (sizeChanged) this.view.setPuzzle(this.puzzle, session.state);
      else this.view.setState(session.state);
    }
    if (sizeChanged && this.puzzle.n === 3 && this.view) void this.solverClient.prepare().catch(() => undefined);
    this.resetSolver();
    this.emit();
  }

  private leavePaint(): void {
    this.mode = 'play';
    this.paintState = null;
    this.paintResult = null;
    this.view?.highlight([]);
  }

  private detachSave(): void {
    this.currentSaveId = null;
    this.currentSaveCreated = undefined;
  }

  private resetSolver(): void {
    this.quick = { status: 'idle' };
    this.plan = null;
  }

  private stateKey(state: State): string {
    return stateToFacelets(this.puzzle, state);
  }

  private displayState(): State {
    return this.mode === 'paint' && this.paintState ? this.paintState : this.session.state;
  }

  private defaultSaveName(): string {
    return `${this.puzzle.name} – ${new Date().toLocaleString()}`;
  }

  private writeSettings(): void {
    this.store.writeSettings<Settings>({ speed: this.speed, size: this.puzzle.n });
  }

  /** Load from a share link in the URL, else the last autosave. */
  private restoreStartup(): void {
    const match = /[#&]s=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    if (match) {
      try {
        const session = decodeShare(match[1]) as Session<CubeMove>;
        this.puzzle = session.puzzle as CubePuzzle;
        this.session = session;
        this.fromShareLink = true;
        queueMicrotask(() => this.toast('Loaded cube from share link.', 'success'));
        return;
      } catch (err) {
        queueMicrotask(() => this.toast((err as Error).message, 'error'));
      }
    }
    const auto = this.store.loadAutosave();
    if (!auto) return;
    try {
      const { session } = restoreSession(auto);
      this.puzzle = session.puzzle as CubePuzzle;
      this.session = session as Session<CubeMove>;
    } catch {
      // Ignore a damaged autosave and start fresh.
    }
  }

  private scheduleAutosave(): void {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => {
      this.store.writeAutosave(createSave(this.session, 'Autosave') as SaveFile);
    }, 400);
  }

  private emit(): void {
    this.syncPlan();
    this.updateFocus();
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((l) => l());
    this.scheduleAutosave();
  }

  private buildSnapshot(): Snapshot {
    const paintCounts = new Array(7).fill(0);
    if (this.paintState) {
      for (const c of this.paintState) paintCounts[c === UNKNOWN_COLOR ? 6 : c]++;
    }
    return {
      size: this.puzzle.n,
      puzzleName: this.puzzle.name,
      moves: this.session.moveTokens(),
      cursor: this.session.cursor,
      scramble: this.session.scramble,
      solved: this.puzzle.isSolved(this.session.state),
      playing: this.running || this.replaying || this.planPlaying,
      replaying: this.replaying,
      mode: this.mode,
      paintColor: this.paintColor,
      paintCounts,
      paintResult: this.paintResult,
      solver: {
        quick: this.quick.status,
        error: this.quick.error,
        plan: this.plan && {
          kind: this.plan.kind,
          moves: this.plan.moves,
          steps: this.plan.steps,
          pointer: this.plan.pointer,
          step: this.stepIndex(this.plan),
          half: this.plan.half,
          stale: this.plan.stale,
        },
      },
      speed: this.speed,
      saves: this.saves,
      currentSaveId: this.currentSaveId,
      toasts: this.toasts,
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
