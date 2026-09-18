import { buildModelIndex } from './model-index.js';
import { LastGoodModelProvider, type AirSnapshot, type ModelDiagnostic } from './model-provider.js';

export interface SysmlFrontend {
  typeCheck(files: ReadonlyArray<{ uri: string; text: string }>): Promise<{
    air: string[];
    diagnostics: ModelDiagnostic[];
    hasError: boolean;
    metadata?: import("./model-index.js").ModelMetadata;
  }>;
}

export class SysmlModelProvider extends LastGoodModelProvider {
  readonly kind = 'sysml' as const;
  private revision = 0;

  constructor(private readonly frontend: SysmlFrontend) { super(); }

  /** Advances the snapshot only after Sireum successfully produces AIR. */
  async refresh(files: ReadonlyArray<{ uri: string; text: string }>): Promise<AirSnapshot | undefined> {
    const result = await this.frontend.typeCheck(files);
    this.currentDiagnostics = result.diagnostics;
    if (!result.hasError && result.air.length > 0) {
      this.snapshot = {
        revision: ++this.revision,
        air: result.air,
        index: buildModelIndex(result.air, result.metadata),
        stale: false
      };
    } else if (this.snapshot) {
      this.snapshot = { ...this.snapshot, stale: true };
    }
    return this.snapshot;
  }
}
