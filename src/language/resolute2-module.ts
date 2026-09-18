import { inject, type Module, type PartialLangiumCoreServices } from 'langium';
import {
  createDefaultModule,
  createDefaultSharedModule,
  type DefaultSharedModuleContext,
  type LangiumServices,
  type LangiumSharedServices
} from 'langium/lsp';
import { Resolute2GeneratedModule, Resolute2GeneratedSharedModule } from './generated/module.js';
import type { ResoluteLibraryRegistry } from './library-api.js';
import { createDefaultLibraryRegistry } from './libraries/index.js';
import { Resolute2ScopeProvider } from './resolute2-scope-provider.js';
import { registerValidationChecks } from './resolute2-validator.js';

export type Resolute2AddedServices = {
  runtime: {
    LibraryRegistry: ResoluteLibraryRegistry
  }
};

export type Resolute2Services = LangiumServices & Resolute2AddedServices;

const Resolute2Module: Module<Resolute2Services, PartialLangiumCoreServices & Resolute2AddedServices> = {
  references: { ScopeProvider: (services: Resolute2Services) => new Resolute2ScopeProvider(services) },
  runtime: { LibraryRegistry: () => createDefaultLibraryRegistry() }
};

// Constructs the generated parser and Langium's standard LSP services, then registers Resolute checks.
export function createResolute2Services(context: DefaultSharedModuleContext) {
  const shared = inject(createDefaultSharedModule(context), Resolute2GeneratedSharedModule);
  const resolute2 = inject(
    createDefaultModule({ shared }),
    Resolute2GeneratedModule,
    Resolute2Module
  );
  shared.ServiceRegistry.register(resolute2);
  registerValidationChecks(resolute2);
  if (!context.connection) {
    shared.workspace.ConfigurationProvider.initialized({});
  }
  return { shared: shared as LangiumSharedServices, resolute2 };
}
