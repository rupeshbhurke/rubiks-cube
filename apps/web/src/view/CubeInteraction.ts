import * as THREE from 'three';
import { type Axis, type CubeMove, type State, type Vec3, normalizeTurns } from '@rubiks/core';
import type { CubeView, PickHit } from './CubeView';

export interface InteractionHost {
  mode(): 'play' | 'paint';
  /** False blocks layer turns (the drag then orbits the camera instead). */
  canTurn(): boolean;
  /** Called before a turn starts so queued animations can be finished. */
  beforeTurn(): void;
  /** Record a finished drag turn and return the new state. */
  commitTurn(move: CubeMove): State;
  /** Called when a drag turn has finished animating. */
  settled(): void;
  paint(sticker: number): void;
}

interface DragDecision {
  axis: Axis;
  /** Layers that turn (all of them for a whole-cube turn). */
  lo: number;
  hi: number;
  /** +1 or -1: rotation sign about the positive axis for a positive drag. */
  sign: number;
  /** Unit screen vector for a positive drag. */
  screenDir: THREE.Vector2;
  pxPerRadian: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  hit: PickHit;
  /** Right-drag or Shift + drag turns the whole cube. */
  whole: boolean;
  decision: DragDecision | null;
  samples: { t: number; angle: number }[];
}

const DRAG_THRESHOLD_PX = 7;
const QUARTER = Math.PI / 2;
/** 0.5 = round to nearest quarter; higher commits a turn earlier. */
const SNAP_BIAS = 0.65;

/**
 * Turns pointer input on the cube into layer turns (play mode) or sticker
 * painting (paint mode). Pointer-downs that miss the cube fall through to the
 * orbit controls, so dragging the background rotates the camera. Right-drag
 * or Shift + drag on the cube turns the whole cube (x, y, z).
 */
export class CubeInteraction {
  private drag: DragState | null = null;
  private paintPointer: number | null = null;
  private lastPainted = -1;

