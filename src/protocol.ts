export interface SourceLocation {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface GoalDescriptor {
  name: string;
  qualifiedName: string;
  parameters: string[];
  location: SourceLocation;
}

export interface AssuranceNode {
  identifier: string;
  kind: 'claim' | 'strategy' | 'evidence' | 'message';
  status: 'valid' | 'invalid' | 'unknown' | 'error';
  text: string;
  location?: SourceLocation;
  references: SourceLocation[];
  children: AssuranceNode[];
  model?: { revision: number; stale: boolean };
}

export interface ModelSourceFile { uri: string; text: string; }
export interface ModelDiagnosticDto {
  severity: 'error' | 'warning' | 'information';
  message: string;
  source?: string;
  uri?: string;
  startLine?: number;
  startCharacter?: number;
  endLine?: number;
  endCharacter?: number;
}
export interface RefreshModelParams { files: ModelSourceFile[]; generation: number; }
export interface ModelRefreshResult {
  generation: number;
  revision?: number;
  state: 'unavailable' | 'building' | 'ready' | 'stale';
  stale: boolean;
  diagnostics: ModelDiagnosticDto[];
}


export interface EvaluateGoalParams {
  documentUri: string;
  qualifiedName: string;
  expectedModelRevision?: number;
}
export interface RuntimeLogMessage {
  level: 'evaluation-error' | 'runtime-error';
  message: string;
  stack?: string;
  location?: SourceLocation;
}
