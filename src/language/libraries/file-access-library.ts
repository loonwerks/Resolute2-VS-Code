import { constants, accessSync, readFileSync, readdirSync, realpathSync, statfsSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineLibrary, ResoluteLibraryError, type ResoluteLibraryFunction } from '../library-api.js';
import { boolType, intType, stringType, type ResoluteType, type ResoluteValue } from '../runtime-values.js';

const stringListType: ResoluteType = { kind: 'list', element: stringType };

export interface FileAccessLibraryOptions {
  readonly enabled: boolean;
  readonly workspaceRoots: readonly string[];
}

// Declares one workspace-read operation with common metadata.
function workspaceRead(parameters: readonly ResoluteType[], returnType: ResoluteType, evaluate: ResoluteLibraryFunction['evaluate']): ResoluteLibraryFunction {
  return { parameters, returnType, documentation: 'Reads metadata or contents within a trusted workspace.', effect: 'workspace-read', evaluate };
}

// Extracts one string argument from a library call.
function stringAt(arguments_: readonly ResoluteValue[], index: number): string {
  const value = arguments_[index];
  if (value?.kind !== 'string') throw new ResoluteLibraryError(`Argument ${index + 1} must be a string.`);
  return value.value;
}

// Checks whether a resolved path is equal to or nested beneath a configured root.
function isWithin(candidate: string, root: string): boolean {
  const remainder = relative(root, candidate);
  return remainder === '' || (!remainder.startsWith(`..${sep}`) && remainder !== '..' && !isAbsolute(remainder));
}

// Computes Java's String hash over UTF-16 code units.
function javaStringHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  return hash;
}

// Compares paths using Java String.compareTo semantics.
function comparePaths(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

// Converts the source URI into the base directory for relative paths.
function documentDirectory(documentUri: string): string {
  try {
    const url = new URL(documentUri);
    if (url.protocol === 'file:') return dirname(fileURLToPath(url));
  } catch {
    // The caller receives the stable error below.
  }
  throw new ResoluteLibraryError('FileAccess requires a file-backed Resolute document.');
}

// Constructs the complete legacy FileAccess API with workspace confinement.
export function createFileAccessLibrary(options: FileAccessLibraryOptions) {
  const roots = options.workspaceRoots.map(root => realpathSync(root));
  const resolvePath = (documentUri: string, input: string): string => {
    if (!options.enabled) {
      throw new ResoluteLibraryError('FileAccess is disabled. Enable resolute2.fileAccess.enabled in a trusted workspace and restart the Resolute2 server.');
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
      throw new ResoluteLibraryError('FileAccess URL reads require network authority and are not enabled by the workspace-read policy.');
    }
    const lexicalPath = resolve(documentDirectory(documentUri), input);
    let actualPath: string;
    try {
      actualPath = realpathSync(lexicalPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ResoluteLibraryError(`Unable to resolve '${input}': ${message}`);
    }
    if (!roots.some(root => isWithin(actualPath, root))) {
      throw new ResoluteLibraryError(`FileAccess denied path outside the trusted workspace: '${input}'.`);
    }
    return actualPath;
  };

  const onePath = (context: { documentUri: string }, arguments_: readonly ResoluteValue[]): string =>
    resolvePath(context.documentUri, stringAt(arguments_, 0));
  const canAccess = (path: string, mode: number): boolean => {
    try { accessSync(path, mode); return true; } catch { return false; }
  };

  return defineLibrary({
    name: 'FileAccess',
    functions: {
      canExecute: workspaceRead([stringType], boolType, (context, args) => ({ kind: 'bool', value: canAccess(onePath(context, args), constants.X_OK) })),
      canRead: workspaceRead([stringType], boolType, (context, args) => ({ kind: 'bool', value: canAccess(onePath(context, args), constants.R_OK) })),
      canWrite: workspaceRead([stringType], boolType, (context, args) => ({ kind: 'bool', value: canAccess(onePath(context, args), constants.W_OK) })),
      compareTo: workspaceRead([stringType, stringType], intType, (context, args) => ({ kind: 'int', value: comparePaths(onePath(context, args), resolvePath(context.documentUri, stringAt(args, 1))) })),
      fileExists: workspaceRead([stringType], boolType, (context, args) => ({ kind: 'bool', value: statSync(onePath(context, args), { throwIfNoEntry: false }) !== undefined })),
      getAbsolutePath: workspaceRead([stringType], stringType, (context, args) => ({ kind: 'string', value: onePath(context, args) })),
      getContents: workspaceRead([stringType], stringType, (context, args) => ({ kind: 'string', value: readFileSync(onePath(context, args), 'utf8').replace(/\r?\n$/, '') })),
      getParent: workspaceRead([stringType], stringType, (context, args) => ({ kind: 'string', value: dirname(onePath(context, args)) })),
      getFreeSpace: workspaceRead([stringType], intType, (context, args) => {
        const stats = statfsSync(onePath(context, args));
        return { kind: 'int', value: Number(stats.bfree * stats.bsize) };
      }),
      getName: workspaceRead([stringType], stringType, (context, args) => ({ kind: 'string', value: basename(onePath(context, args)) })),
      getTotalSpace: workspaceRead([stringType], intType, (context, args) => {
        const stats = statfsSync(onePath(context, args));
        return { kind: 'int', value: Number(stats.blocks * stats.bsize) };
      }),
      getUsableSpace: workspaceRead([stringType], intType, (context, args) => {
        const stats = statfsSync(onePath(context, args));
        return { kind: 'int', value: Number(stats.bavail * stats.bsize) };
      }),
      hashCode: workspaceRead([stringType], intType, (context, args) => ({ kind: 'int', value: javaStringHash(onePath(context, args)) ^ 1234321 })),
      isAbsolute: workspaceRead([stringType], boolType, (context, args) => ({ kind: 'bool', value: isAbsolute(onePath(context, args)) })),
      isDirectory: workspaceRead([stringType], boolType, (context, args) => ({ kind: 'bool', value: statSync(onePath(context, args)).isDirectory() })),
      isFile: workspaceRead([stringType], boolType, (context, args) => ({ kind: 'bool', value: statSync(onePath(context, args)).isFile() })),
      isHidden: workspaceRead([stringType], boolType, (context, args) => ({ kind: 'bool', value: basename(onePath(context, args)).startsWith('.') })),
      lastModified: workspaceRead([stringType], intType, (context, args) => ({ kind: 'int', value: Math.trunc(statSync(onePath(context, args)).mtimeMs) })),
      length: workspaceRead([stringType], intType, (context, args) => ({ kind: 'int', value: statSync(onePath(context, args)).size })),
      list: workspaceRead([stringType], stringListType, (context, args) => ({
        kind: 'list', elements: readdirSync(onePath(context, args)).map(value => ({ kind: 'string' as const, value }))
      }))
    }
  });
}