  constructor(
    private readonly view: CubeView,
    private readonly el: HTMLElement,
    private readonly host: InteractionHost,
  ) {
    // Capture phase on the container runs before OrbitControls' own listener on the canvas.
    el.addEventListener('pointerdown', this.onDown, { capture: true });
    el.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown, { capture: true });
    this.el.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  }

  private onDown = (e: PointerEvent): void => {
    if (this.drag || this.paintPointer !== null) return;
    const whole = e.pointerType === 'mouse' && (e.button === 2 || (e.button === 0 && e.shiftKey));
    if (e.pointerType === 'mouse' && e.button !== 0 && !whole) return;

    if (this.host.mode() === 'paint') {
      if (e.button !== 0) return;
      const hit = this.view.pick(e.clientX, e.clientY);
      if (hit?.sticker == null) return;
      this.view.controls.enabled = false;
      this.paintPointer = e.pointerId;
      this.lastPainted = hit.sticker;
      this.host.paint(hit.sticker);
      return;
    }

    if (!this.host.canTurn()) return;
    this.host.beforeTurn();
    const hit = this.view.pick(e.clientX, e.clientY);
    if (!hit) return;
    this.view.controls.enabled = false;
    this.drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, hit, whole, decision: null, samples: [] };
  };

  private onMove = (e: PointerEvent): void => {
    if (this.paintPointer === e.pointerId) {
      const hit = this.view.pick(e.clientX, e.clientY);
      if (hit?.sticker != null && hit.sticker !== this.lastPainted) {
        this.lastPainted = hit.sticker;
        this.host.paint(hit.sticker);
      }
      return;
    }

    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.decision) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      d.decision = this.decide(d.hit, dx, dy, d.whole);
      if (!d.decision) {
        this.cancel();
        return;
      }
      this.host.beforeTurn();
      this.view.beginDrag(d.decision.axis, d.decision.lo, d.decision.hi);
    }
    const { screenDir, pxPerRadian, sign } = d.decision;
    const angle = (sign * (dx * screenDir.x + dy * screenDir.y)) / pxPerRadian;
    this.view.setDragAngle(angle);
    d.samples.push({ t: e.timeStamp, angle });
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > 100) d.samples.shift();
  };

  private onUp = (e: PointerEvent): void => {
    if (this.paintPointer === e.pointerId) {
      this.paintPointer = null;
      this.view.controls.enabled = true;
      return;
    }
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    this.drag = null;
    this.view.controls.enabled = true;
    if (!d.decision) return;

    const angle = this.view.currentDragAngle;
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const dt = first && last ? (last.t - first.t) / 1000 : 0;
    const velocity = dt > 0.01 ? (last.angle - first.angle) / dt : 0;
    // A quick flick carries the turn on; past a third of a quarter the turn completes.
    const fling = Math.max(-0.45, Math.min(0.45, velocity * 0.09)) * QUARTER;
    const projected = angle + fling;
    const quarters = Math.max(-2, Math.min(2, Math.sign(projected) * Math.floor(Math.abs(projected) / QUARTER + SNAP_BIAS)));
    const target = quarters * QUARTER;

    const turns = normalizeTurns(quarters);
    const { axis, lo, hi } = d.decision;
    const after = turns === 0 ? null : this.host.commitTurn({ axis, lo, hi, turns });
    const remaining = Math.abs(target - angle) / QUARTER;
    void this.view.settleDrag(target, after, 80 + 220 * Math.min(1, remaining)).then(() => this.host.settled());
  };

  private cancel(): void {
    this.drag = null;
    this.view.controls.enabled = true;
  }

  /** Choose the layer and rotation direction from the first few pixels of a drag. */
  private onContextMenu = (e: MouseEvent): void => {
    // Right-drag on the cube turns the whole cube, so no browser menu there.
    if (this.view.pick(e.clientX, e.clientY)) e.preventDefault();
  };

  private decide(hit: PickHit, dx: number, dy: number, whole: boolean): DragDecision | null {
    const n = this.view.size;
    const origin = this.view.toScreen(hit.point);
    const drag = new THREE.Vector2(dx, dy).normalize();
    let best: { tangent: Vec3; dir: THREE.Vector2; pxPerUnit: number; dot: number } | null = null;

    for (let a = 0; a < 3; a++) {
      if (hit.normal[a] !== 0) continue;
      const tangent: Vec3 = [0, 0, 0];
      tangent[a] = 1;
      const tip = this.view.toScreen(hit.point.clone().add(new THREE.Vector3(...tangent).multiplyScalar(0.5)));
      const screen = tip.sub(origin).multiplyScalar(2);
      const pxPerUnit = screen.length();
      if (pxPerUnit < 1) continue;
      const dir = screen.divideScalar(pxPerUnit);
      const dot = drag.dot(dir);
      if (!best || Math.abs(dot) > Math.abs(best.dot)) best = { tangent, dir, pxPerUnit, dot };
    }
    if (!best) return null;

    const s = Math.sign(best.dot) || 1;
    const dragDir = new THREE.Vector3(...best.tangent).multiplyScalar(s);
    const rotAxis = new THREE.Vector3(...hit.normal).cross(dragDir);
    const abs = [Math.abs(rotAxis.x), Math.abs(rotAxis.y), Math.abs(rotAxis.z)];
    const axis = abs.indexOf(Math.max(...abs)) as Axis;
    return {
      axis,
      lo: whole ? 0 : (hit.cubie[axis] + n - 1) / 2,
      hi: whole ? n - 1 : (hit.cubie[axis] + n - 1) / 2,
      sign: Math.sign(rotAxis.getComponent(axis)),
      screenDir: best.dir.clone().multiplyScalar(s),
      // Arc length over radius: the touched point follows the finger.
      pxPerRadian: best.pxPerUnit * (n / 2),
    };
  }
}
