import type { ModelIndex } from './model-index.js';

export interface ModelDiagnostic {
  severity: 'error' | 'warning' | 'information';
  message: string;
  source?: string;
  uri?: string;
  startLine?: number;
  startCharacter?: number;
  endLine?: number;
  endCharacter?: number;
}

export interface AirSnapshot {
  revision: number;
  air: readonly string[];
  index: ModelIndex;
  stale: boolean;
}

export interface ModelProvider {
  readonly kind: 'sysml' | 'aadl-air';
  refresh(files: ReadonlyArray<{ uri: string; text: string }>): Promise<AirSnapshot | undefined>;
  diagnostics(): readonly ModelDiagnostic[];
  lastGoodSnapshot(): AirSnapshot | undefined;
}

/** Retains the last valid AIR value so temporary source errors do not invalidate every open claim. */
export abstract class LastGoodModelProvider implements ModelProvider {
  abstract readonly kind: 'sysml' | 'aadl-air';
  protected snapshot: AirSnapshot | undefined;
  protected currentDiagnostics: ModelDiagnostic[] = [];

  abstract refresh(files: ReadonlyArray<{ uri: string; text: string }>): Promise<AirSnapshot | undefined>;

  diagnostics(): readonly ModelDiagnostic[] { return this.currentDiagnostics; }
  lastGoodSnapshot(): AirSnapshot | undefined { return this.snapshot; }
}
