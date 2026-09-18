import { buildModelIndex } from './model-index.js';
import { LastGoodModelProvider, type AirSnapshot } from './model-provider.js';

export class AadlAirProvider extends LastGoodModelProvider {
  readonly kind = 'aadl-air' as const;
  private revision = 0;

  /** Accepts one or more externally generated AIR JSON documents. */
  async refresh(files: ReadonlyArray<{ uri: string; text: string }>): Promise<AirSnapshot | undefined> {
    if (files.length === 0) return this.snapshot;
    try {
      files.forEach(file => JSON.parse(file.text));
      const air = files.map(file => file.text);
      this.snapshot = { revision: ++this.revision, air, index: buildModelIndex(air), stale: false };
      this.currentDiagnostics = [];
    } catch (error) {
      this.currentDiagnostics = [{ severity: 'error', message: `Invalid AIR JSON: ${String(error)}`, uri: files[0]?.uri }];
      if (this.snapshot) this.snapshot = { ...this.snapshot, stale: true };
    }
    return this.snapshot;
  }
}
