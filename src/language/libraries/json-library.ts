import { defineLibrary, ResoluteLibraryError, type ResoluteLibraryFunction } from '../library-api.js';
import { anyType, boolType, fromJson, stringType, type ResoluteType, type ResoluteValue } from '../runtime-values.js';

const jsonElementType: ResoluteType = { kind: 'external', library: 'Json', name: 'Json_Element' };
const jsonArrayType: ResoluteType = { kind: 'external', library: 'Json', name: 'Json_Array' };
const jsonObjectType: ResoluteType = { kind: 'external', library: 'Json', name: 'Json_Object' };
const jsonPrimitiveType: ResoluteType = { kind: 'external', library: 'Json', name: 'Json_Primitive' };

// Declares a pure JSON function while keeping its signature next to its evaluator.
function pure(
  parameters: readonly ResoluteType[],
  returnType: ResoluteType,
  documentation: string,
  evaluate: ResoluteLibraryFunction['evaluate']
): ResoluteLibraryFunction {
  return { parameters, returnType, documentation, effect: 'pure', evaluate };
}

// Extracts the argument at an index and reports malformed direct API calls consistently.
function argument(arguments_: readonly ResoluteValue[], index: number): ResoluteValue {
  const value = arguments_[index];
  if (!value) throw new ResoluteLibraryError(`Missing argument ${index + 1}.`);
  return value;
}

function stringArgument(arguments_: readonly ResoluteValue[], index: number): string {
  const value = argument(arguments_, index);
  if (value.kind !== 'string') throw new ResoluteLibraryError(`Argument ${index + 1} must be a string.`);
  return value.value;
}

function recordArgument(arguments_: readonly ResoluteValue[], index: number): ReadonlyMap<string, ResoluteValue> {
  const value = argument(arguments_, index);
  if (value.kind !== 'record') throw new ResoluteLibraryError(`Argument ${index + 1} must be a JSON object.`);
  return value.fields;
}

function objectMember(arguments_: readonly ResoluteValue[]): ResoluteValue {
  const fields = recordArgument(arguments_, 0);
  const key = stringArgument(arguments_, 1);
  const value = fields.get(key);
  if (!value) throw new ResoluteLibraryError(`JSON object does not contain field '${key}'.`);
  return value;
}

// Converts the single-quoted object literals accepted by the Eclipse/Gson implementation.
function normalizeLegacyJson(text: string): string {
  return text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, contents: string) =>
    `"${contents.replace(/"/g, '\\"')}"`
  );
}

// Parses JSON and wraps native syntax failures in a stable Resolute-facing error.
function parseJson(text: string): ResoluteValue {
  try {
    return fromJson(JSON.parse(text));
  } catch (strictError) {
    try {
      return fromJson(JSON.parse(normalizeLegacyJson(text)));
    } catch {
      const message = strictError instanceof Error ? strictError.message : String(strictError);
      throw new ResoluteLibraryError(`Invalid JSON: ${message}`);
    }
  }
}

