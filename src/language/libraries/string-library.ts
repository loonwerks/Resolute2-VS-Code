import { defineLibrary, ResoluteLibraryError, type ResoluteLibraryFunction } from '../library-api.js';
import { boolType, intType, stringType, type ResoluteType, type ResoluteValue } from '../runtime-values.js';

const stringListType: ResoluteType = { kind: 'list', element: stringType };

function pure(parameters: readonly ResoluteType[], returnType: ResoluteType, evaluate: ResoluteLibraryFunction['evaluate']): ResoluteLibraryFunction {
  return { parameters, returnType, documentation: 'String utility.', effect: 'pure', evaluate };
}

function stringAt(arguments_: readonly ResoluteValue[], index: number): string {
  const value = arguments_[index];
  if (value?.kind !== 'string') throw new ResoluteLibraryError(`Argument ${index + 1} must be a string.`);
  return value.value;
}

function intAt(arguments_: readonly ResoluteValue[], index: number): number {
  const value = arguments_[index];
  if (value?.kind !== 'int') throw new ResoluteLibraryError(`Argument ${index + 1} must be an integer.`);
  return value.value;
}


// Computes Java String.hashCode over UTF-16 code units, including surrogate pairs.
function javaHashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return hash;
}

// Implements Java String.matches, which requires the pattern to consume the whole input.
function javaMatches(value: string, pattern: string): boolean {
  return new RegExp(`^(?:${pattern})$(?![\s\S])`).test(value);
}

// Implements Java String.split(regex) with its removal of trailing empty fragments.
function javaSplit(value: string, pattern: string): string[] {
  const fragments = value.split(new RegExp(pattern));
  while (fragments.length > 1 && fragments.at(-1) === '') fragments.pop();
  return fragments;
}

// Implements Java String.substring bounds instead of JavaScript clamping and index swapping.
function javaSubstring(value: string, start: number, end: number): string {
  if (start < 0 || end > value.length || start > end) {
    throw new ResoluteLibraryError(`substring bounds [${start}, ${end}) are invalid for a string of length ${value.length}.`);
  }
  return value.slice(start, end);
}

// Implements Java String.trim, which removes only characters at or below U+0020.
function javaTrim(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end -= 1;
  return value.slice(start, end);
}

export const stringLibrary = defineLibrary({
  name: 'StringLib',
  functions: {
    concat: pure([stringType, stringType], stringType, (_context, args) => ({ kind: 'string', value: stringAt(args, 0) + stringAt(args, 1) })),
    contains: pure([stringType, stringType], boolType, (_context, args) => ({ kind: 'bool', value: stringAt(args, 0).includes(stringAt(args, 1)) })),
    endsWith: pure([stringType, stringType], boolType, (_context, args) => ({ kind: 'bool', value: stringAt(args, 0).endsWith(stringAt(args, 1)) })),
    hashCode: pure([stringType], intType, (_context, args) => ({ kind: 'int', value: javaHashCode(stringAt(args, 0)) })),
    indexOf: pure([stringType, stringType], intType, (_context, args) => ({ kind: 'int', value: stringAt(args, 0).indexOf(stringAt(args, 1)) })),
    join: pure([stringType, stringListType], stringType, (_context, args) => {
      const values = args[1];
      if (values?.kind !== 'list') throw new ResoluteLibraryError('Argument 2 must be a list of strings.');
      return { kind: 'string', value: values.elements.map((_, index) => stringAt(values.elements, index)).join(stringAt(args, 0)) };
    }),
    lastIndexOf: pure([stringType, stringType], intType, (_context, args) => ({ kind: 'int', value: stringAt(args, 0).lastIndexOf(stringAt(args, 1)) })),
    stringLength: pure([stringType], intType, (_context, args) => ({ kind: 'int', value: stringAt(args, 0).length })),
    matches: pure([stringType, stringType], boolType, (_context, args) => ({ kind: 'bool', value: javaMatches(stringAt(args, 0), stringAt(args, 1)) })),
    replace: pure([stringType, stringType, stringType], stringType, (_context, args) => ({ kind: 'string', value: stringAt(args, 0).replaceAll(stringAt(args, 1), stringAt(args, 2)) })),
    split: pure([stringType, stringType], stringListType, (_context, args) => ({ kind: 'list', elements: javaSplit(stringAt(args, 0), stringAt(args, 1)).map(value => ({ kind: 'string' as const, value })) })),
    startsWith: pure([stringType, stringType], boolType, (_context, args) => ({ kind: 'bool', value: stringAt(args, 0).startsWith(stringAt(args, 1)) })),
    substring: pure([stringType, intType, intType], stringType, (_context, args) => ({ kind: 'string', value: javaSubstring(stringAt(args, 0), intAt(args, 1), intAt(args, 2)) })),
    toLowerCase: pure([stringType], stringType, (_context, args) => ({ kind: 'string', value: stringAt(args, 0).toLowerCase() })),
    toUpperCase: pure([stringType], stringType, (_context, args) => ({ kind: 'string', value: stringAt(args, 0).toUpperCase() })),
    trim: pure([stringType], stringType, (_context, args) => ({ kind: 'string', value: javaTrim(stringAt(args, 0)) }))
  }
});
