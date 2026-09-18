import {
  AstUtils,
  DefaultScopeProvider,
  type AstNode,
  type LangiumCoreServices,
  type ReferenceInfo,
  type Scope,
} from 'langium';
import {
  isClaimBody,
  isAssumptionAttribute,
  isContextAttribute,
  isFunctionDefinition,
  isLetExpression,
  isListExpression,
  isModel,
  isQuantifiedExpression,
  isSetExpression,
  type NamedElement,
  type Parameter
} from './generated/ast.js';

// Supplies Resolute's lexically nested declarations to Langium's linker.
export class Resolute2ScopeProvider extends DefaultScopeProvider {
  constructor(services: LangiumCoreServices) {
    super(services);
  }

  // Extends workspace scope with binders visible at the reference position.
  override getScope(context: ReferenceInfo): Scope {
    const referenceType = this.reflection.getReferenceType(context);
    let result = this.getGlobalScope(referenceType, context);
    const root = AstUtils.findRootNode(context.container);
    if (isModel(root)) {
      const compatibleDefinitions = root.definitions.filter(definition =>
        this.reflection.isSubtype(definition.$type, referenceType)
      );
      result = this.createScopeForNodes(compatibleDefinitions, result);
    }
    const frames = lexicalFrames(context.container);
    for (let index = frames.length - 1; index >= 0; index--) {
      result = this.createScopeForNodes(frames[index], result);
    }
    return result;
  }
}

// Collects scope frames from the innermost binder toward the file root.
function lexicalFrames(start: AstNode): NamedElement[][] {
  const frames: NamedElement[][] = [];
  let child: AstNode = start;
  let current = start.$container;

  while (current) {
    if (isLetExpression(current) && child === current.expression) {
      frames.push([current.binding]);
    } else if (isFunctionDefinition(current)) {
      const parameters = visibleParameters(current.parameters, child);
      if (parameters.length > 0) {
        frames.push(parameters);
      }
    } else if (isQuantifiedExpression(current) || isListExpression(current) || isSetExpression(current)) {
      const parameters = visibleParameters(current.parameters, child);
      if (parameters.length > 0) {
        frames.push(parameters);
      }
    } else if (isClaimBody(current) && child === current.expression) {
      const attributes = current.attributes.filter(
        (attribute) => isContextAttribute(attribute) || isAssumptionAttribute(attribute)
      );
      if (attributes.length > 0) {
        frames.push(attributes);
      }
    }
    child = current;
    current = current.$container;
  }
  return frames;
}

// Makes all binder parameters visible in a body, but only preceding parameters
// visible while checking a later parameter's domain.
function visibleParameters(parameters: Parameter[], child: AstNode): Parameter[] {
  const parameterIndex = parameters.findIndex(parameter => parameter === child);
  return parameterIndex >= 0 ? parameters.slice(0, parameterIndex) : parameters;
}
