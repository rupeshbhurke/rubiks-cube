import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { type Axis, type CubeMove, type CubePuzzle, type State, type Vec3, UNKNOWN_COLOR } from '@rubiks/core';

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const Z = new THREE.Vector3(0, 0, 1);

const BODY_SIZE = 0.97;
const BODY_RADIUS = 0.09;
const STICKER_SIZE = 0.84;
const STICKER_RADIUS = 0.13;
const UNKNOWN_HEX = '#3a3f4b';

export type Easing = (t: number) => number;
export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;

interface LayerAnimation {
  axis: Axis;
  from: number;
  to: number;
  start: number;
  duration: number;
  ease: Easing;
  after: State | null;
  resolve: () => void;
}

interface Cubie {
  obj: THREE.Group;
  home: Vec3;
}

export interface PickHit {
  /** Sticker index; null only if the geometry has no sticker at that spot. */
  sticker: number | null;
  cubie: Vec3;
  normal: Vec3;
  point: THREE.Vector3;
}

/**
 * Three.js view of an NxN cube.
 *
 * The view never moves cubies permanently. A turn rotates the affected cubies
 * inside a pivot group; when it ends the pivot is reset and every sticker is
 * recolored from the new state. Because the cube is symmetric this is seamless,
 * and it keeps the view a pure function of the model state.
 */
