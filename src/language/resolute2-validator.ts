import type { ValidationAcceptor, ValidationChecks } from 'langium';
import {
  isBooleanLiteral, isIntegerLiteral, isLibraryCallExpression, isRealLiteral, isStringLiteral,
  type Expression, type FunctionCallExpression, type FunctionDefinition, type LibraryCallExpression,
  type LibraryType, type Model, type Resolute2AstType
} from './generated/ast.js';
import type { ResoluteLibraryRegistry } from './library-api.js';
import type { Resolute2Services } from './resolute2-module.js';
import type { ResoluteType } from './runtime-values.js';

// Registers semantic checks that go beyond grammar recognition and name linking.
export function registerValidationChecks(services: Resolute2Services): void {
  const libraries = services.runtime.LibraryRegistry;
  const checks: ValidationChecks<Resolute2AstType> = {
    Model: checkDuplicateDefinitions,
    FunctionDefinition: checkFunctionDefinition,
    FunctionCallExpression: checkFunctionArity,
    LibraryCallExpression: (call, accept) => checkLibraryCall(call, accept, libraries),
    LibraryType: (type, accept) => checkLibraryType(type, accept, libraries)
  };
  services.validation.ValidationRegistry.register(checks);
}

// Checks the relationship between a definition's claim marker and body, then its parameters.
function checkFunctionDefinition(fn: FunctionDefinition, accept: ValidationAcceptor): void {
  if (fn.kind && fn.body.$type !== 'ClaimBody') {
    accept('error', "The '" + fn.kind + "' keyword may only prefix a claim body introduced by '<='.", {
      node: fn,
      property: 'kind'
    });
  }
  checkDuplicateParameters(fn, accept);
}

// Rejects ambiguous top-level names in Resolute's single definition namespace.
function checkDuplicateDefinitions(model: Model, accept: ValidationAcceptor): void {
  const seen = new Set<string>();
  for (const definition of model.definitions) {
    if (seen.has(definition.name)) {
      accept('error', `Duplicate definition '${definition.name}'.`, { node: definition, property: 'name' });
    }
    seen.add(definition.name);
  }
}

// Rejects repeated formal parameter names within one function or claim.
function checkDuplicateParameters(fn: FunctionDefinition, accept: ValidationAcceptor): void {
  const seen = new Set<string>();
  for (const parameter of fn.parameters) {
    if (seen.has(parameter.name)) {
      accept('error', `Duplicate parameter '${parameter.name}'.`, { node: parameter, property: 'name' });
    }
    seen.add(parameter.name);
  }
}

// Checks call arity after Langium has resolved the call's cross-reference.
function checkFunctionArity(call: FunctionCallExpression, accept: ValidationAcceptor): void {
  const fn = call.function.ref;
  if (fn && call.arguments.length !== fn.parameters.length) {
    accept('error', `'${fn.name}' expects ${fn.parameters.length} argument(s), but received ${call.arguments.length}.`, {
      node: call, property: 'arguments'
    });
  }
}

// Resolves a qualified library call and checks its signature from the shared registry.
function checkLibraryCall(call: LibraryCallExpression, accept: ValidationAcceptor, libraries: ResoluteLibraryRegistry): void {
  const library = libraries.getLibrary(call.library);
  if (!library) {
    accept('error', `Unknown Resolute library '${call.library}'.`, { node: call, property: 'library' });
    return;
  }
  const fn = libraries.getFunction(call.library, call.function);
  if (!fn) {
    accept('error', `Library '${library.name}' has no function '${call.function}'.`, { node: call, property: 'function' });
    return;
  }
  if (call.arguments.length !== fn.parameters.length) {
    accept('error', `'${library.name}.${call.function}' expects ${fn.parameters.length} argument(s), but received ${call.arguments.length}.`, {
      node: call, property: 'arguments'
    });
    return;
  }
  call.arguments.forEach((argument, index) => {
    const actual = inferExpressionType(argument, libraries);
    const expected = fn.parameters[index];
    if (actual && !compatible(actual, expected)) {
      accept('error', `Argument ${index + 1} of '${library.name}.${call.function}' expects ${typeName(expected)}, but received ${typeName(actual)}.`, {
        node: argument
      });
    }
  });
}

// Checks qualified external types through the same registry used by function calls.
function checkLibraryType(type: LibraryType, accept: ValidationAcceptor, libraries: ResoluteLibraryRegistry): void {
  if (!libraries.getLibrary(type.library)) {
    accept('error', `Unknown Resolute library '${type.library}'.`, { node: type, property: 'library' });
  } else if (!libraries.getType(type.library, type.name)) {
    accept('error', `Library '${type.library}' has no type '${type.name}'.`, { node: type, property: 'name' });
  }
}

// Infers the expression forms whose types are intrinsic or supplied by a library signature.
function inferExpressionType(expression: Expression, libraries: ResoluteLibraryRegistry): ResoluteType | undefined {
  if (isBooleanLiteral(expression)) return { kind: 'bool' };
  if (isIntegerLiteral(expression)) return { kind: 'int' };
  if (isRealLiteral(expression)) return { kind: 'real' };
  if (isStringLiteral(expression)) return { kind: 'string' };
  if (isLibraryCallExpression(expression)) return libraries.getFunction(expression.library, expression.function)?.returnType;
  return undefined;
}

// Implements the initial signature compatibility relation, including int-to-real promotion.
function compatible(actual: ResoluteType, expected: ResoluteType): boolean {
  if (expected.kind === 'any') return true;
  if (actual.kind === 'int' && expected.kind === 'real') return true;
  if (actual.kind !== expected.kind) return false;
  if (actual.kind === 'external' && expected.kind === 'external') {
    return actual.library.toLowerCase() === expected.library.toLowerCase()
      && actual.name.toLowerCase() === expected.name.toLowerCase();
  }
  if ((actual.kind === 'list' || actual.kind === 'set') && (expected.kind === 'list' || expected.kind === 'set')) {
    return compatible(actual.element, expected.element);
  }
  return true;
}

// Formats a runtime type for stable, user-facing diagnostics.
function typeName(type: ResoluteType): string {
  if (type.kind === 'external') return `${type.library}.${type.name}`;
  if (type.kind === 'list') return `[${typeName(type.element)}]`;
  if (type.kind === 'set') return `{${typeName(type.element)}}`;
  return type.kind;
}
