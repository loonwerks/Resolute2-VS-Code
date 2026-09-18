import type { AirSnapshot, ModelDiagnostic } from './model-provider.js';
import type { SysmlModelProvider } from './sysml-provider.js';

export type ModelState = 'unavailable' | 'building' | 'ready' | 'stale';

/** Serializes refreshes and exposes the exact immutable snapshot used by each evaluation. */
export class ModelRuntime {
  private stateValue: ModelState = 'unavailable';
  private activeSnapshot: AirSnapshot | undefined;
  private queue: Promise<AirSnapshot | undefined> = Promise.resolve(undefined);

  constructor(private readonly provider?: SysmlModelProvider) {}

  get state(): ModelState { return this.stateValue; }
  get snapshot(): AirSnapshot | undefined { return this.activeSnapshot; }
  diagnostics(): readonly ModelDiagnostic[] { return this.provider?.diagnostics() ?? []; }

  /** Queues a complete source-set refresh and retains the last valid snapshot on errors. */
  refresh(files: ReadonlyArray<{ uri: string; text: string }>): Promise<AirSnapshot | undefined> {
    if (!this.provider) return Promise.resolve(undefined);
    this.stateValue = 'building';
    this.queue = this.queue.catch(() => undefined).then(async () => {
      const snapshot = await this.provider!.refresh(files);
      this.activeSnapshot = snapshot;
      this.stateValue = snapshot?.stale ? 'stale' : snapshot ? 'ready' : 'unavailable';
      return snapshot;
    }).catch(error => {
      if (this.activeSnapshot) this.activeSnapshot = { ...this.activeSnapshot, stale: true };
      this.stateValue = this.activeSnapshot ? 'stale' : 'unavailable';
      throw error;
    });
    return this.queue;
  }
}