export class CubeView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  readonly controls: OrbitControls;

  private readonly root = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private readonly shadow: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly stickerGeometry: THREE.ShapeGeometry;
  private readonly bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.42, metalness: 0.05 });
  private readonly materials = new Map<number, THREE.MeshPhysicalMaterial>();
  private bodyGeometry: RoundedBoxGeometry;

  private puzzle!: CubePuzzle;
  private cubies: Cubie[] = [];
  private stickers: THREE.Mesh[] = [];
  private stickerIndex = new Map<string, number>();
  private anim: LayerAnimation | null = null;
  private dragAxis: Axis | null = null;
  private dragAngle = 0;
  private spin: { start: number; duration: number } | null = null;
  private highlighted = new Set<number>();
  /** Render only when something changed, to save CPU and battery. */
  private dirty = true;
  /** Screen space (CSS px) covered by overlays; the cube is centered in the rest. */
  private insetTarget = { left: 0, bottom: 0 };
  private inset = { left: 0, bottom: 0 };
  private lastTick = performance.now();

  constructor(private readonly container: HTMLElement, puzzle: CubePuzzle, state: State) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.domElement.className = 'cube-canvas';
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 9, 6);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.15));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.9;
    this.controls.addEventListener('change', this.invalidate);

    this.stickerGeometry = new THREE.ShapeGeometry(roundedSquare(STICKER_SIZE, STICKER_RADIUS), 6);
    this.bodyGeometry = new RoundedBoxGeometry(BODY_SIZE, BODY_SIZE, BODY_SIZE, 4, BODY_RADIUS);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.root, this.shadow);
    this.root.add(this.pivot);

    this.setPuzzle(puzzle, state);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  get busy(): boolean {
    return this.anim !== null || this.spin !== null;
  }

  get celebrating(): boolean {
    return this.spin !== null;
  }

  get currentDragAngle(): number {
    return this.dragAngle;
  }

  get size(): number {
    return this.puzzle.n;
  }

  /** Rebuild all meshes for a (possibly different) puzzle. */
  setPuzzle(puzzle: CubePuzzle, state: State): void {
    this.finishNow();
    for (const c of this.cubies) this.root.remove(c.obj);
    this.cubies = [];
    this.stickers = [];
    this.stickerIndex = new Map(puzzle.stickers.map((s, i) => [`${s.cubie.join(',')}|${s.normal.join(',')}`, i]));
    this.puzzle = puzzle;

    const byKey = new Map<string, Cubie>();
    puzzle.stickers.forEach((s, i) => {
      const k = s.cubie.join(',');
      let cubie = byKey.get(k);
      if (!cubie) {
        const obj = new THREE.Group();
        obj.position.set(s.cubie[0] / 2, s.cubie[1] / 2, s.cubie[2] / 2);
        obj.add(new THREE.Mesh(this.bodyGeometry, this.bodyMaterial));
        cubie = { obj, home: s.cubie };
        byKey.set(k, cubie);
        this.cubies.push(cubie);
        this.root.add(obj);
      }
      const mesh = new THREE.Mesh(this.stickerGeometry, this.material(state[i]));
      const normal = new THREE.Vector3(...s.normal);
      mesh.position.copy(normal).multiplyScalar(BODY_SIZE / 2 + 0.002);
      mesh.quaternion.setFromUnitVectors(Z, normal);
      cubie.obj.add(mesh);
      this.stickers[i] = mesh;
    });

    const n = puzzle.n;
    this.shadow.scale.setScalar(n * 2.4);
    this.shadow.position.y = -n / 2 - 0.45;
    this.controls.minDistance = n * 2.2;
    this.controls.maxDistance = n * 7;
    this.resetCamera();
    this.highlighted.clear();
    this.setState(state);
  }

  resetCamera(): void {
    const n = this.puzzle.n;
    this.camera.position.set(0.72, 0.68, 1).normalize().multiplyScalar(n * 3.6 + 1.5);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.invalidate();
  }

  setState(state: State): void {
    state.forEach((color, i) => {
      this.stickers[i].material = this.material(color);
    });
    this.invalidate();
  }

  setSticker(index: number, color: number): void {
    this.stickers[index].material = this.material(color);
    this.invalidate();
  }

  /** Raise and brighten stickers, e.g. to show validation problems. */
  highlight(indices: Iterable<number>): void {
    for (const i of this.highlighted) this.stickers[i].scale.setScalar(1);
    this.highlighted = new Set(indices);
    for (const i of this.highlighted) this.stickers[i].scale.setScalar(1.12);
    this.invalidate();
  }

  /** Animate one turn, then show `after`. Any running animation is completed first. */
  animateMove(move: CubeMove, after: State, duration: number): Promise<void> {
    this.finishNow();
    if (duration <= 0) {
      this.setState(after);
      return Promise.resolve();
    }
    this.attachLayer(move.axis, move.lo, move.hi);
    const angle = (move.turns * Math.PI) / 2;
    return this.startLayerAnimation(move.axis, 0, angle, Math.abs(move.turns) === 2 ? duration * 1.45 : duration, easeInOutCubic, after);
  }

  beginDrag(axis: Axis, lo: number, hi: number): void {
    this.finishNow();
    this.attachLayer(axis, lo, hi);
    this.dragAxis = axis;
    this.setDragAngle(0);
  }

  setDragAngle(angle: number): void {
    if (this.dragAxis === null) return;
    this.dragAngle = angle;
    this.pivot.quaternion.setFromAxisAngle(AXES[this.dragAxis], angle);
    this.invalidate();
  }

  /** Finish a drag by easing to `target` (a multiple of 90 degrees). */
  settleDrag(target: number, after: State | null, duration: number): Promise<void> {
    if (this.dragAxis === null) return Promise.resolve();
    const axis = this.dragAxis;
    this.dragAxis = null;
    return this.startLayerAnimation(axis, this.dragAngle, target, duration, easeOutCubic, after);
  }

  /** Whole-cube victory spin. */
  celebrate(): void {
    if (this.spin) return;
    this.spin = { start: performance.now(), duration: 1100 };
  }

  /** Jump any running animation to its end. */
  finishNow(): void {
    if (this.anim) this.completeLayerAnimation();
    if (this.dragAxis !== null) {
      this.dragAxis = null;
      this.detachLayer();
    }
  }

  /**
   * Find the sticker under a screen point. The ray is tested against the cube's
   * outer box rather than the meshes, so the thin gaps between cubies never
   * swallow a click.
   */
  pick(clientX: number, clientY: number): PickHit | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const n = this.puzzle.n;
    const half = n / 2;
    this.root.updateMatrixWorld();
    const toLocal = this.root.matrixWorld.clone().invert();
    const ray = this.raycaster.ray.clone().applyMatrix4(toLocal);
    const local = ray.intersectBox(new THREE.Box3(new THREE.Vector3(-half, -half, -half), new THREE.Vector3(half, half, half)), new THREE.Vector3());
    if (!local) return null;

    const coords = [local.x, local.y, local.z];
    const abs = coords.map(Math.abs);
    const axis = abs.indexOf(Math.max(...abs));
    const normal: Vec3 = [0, 0, 0];
    normal[axis] = Math.sign(coords[axis]) || 1;
    const cubie = coords.map((c, a) => {
      if (a === axis) return normal[a] * (n - 1);
      const layer = Math.min(n - 1, Math.max(0, Math.floor(c + half)));
      return 2 * layer - (n - 1);
    }) as Vec3;
    const sticker = this.stickerIndex.get(`${cubie.join(',')}|${normal.join(',')}`) ?? null;
    return { sticker, cubie, normal, point: local.applyMatrix4(this.root.matrixWorld) };
  }

  /** Project a world point to client (CSS pixel) coordinates. */
  toScreen(point: THREE.Vector3): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const p = point.clone().project(this.camera);
    return new THREE.Vector2(rect.left + ((p.x + 1) / 2) * rect.width, rect.top + ((1 - p.y) / 2) * rect.height);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.stickerGeometry.dispose();
    this.bodyGeometry.dispose();
    this.bodyMaterial.dispose();
    this.materials.forEach((m) => m.dispose());
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private material(color: number): THREE.MeshPhysicalMaterial {
    let m = this.materials.get(color);
    if (!m) {
      const hex = color === UNKNOWN_COLOR ? UNKNOWN_HEX : this.puzzle.faces[color].color;
      m = new THREE.MeshPhysicalMaterial({
        color: hex,
        roughness: 0.28,
        metalness: 0,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
        side: THREE.FrontSide,
      });
      this.materials.set(color, m);
    }
    return m;
  }

  private attachLayer(axis: Axis, lo: number, hi: number): void {
    const n = this.puzzle.n;
    this.pivot.quaternion.identity();
    for (const c of this.cubies) {
      const layer = (c.home[axis] + n - 1) / 2;
      if (layer >= lo && layer <= hi) this.pivot.add(c.obj);
    }
  }

  private detachLayer(): void {
    for (const obj of [...this.pivot.children]) this.root.add(obj);
    this.pivot.quaternion.identity();
    this.dragAngle = 0;
    this.invalidate();
  }

  private startLayerAnimation(
    axis: Axis,
    from: number,
    to: number,
    duration: number,
    ease: Easing,
    after: State | null,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.anim = { axis, from, to, start: performance.now(), duration: Math.max(1, duration), ease, after, resolve };
    });
  }

  private completeLayerAnimation(): void {
    const anim = this.anim!;
    this.anim = null;
    this.detachLayer();
    if (anim.after) this.setState(anim.after);
    anim.resolve();
  }

  /**
   * Keep the cube clear of an overlay covering the left or bottom of the stage.
   * The change animates smoothly.
   */
  setInset(left: number, bottom: number): void {
    this.insetTarget = { left: Math.max(0, left), bottom: Math.max(0, bottom) };
    this.invalidate();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.updateProjection();
    this.renderer.render(this.scene, this.camera); // avoid a blank frame while resizing
  }

  private updateProjection(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    const { left, bottom } = this.inset;
    const freeW = Math.max(1, w - left);
    const freeH = Math.max(1, h - bottom);
    this.camera.aspect = w / h;
    // Zoom out when the free area is tall and narrow so the whole cube stays visible.
    this.camera.zoom = Math.min(1, (freeW / freeH) * 1.15) * (freeH / h);
    // Shift the picture so the cube sits in the middle of the free area.
    if (left > 0.5 || bottom > 0.5) this.camera.setViewOffset(w, h, -left / 2, bottom / 2, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Move the current inset toward its target. Returns true while still moving. */
  private stepInset(dt: number): boolean {
    const t = this.insetTarget;
    const c = this.inset;
    if (c.left === t.left && c.bottom === t.bottom) return false;
    // Exponential approach, time based so it looks the same at any frame rate.
    const k = 1 - Math.exp(-dt / 70);
    const ease = (from: number, to: number) => (Math.abs(to - from) < 0.5 ? to : from + (to - from) * k);
    this.inset = { left: ease(c.left, t.left), bottom: ease(c.bottom, t.bottom) };
    this.updateProjection();
    return true;
  }

  private invalidate = (): void => {
    this.dirty = true;
  };

  private tick = (): void => {
    const now = performance.now();
    const dt = Math.min(100, now - this.lastTick);
    this.lastTick = now;
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.start) / a.duration);
      this.pivot.quaternion.setFromAxisAngle(AXES[a.axis], a.from + (a.to - a.from) * a.ease(t));
      if (t >= 1) this.completeLayerAnimation();
    }
    if (this.spin) {
      const t = Math.min(1, (now - this.spin.start) / this.spin.duration);
      const e = easeInOutCubic(t);
      this.root.rotation.y = e * Math.PI * 2;
      this.root.position.y = Math.sin(t * Math.PI) * 0.35;
      if (t >= 1) {
        this.spin = null;
        this.root.rotation.y = 0;
        this.root.position.y = 0;
        this.invalidate();
      }
    }
    // update() applies damping and fires 'change' (which invalidates) while the camera moves.
    this.controls.update();
    if (this.stepInset(dt) || this.anim || this.spin) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  };
}

function roundedSquare(size: number, r: number): THREE.Shape {
  const s = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-s + r, -s);
  shape.lineTo(s - r, -s);
  shape.quadraticCurveTo(s, -s, s, -s + r);
  shape.lineTo(s, s - r);
  shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(-s + r, s);
  shape.quadraticCurveTo(-s, s, -s, s - r);
  shape.lineTo(-s, -s + r);
  shape.quadraticCurveTo(-s, -s, -s + r, -s);
  return shape;
}

/** Soft radial blob used as a contact shadow under the cube. */
function shadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