export const jsonLibrary = defineLibrary({
  name: 'Json',
  types: {
    Json_Element: jsonElementType,
    Json_Array: jsonArrayType,
    Json_Object: jsonObjectType,
    Json_Primitive: jsonPrimitiveType
  },
  functions: {
    parse: pure([stringType], jsonElementType, 'Parse JSON text.', (_context, args) => parseJson(stringArgument(args, 0))),
    isArray: pure([jsonElementType], boolType, 'Test whether a JSON value is an array.', (_context, args) => ({ kind: 'bool', value: argument(args, 0).kind === 'list' })),
    isObject: pure([jsonElementType], boolType, 'Test whether a JSON value is an object.', (_context, args) => ({ kind: 'bool', value: argument(args, 0).kind === 'record' })),
    isPrimitive: pure([jsonElementType], boolType, 'Test whether a JSON value is primitive.', (_context, args) => ({ kind: 'bool', value: ['bool', 'int', 'real', 'string'].includes(argument(args, 0).kind) })),
    isBoolean: pure([jsonElementType], boolType, 'Test whether a JSON value is Boolean.', (_context, args) => ({ kind: 'bool', value: argument(args, 0).kind === 'bool' })),
    isInteger: pure([jsonElementType], boolType, 'Test whether a JSON value is an integer.', (_context, args) => ({ kind: 'bool', value: argument(args, 0).kind === 'int' })),
    isReal: pure([jsonElementType], boolType, 'Test whether a JSON value is real.', (_context, args) => ({ kind: 'bool', value: argument(args, 0).kind === 'real' })),
    isString: pure([jsonElementType], boolType, 'Test whether a JSON value is a string.', (_context, args) => ({ kind: 'bool', value: argument(args, 0).kind === 'string' })),
    toArray: pure([jsonElementType], jsonArrayType, 'Require a JSON array.', (_context, args) => {
      const value = argument(args, 0);
      if (value.kind !== 'list') throw new ResoluteLibraryError('Json.toArray expected a JSON array.');
      return value;
    }),
    toObject: pure([jsonElementType], jsonObjectType, 'Require a JSON object.', (_context, args) => {
      const value = argument(args, 0);
      if (value.kind !== 'record') throw new ResoluteLibraryError('Json.toObject expected a JSON object.');
      return value;
    }),
    get: pure([jsonObjectType, stringType], jsonElementType, 'Get an object field.', (_context, args) => objectMember(args)),
    getArray: pure([jsonObjectType, stringType], jsonArrayType, 'Get an array-valued object field.', (_context, args) => {
      const value = objectMember(args);
      if (value.kind !== 'list') throw new ResoluteLibraryError('JSON field is not an array.');
      return value;
    }),
    getObject: pure([jsonObjectType, stringType], jsonObjectType, 'Get an object-valued field.', (_context, args) => {
      const value = objectMember(args);
      if (value.kind !== 'record') throw new ResoluteLibraryError('JSON field is not an object.');
      return value;
    }),
    getPrimitive: pure([jsonObjectType, stringType], jsonPrimitiveType, 'Get a primitive-valued field.', (_context, args) => {
      const value = objectMember(args);
      if (!['bool', 'int', 'real', 'string'].includes(value.kind)) throw new ResoluteLibraryError('JSON field is not primitive.');
      return value;
    }),
    getBoolean: pure([jsonObjectType, stringType], boolType, 'Get a Boolean-valued field.', (_context, args) => {
      const value = objectMember(args);
      if (value.kind !== 'bool') throw new ResoluteLibraryError('JSON field is not Boolean.');
      return value;
    }),
    getInteger: pure([jsonObjectType, stringType], { kind: 'int' }, 'Get an integer-valued field.', (_context, args) => {
      const value = objectMember(args);
      if (value.kind !== 'int') throw new ResoluteLibraryError('JSON field is not an integer.');
      return value;
    }),
    getReal: pure([jsonObjectType, stringType], { kind: 'real' }, 'Get a real-valued field.', (_context, args) => {
      const value = objectMember(args);
      if (value.kind !== 'real' && value.kind !== 'int') throw new ResoluteLibraryError('JSON field is not numeric.');
      return value;
    }),
    getString: pure([jsonObjectType, stringType], stringType, 'Get a string-valued field.', (_context, args) => {
      const value = objectMember(args);
      if (value.kind !== 'string') throw new ResoluteLibraryError('JSON field is not a string.');
      return value;
    }),
    hasMember: pure([jsonObjectType, stringType], boolType, 'Test whether an object contains a field.', (_context, args) => ({
      kind: 'bool', value: recordArgument(args, 0).has(stringArgument(args, 1))
    })),
    toPrimitive: pure([jsonElementType], jsonPrimitiveType, 'Require a primitive JSON value.', (_context, args) => {
      const value = argument(args, 0);
      if (!['bool', 'int', 'real', 'string'].includes(value.kind)) throw new ResoluteLibraryError('Expected a JSON primitive.');
      return value;
    }),
    toBoolean: pure([jsonElementType], boolType, 'Require a JSON Boolean.', (_context, args) => {
      const value = argument(args, 0); if (value.kind !== 'bool') throw new ResoluteLibraryError('Expected a JSON Boolean.'); return value;
    }),
    toInteger: pure([jsonElementType], { kind: 'int' }, 'Require a JSON integer.', (_context, args) => {
      const value = argument(args, 0); if (value.kind !== 'int') throw new ResoluteLibraryError('Expected a JSON integer.'); return value;
    }),
    toReal: pure([jsonElementType], { kind: 'real' }, 'Require a JSON real.', (_context, args) => {
      const value = argument(args, 0); if (value.kind !== 'real' && value.kind !== 'int') throw new ResoluteLibraryError('Expected a JSON number.'); return value;
    }),
    toString: pure([jsonElementType], stringType, 'Require a JSON string.', (_context, args) => {
      const value = argument(args, 0); if (value.kind !== 'string') throw new ResoluteLibraryError('Expected a JSON string.'); return value;
    }),
    isNull: pure([anyType], boolType, 'Test whether a JSON value is null.', (_context, args) => ({ kind: 'bool', value: argument(args, 0).kind === 'null' }))
  }
});
