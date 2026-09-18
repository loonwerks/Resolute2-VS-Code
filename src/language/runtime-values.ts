export type ModelValueKind = 'aadl' | 'component' | 'classifier' | 'property' | 'feature' | 'connection' | 'flow';

export type ResoluteValue =
  | { kind: 'bool'; value: boolean }
  | { kind: 'int'; value: number }
  | { kind: 'real'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'list'; elements: readonly ResoluteValue[] }
  | { kind: 'set'; elements: readonly ResoluteValue[] }
  | { kind: 'record'; fields: ReadonlyMap<string, ResoluteValue> }
  | { kind: 'range'; lower: ResoluteValue; upper: ResoluteValue }
  | { kind: 'model'; modelKind: ModelValueKind; revision: number; id: string; displayPath: string }
  | { kind: 'null' }
  | { kind: 'unknown' };

export type ResoluteType =
  | { kind: 'bool' | 'int' | 'real' | 'string' | 'any' }
  | { kind: 'list' | 'set'; element: ResoluteType }
  | { kind: 'model'; name: ModelValueKind }
  | { kind: 'external'; library: string; name: string };

export const boolType: ResoluteType = { kind: 'bool' };
export const intType: ResoluteType = { kind: 'int' };
export const realType: ResoluteType = { kind: 'real' };
export const stringType: ResoluteType = { kind: 'string' };
export const anyType: ResoluteType = { kind: 'any' };
export const unknownValue: ResoluteValue = { kind: 'unknown' };

/** Converts a JSON-compatible JavaScript value into the closed Resolute value algebra. */
export function fromJson(value: unknown): ResoluteValue {
  if (value === null) return { kind: 'null' };
  if (typeof value === 'boolean') return { kind: 'bool', value };
  if (typeof value === 'number') return Number.isInteger(value) ? { kind: 'int', value } : { kind: 'real', value };
  if (typeof value === 'string') return { kind: 'string', value };
  if (Array.isArray(value)) return { kind: 'list', elements: value.map(fromJson) };
  if (typeof value === 'object') {
    return { kind: 'record', fields: new Map(Object.entries(value).map(([key, entry]) => [key, fromJson(entry)])) };
  }
  return unknownValue;
}

/** Produces the text used by claims, debugging, and primitive string concatenation. */
export function displayValue(value: ResoluteValue | undefined): string {
  if (!value || value.kind === 'unknown') return 'unknown';
  if (value.kind === 'null') return 'null';
  if (value.kind === 'list' || value.kind === 'set') return `[${value.elements.map(displayValue).join(', ')}]`;
  if (value.kind === 'record') return `{${[...value.fields].map(([key, entry]) => `${key}: ${displayValue(entry)}`).join(', ')}}`;
  if (value.kind === 'range') return `${displayValue(value.lower)} .. ${displayValue(value.upper)}`;
  if (value.kind === 'model') return value.displayPath;
  return String(value.value);
}
