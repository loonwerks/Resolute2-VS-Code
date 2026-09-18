import type { ResoluteType, ResoluteValue } from './runtime-values.js';

export type ResoluteEffect = 'pure' | 'workspace-read' | 'process' | 'network';

export interface ResoluteEvaluationContext {
  readonly documentUri: string;
}

export interface ResoluteLibraryFunction {
  readonly parameters: readonly ResoluteType[];
  readonly returnType: ResoluteType;
  readonly documentation: string;
  readonly effect: ResoluteEffect;
  evaluate(context: ResoluteEvaluationContext, arguments_: readonly ResoluteValue[]): ResoluteValue;
}

export interface ResoluteLibrary {
  readonly name: string;
  readonly functions: Readonly<Record<string, ResoluteLibraryFunction>>;
  readonly types?: Readonly<Record<string, ResoluteType>>;
}

export class ResoluteLibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResoluteLibraryError';
  }
}

// Retains literal function names while checking that a library satisfies the public contract.
export function defineLibrary<const T extends ResoluteLibrary>(library: T): T {
  return library;
}

export interface ResoluteLibraryRegistry {
  register(library: ResoluteLibrary): void;
  getLibrary(name: string): ResoluteLibrary | undefined;
  getFunction(library: string, functionName: string): ResoluteLibraryFunction | undefined;
  getType(library: string, typeName: string): ResoluteType | undefined;
  listLibraries(): readonly ResoluteLibrary[];
}

export class DefaultResoluteLibraryRegistry implements ResoluteLibraryRegistry {
  private readonly libraries = new Map<string, ResoluteLibrary>();

  // Registers one uniquely named library and rejects ambiguous declarations at startup.
  register(library: ResoluteLibrary): void {
    const key = library.name.toLowerCase();
    if (this.libraries.has(key)) throw new ResoluteLibraryError(`Duplicate library '${library.name}'.`);
    this.libraries.set(key, library);
  }

  getLibrary(name: string): ResoluteLibrary | undefined {
    return this.libraries.get(name.toLowerCase());
  }

  getFunction(library: string, functionName: string): ResoluteLibraryFunction | undefined {
    const functions = this.getLibrary(library)?.functions;
    if (!functions) return undefined;
    const entry = Object.entries(functions).find(([name]) => name.toLowerCase() === functionName.toLowerCase());
    return entry?.[1];
  }

  getType(library: string, typeName: string): ResoluteType | undefined {
    const types = this.getLibrary(library)?.types;
    if (!types) return undefined;
    return Object.entries(types).find(([name]) => name.toLowerCase() === typeName.toLowerCase())?.[1];
  }

  listLibraries(): readonly ResoluteLibrary[] {
    return [...this.libraries.values()];
  }
}
