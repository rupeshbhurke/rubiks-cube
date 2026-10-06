import type { SolverRequest, SolverResponse } from './solver.worker';

type Pending = { resolve: (moves: string[]) => void; reject: (err: Error) => void };

/** Runs the 3x3x3 solver in a Web Worker so table building never blocks the UI. */
export class SolverClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private warm: Promise<void> | null = null;

  /** Start building solver tables in the background. Safe to call often. */
  prepare(): Promise<void> {
    this.warm ??= this.request({ type: 'init' }).then(() => undefined);
    return this.warm;
  }

  async solve(facelets: string): Promise<string[]> {
    await this.prepare();
    return this.request({ type: 'solve', facelets });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach((p) => p.reject(new Error('Solver stopped')));
    this.pending.clear();
    this.warm = null;
  }

  private request(body: { type: 'init' } | { type: 'solve'; facelets: string }): Promise<string[]> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, ...body } as SolverRequest);
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SolverResponse>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.moves ?? []);
    };
    worker.onerror = (e) => {
      const err = new Error(e.message || 'Solver failed to load');
      this.pending.forEach((p) => p.reject(err));
      this.pending.clear();
      this.warm = null;
      worker.terminate();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }
}
