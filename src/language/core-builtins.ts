import type { ResoluteValue } from './runtime-values.js';

export class CoreBuiltinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoreBuiltinError';
  }
}

// Evaluates pure collection built-ins, returning undefined only for non-core names.
export function evaluateCoreBuiltin(name: string, arguments_: readonly ResoluteValue[]): ResoluteValue | undefined {
  switch (name) {
    case 'member': {
      requireArity(name, arguments_, 2);
      return { kind: 'bool', value: elementsOf(arguments_[1], name).some(value => equalValues(value, arguments_[0])) };
    }
    case 'has_member':
    case 'is_in_array': {
      if (arguments_.length !== 2 || (arguments_[1].kind !== 'list' && arguments_[1].kind !== 'set')) return undefined;
      return { kind: 'bool', value: arguments_[1].elements.some(value => equalValues(value, arguments_[0])) };
    }
    case 'length':
    case 'size': {
      requireArity(name, arguments_, 1);
      const value = arguments_[0];
      if (value.kind === 'string') return { kind: 'int', value: value.value.length };
      return { kind: 'int', value: elementsOf(value, name).length };
    }
    case 'sum':
    case 'min':
    case 'max': {
      requireArity(name, arguments_, 1);
      const values = elementsOf(arguments_[0], name).map((value, index) => numberOf(value, `${name} element ${index + 1}`));
      if (values.length === 0 && name !== 'sum') throw new CoreBuiltinError(`${name} requires a non-empty collection.`);
      const result = name === 'sum' ? values.reduce((left, right) => left + right, 0)
        : name === 'min' ? Math.min(...values) : Math.max(...values);
      return { kind: values.some(value => !Number.isInteger(value)) ? 'real' : 'int', value: result };
    }
    case 'append': {
      requireArity(name, arguments_, 2);
      const values = elementsOf(arguments_[0], name);
      return { kind: 'list', elements: [...values, arguments_[1]] };
    }
    case 'head': {
      requireArity(name, arguments_, 1);
      const values = elementsOf(arguments_[0], name);
      if (values.length === 0) throw new CoreBuiltinError('head requires a non-empty collection.');
      return values[0];
    }
    case 'tail': {
      requireArity(name, arguments_, 1);
      const values = elementsOf(arguments_[0], name);
      if (values.length === 0) throw new CoreBuiltinError('tail requires a non-empty collection.');
      return { kind: 'list', elements: values.slice(1) };
    }
    case 'as_set': {
      requireArity(name, arguments_, 1);
      return { kind: 'set', elements: unique(elementsOf(arguments_[0], name)) };
    }
    case 'as_list': {
      requireArity(name, arguments_, 1);
      return { kind: 'list', elements: [...elementsOf(arguments_[0], name)] };
    }
    case 'union':
    case 'intersect': {
      requireArity(name, arguments_, 2);
      const left = elementsOf(arguments_[0], name);
      const right = elementsOf(arguments_[1], name);
      const elements = name === 'union'
        ? unique([...left, ...right])
        : unique(left.filter(value => right.some(other => equalValues(value, other))));
      return { kind: arguments_[0].kind === 'list' && arguments_[1].kind === 'list' ? 'list' : 'set', elements };
    }
    default:
      return undefined;
  }
}

// Checks a fixed built-in arity before indexing arguments.
function requireArity(name: string, arguments_: readonly ResoluteValue[], expected: number): void {
  if (arguments_.length !== expected) {
    throw new CoreBuiltinError(`${name} expects ${expected} argument(s), but received ${arguments_.length}.`);
  }
}

// Extracts collection elements while rejecting scalar arguments.
function elementsOf(value: ResoluteValue, operation: string): readonly ResoluteValue[] {
  if (value.kind !== 'list' && value.kind !== 'set') throw new CoreBuiltinError(`${operation} expects a collection.`);
  return value.elements;
}

// Extracts one numeric payload for aggregate operations.
function numberOf(value: ResoluteValue, description: string): number {
  if (value.kind !== 'int' && value.kind !== 'real') throw new CoreBuiltinError(`${description} must be numeric.`);
  return value.value;
}

// Removes structural duplicates while preserving first-occurrence order.
function unique(values: readonly ResoluteValue[]): ResoluteValue[] {
  const result: ResoluteValue[] = [];
  for (const value of values) if (!result.some(existing => equalValues(existing, value))) result.push(value);
  return result;
}

// Compares primitive and structural values independently of JavaScript object identity.
function equalValues(left: ResoluteValue, right: ResoluteValue): boolean {
  if (left.kind !== right.kind) {
    return (left.kind === 'int' || left.kind === 'real')
      && (right.kind === 'int' || right.kind === 'real')
      && left.value === right.value;
  }
  if (left.kind === 'set') {
    const other = right as typeof left;
    return left.elements.length === other.elements.length
      && left.elements.every(value => other.elements.some(candidate => equalValues(value, candidate)));
  }
  if (left.kind === 'list') {
    const other = right as typeof left;
    return left.elements.length === other.elements.length
      && left.elements.every((value, index) => equalValues(value, other.elements[index]));
  }
  if (left.kind === 'record') {
    const other = right as typeof left;
    return left.fields.size === other.fields.size && [...left.fields].every(([key, value]) => {
      const otherValue = other.fields.get(key);
      return otherValue !== undefined && equalValues(value, otherValue);
    });
  }
  if (left.kind === 'model') { const other = right as typeof left; return left.revision === other.revision && left.id === other.id; }
  if (left.kind === 'range') { const other = right as typeof left; return equalValues(left.lower, other.lower) && equalValues(left.upper, other.upper); }
  if (left.kind === 'unknown' || left.kind === 'null') return true;
  return left.value === (right as typeof left).value;
}
