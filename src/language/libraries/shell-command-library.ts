import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineLibrary, ResoluteLibraryError, type ResoluteLibraryFunction } from '../library-api.js';
import { intType, stringType, type ResoluteType, type ResoluteValue } from '../runtime-values.js';

const shellResultType: ResoluteType = { kind: 'external', library: 'ShellCmd', name: 'shell_return_type' };

export interface ShellCommandLibraryOptions {
  readonly enabled: boolean;
  readonly timeoutMs?: number;
}

// Declares one process-effecting operation with common metadata.
function processFunction(parameters: readonly ResoluteType[], returnType: ResoluteType, evaluate: ResoluteLibraryFunction['evaluate']): ResoluteLibraryFunction {
  return { parameters, returnType, documentation: 'Executes or inspects a ShellCmd process result.', effect: 'process', evaluate };
}

// Splits the legacy command format without invoking a shell or expanding metacharacters.
function tokenize(command: string): string[] {
  const arguments_: string[] = [];
  const pattern = /'([^']*)'|\S+/g;
  for (const match of command.matchAll(pattern)) arguments_.push(match[1] ?? match[0]);
  return arguments_;
}

// Extracts a string argument from the closed Resolute value algebra.
function stringAt(arguments_: readonly ResoluteValue[], index: number): string {
  const value = arguments_[index];
  if (value?.kind !== 'string') throw new ResoluteLibraryError(`Argument ${index + 1} must be a string.`);
  return value.value;
}

// Extracts one field from the opaque ShellCmd result record.
function resultField(arguments_: readonly ResoluteValue[], field: 'return_code' | 'output'): ResoluteValue {
  const value = arguments_[0];
  if (value?.kind !== 'record') throw new ResoluteLibraryError('Argument 1 must be a ShellCmd.shell_return_type value.');
  const fieldValue = value.fields.get(field);
  if (!fieldValue) throw new ResoluteLibraryError(`ShellCmd result has no '${field}' field.`);
  return fieldValue;
}

// Converts a source document URI into the command's working directory.
function workingDirectory(documentUri: string): string | undefined {
  try {
    const url = new URL(documentUri);
    return url.protocol === 'file:' ? dirname(fileURLToPath(url)) : undefined;
  } catch {
    return undefined;
  }
}

// Constructs a ShellCmd library whose execution authority is fixed at server startup.
export function createShellCommandLibrary(options: ShellCommandLibraryOptions) {
  const requireEnabled = (): void => {
    if (!options.enabled) {
      throw new ResoluteLibraryError('ShellCmd is disabled. Enable resolute2.shellCmd.enabled in a trusted workspace and restart the Resolute2 server.');
    }
  };

  return defineLibrary({
    name: 'ShellCmd',
    types: { shell_return_type: shellResultType },
    functions: {
      exec: processFunction([stringType], shellResultType, (context, arguments_) => {
        requireEnabled();
        const [executable, ...args] = tokenize(stringAt(arguments_, 0));
        if (!executable) throw new ResoluteLibraryError('ShellCmd.exec requires a non-empty command.');
        const completed = spawnSync(executable, args, {
          cwd: workingDirectory(context.documentUri),
          encoding: 'utf8',
          shell: false,
          timeout: options.timeoutMs ?? 30_000
        });
        if (completed.error) throw new ResoluteLibraryError(`Unable to execute '${executable}': ${completed.error.message}`);
        const output = `${completed.stdout ?? ''}${completed.stderr ?? ''}`;
        return {
          kind: 'record',
          fields: new Map<string, ResoluteValue>([
            ['return_code', { kind: 'int', value: completed.status ?? -1 }],
            ['output', { kind: 'string', value: output }]
          ])
        };
      }),
      get_return_code: processFunction([shellResultType], intType, (_context, arguments_) => {
        requireEnabled();
        return resultField(arguments_, 'return_code');
      }),
      get_output: processFunction([shellResultType], stringType, (_context, arguments_) => {
        requireEnabled();
        return resultField(arguments_, 'output');
      })
    }
  });
}
