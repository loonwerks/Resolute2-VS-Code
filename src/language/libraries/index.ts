import { DefaultResoluteLibraryRegistry, type ResoluteLibraryRegistry } from '../library-api.js';
import { createFileAccessLibrary } from './file-access-library.js';
import { jsonLibrary } from './json-library.js';
import { createShellCommandLibrary } from './shell-command-library.js';
import { stringLibrary } from './string-library.js';

export interface DefaultLibraryOptions {
  readonly shellCommandsEnabled?: boolean;
  readonly fileAccessEnabled?: boolean;
  readonly workspaceRoots?: readonly string[];
}

// Reads effectful-library capabilities supplied by the trusted extension host.
function defaultLibraryOptions(): DefaultLibraryOptions {
  let workspaceRoots: string[] = [];
  try {
    const parsed: unknown = JSON.parse(process.env.RESOLUTE2_WORKSPACE_ROOTS ?? '[]');
    if (Array.isArray(parsed) && parsed.every(root => typeof root === 'string')) workspaceRoots = parsed;
  } catch {
    workspaceRoots = [];
  }
  return {
    shellCommandsEnabled: process.env.RESOLUTE2_SHELL_CMD_ENABLED === 'true',
    fileAccessEnabled: process.env.RESOLUTE2_FILE_ACCESS_ENABLED === 'true',
    workspaceRoots
  };
}

// Builds the bundled registry with explicit capabilities for effectful libraries.
export function createDefaultLibraryRegistry(options: DefaultLibraryOptions = defaultLibraryOptions()): ResoluteLibraryRegistry {
  const registry = new DefaultResoluteLibraryRegistry();
  registry.register(jsonLibrary);
  registry.register(stringLibrary);
  registry.register(createFileAccessLibrary({ enabled: options.fileAccessEnabled ?? false, workspaceRoots: options.workspaceRoots ?? [] }));
  registry.register(createShellCommandLibrary({ enabled: options.shellCommandsEnabled ?? false }));
  return registry;
}
