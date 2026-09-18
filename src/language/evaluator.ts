import type { AstNode } from 'langium';
import type { AirSnapshot } from '../model/model-provider.js';
import type { AssuranceNode, SourceLocation } from '../protocol.js';
import {
  isAssumptionAttribute, isBinaryExpression, isBooleanLiteral, isBuiltInCallExpression, isCastExpression,
  isConstantDefinition, isContextAttribute, isDomainReference, isFailExpression, isFunctionCallExpression,
  isIfExpression, isInstanceOfExpression, isIntegerLiteral, isLetExpression, isLibraryCallExpression,
  isListExpression, isQuantifiedExpression, isRealLiteral, isReferenceExpression, isSetExpression,
  isSolutionExpression, isStringClaimText, isStringLiteral, isUnaryExpression, isUndevelopedExpression,
  type ConstantDefinition, type Expression, type FunctionDefinition, type ListExpression,
  type Parameter, type QuantifiedExpression, type SetExpression
} from './generated/ast.js';
import { evaluateCoreBuiltin } from './core-builtins.js';
import { evaluateModelBuiltin } from './model-builtins.js';
import type { ResoluteLibraryRegistry } from './library-api.js';
import { displayValue, unknownValue, type ResoluteValue } from './runtime-values.js';

type Value = ResoluteValue | undefined;
type ActiveDefinition = ConstantDefinition | FunctionDefinition;

interface EvaluationResult {
  value: Value;
  children: AssuranceNode[];
  failureLocation?: SourceLocation;
}

export interface EvaluationObserver {
  debug(message: string): void;
  error(message: string, location?: SourceLocation, error?: unknown): void;
}

let activeObserver: EvaluationObserver | undefined;
let activeModelSnapshot: AirSnapshot | undefined;

// Evaluates a top-level goal and records every called claim as a child assurance case.
export function evaluateGoal(
  goal: FunctionDefinition,
  documentUri: string,
  libraries: ResoluteLibraryRegistry,
  observer?: EvaluationObserver,
  modelSnapshot?: AirSnapshot
): AssuranceNode {
  const previousObserver = activeObserver;
  const previousModelSnapshot = activeModelSnapshot;
  activeObserver = observer;
  activeModelSnapshot = modelSnapshot;
  try {
    const assurance = goal.parameters.length > 0 || goal.body.$type !== 'ClaimBody'
      ? nodeFor(goal, documentUri, 'error', "Goal '" + goal.name + "' is not an executable zero-argument claim.")
      : evaluateClaim(goal, new Map(), documentUri, new Set(), libraries);
    logEvaluationErrors(assurance);
    return assurance;
  } catch (error) {
    observer?.error("Unexpected evaluator failure in '" + goal.name + "'.", locationOf(goal, documentUri), error);
    throw error;
  } finally {
    activeObserver = previousObserver;
    activeModelSnapshot = previousModelSnapshot;
  }
}

// Evaluates one goal or strategy and converts its result into an assurance-tree node.
function evaluateClaim(
  goal: FunctionDefinition,
  environment: Map<string, Value>,
  documentUri: string,
  activeCalls: Set<ActiveDefinition>,
  libraries: ResoluteLibraryRegistry
): AssuranceNode {
  if (activeCalls.has(goal)) {
    return nodeFor(goal, documentUri, 'error', `Recursive claim call detected at '${goal.name}'.`);
  }
  if (goal.body.$type !== 'ClaimBody') {
    return nodeFor(goal, documentUri, 'error', `'${goal.name}' is not a claim.`);
  }

  activeCalls.add(goal);
  const claimEnvironment = new Map(environment);
  const attributeChildren: AssuranceNode[] = [];
  for (const attribute of goal.body.attributes) {
    if (!isContextAttribute(attribute) && !isAssumptionAttribute(attribute)) continue;
    const attributeResult = evaluate(attribute.value, claimEnvironment, documentUri, activeCalls, libraries);
    attributeChildren.push(...attributeResult.children);
    if (attribute.name) claimEnvironment.set(attribute.name, attributeResult.value);
  }
  const bodyResult = attributeChildren.some(child => child.status === 'error')
    ? result(undefined, [])
    : evaluate(goal.body.expression, claimEnvironment, documentUri, activeCalls, libraries);
  const evaluated = result(bodyResult.value, [...attributeChildren, ...bodyResult.children], bodyResult.failureLocation);
  activeCalls.delete(goal);

  const erroredChild = evaluated.children.find(child => child.status === 'error');
  const unknownChild = evaluated.children.find(child => child.status === 'unknown');
  const status: AssuranceNode['status'] = erroredChild
    ? 'error'
    : isBoolean(evaluated.value, true)
      ? 'valid'
      : isBoolean(evaluated.value, false)
        ? 'invalid'
        : evaluated.value?.kind === 'unknown'
          ? 'unknown'
          : unknownChild
          ? 'unknown'
          : isUndevelopedExpression(goal.body.expression)
          ? 'unknown'
          : 'error';
  const text = goal.body.text.map(part =>
    isStringClaimText(part) ? part.value : displayValue(claimEnvironment.get(part.reference.$refText))
  ).join('');
  const location = status === 'invalid'
    ? evaluated.failureLocation ?? locationOf(goal.body.expression, documentUri)
    : status === 'error'
      ? erroredChild?.location ?? locationOf(goal.body.expression, documentUri)
      : locationOf(goal, documentUri);

  return {
    identifier: goal.name,
    kind: goal.kind === 'strategy' ? 'strategy' : 'claim',
    status,
    text,
    location,
    references: [],
    children: evaluated.children
  };
}

// Interprets expressions while accumulating called subgoals and failure locations.
function evaluate(
  expression: Expression,
  environment: Map<string, Value>,
  documentUri: string,
  activeCalls: Set<ActiveDefinition>,
  libraries: ResoluteLibraryRegistry
): EvaluationResult {
  if (isBooleanLiteral(expression)) {
    const value = expression.value === 'true';
    return result({ kind: 'bool', value }, [], value ? undefined : locationOf(expression, documentUri));
  }
  if (isIntegerLiteral(expression) || isRealLiteral(expression)) {
    return result({ kind: isIntegerLiteral(expression) ? 'int' : 'real', value: expression.value });
  }
  if (isStringLiteral(expression)) return result({ kind: 'string', value: expression.value });

  if (isReferenceExpression(expression)) {
    const referenceName = expression.reference.$refText;
    if (environment.has(referenceName)) {
      const value = environment.get(referenceName);
      return result(value, [], isBoolean(value, false) ? locationOf(expression, documentUri) : undefined);
    }
    const target = expression.reference.ref;
    if (target && isConstantDefinition(target)) {
      if (activeCalls.has(target)) {
        return evaluationIssue(expression, target.name, `Recursive constant reference '${target.name}'.`, documentUri);
      }
      activeCalls.add(target);
      const constant = evaluate(target.value, environment, documentUri, activeCalls, libraries);
      activeCalls.delete(target);
      return constant;
    }
    return evaluationIssue(expression, referenceName, `Unknown identifier '${referenceName}'.`, documentUri);
  }

  if (isUnaryExpression(expression)) {
    const operand = evaluate(expression.expression, environment, documentUri, activeCalls, libraries);
    const value = expression.operator === 'not'
      ? operand.value?.kind === 'bool' ? { kind: 'bool' as const, value: !operand.value.value } : undefined
      : isNumber(operand.value) ? { kind: operand.value.kind, value: -operand.value.value } : undefined;
    return result(value, operand.children, isBoolean(value, false) ? locationOf(expression, documentUri) : operand.failureLocation);
  }

  if (isBinaryExpression(expression)) {
    const left = evaluate(expression.left, environment, documentUri, activeCalls, libraries);
    if (left.children.some(child => child.status === 'error')) return left;
    if (expression.operator === 'andthen' && isBoolean(left.value, false)) return left;
    if (expression.operator === 'orelse' && isBoolean(left.value, true)) return left;
    if (expression.operator === '=>' && isBoolean(left.value, false)) {
      return result({ kind: 'bool', value: true }, left.children);
    }
    const right = evaluate(expression.right, environment, documentUri, activeCalls, libraries);
    const value = evaluateBinary(expression.operator, left.value, right.value);
    const failedChild = [...left.children, ...right.children].find(child => child.status === 'invalid');
    return result(
      value,
      [...left.children, ...right.children],
      isBoolean(value, false)
        ? failedChild?.location ?? left.failureLocation ?? right.failureLocation ?? locationOf(expression, documentUri)
        : undefined
    );
  }

  if (isIfExpression(expression)) {
    const condition = evaluate(expression.condition, environment, documentUri, activeCalls, libraries);
    if (condition.value?.kind === 'unknown') return result(unknownValue, condition.children);
    if (condition.value?.kind !== 'bool') {
      return evaluationIssue(expression.condition, 'if', 'An if-expression condition did not evaluate to Boolean.', documentUri);
    }
    const branch = condition.value.value
      ? evaluate(expression.thenExpression, environment, documentUri, activeCalls, libraries)
      : evaluate(expression.elseExpression, environment, documentUri, activeCalls, libraries);
    return result(branch.value, [...condition.children, ...branch.children], branch.failureLocation);
  }

  if (isLetExpression(expression)) {
    const initializer = evaluate(expression.binding.value, environment, documentUri, activeCalls, libraries);
    const nested = new Map(environment);
    nested.set(expression.binding.name, initializer.value);
    const continuation = evaluate(expression.expression, nested, documentUri, activeCalls, libraries);
    return result(continuation.value, [...initializer.children, ...continuation.children], continuation.failureLocation);
  }

  if (isCastExpression(expression)) {
    return evaluate(expression.expression, environment, documentUri, activeCalls, libraries);
  }

  if (isInstanceOfExpression(expression)) {
    const operand = evaluate(expression.expression, environment, documentUri, activeCalls, libraries);
    if (!operand.value) return result(undefined, operand.children, operand.failureLocation);
    const value = valueHasBaseType(operand.value, expression.type.name);
    return result({ kind: 'bool', value }, operand.children, value ? undefined : locationOf(expression, documentUri));
  }

  if (isListExpression(expression) || isSetExpression(expression)) {
    return evaluateCollection(expression, environment, documentUri, activeCalls, libraries);
  }

  if (isQuantifiedExpression(expression)) {
    return evaluateQuantifier(expression, environment, documentUri, activeCalls, libraries);
  }

  if (isFailExpression(expression)) {
    const evaluatedValue = expression.value
      ? evaluate(expression.value, environment, documentUri, activeCalls, libraries)
      : result(undefined);
    if (evaluatedValue.children.some(child => child.status === 'error')) return evaluatedValue;
    const text = expression.message.length > 0
      ? expression.message.map(part => isStringClaimText(part)
        ? part.value
        : displayValue(environment.get(part.reference.$refText))).join('')
      : evaluatedValue.value ? displayValue(evaluatedValue.value) : 'Explicit failure';
    const location = locationOf(expression, documentUri);
    const failure: AssuranceNode = {
      identifier: 'fail', kind: 'message', status: 'invalid', text, location, references: [], children: []
    };
    return result({ kind: 'bool', value: false }, [...evaluatedValue.children, failure], location);
  }

  if (isSolutionExpression(expression)) {
    const evidence: AssuranceNode = {
      identifier: expression.name,
      kind: 'evidence',
      status: 'valid',
      text: expression.value,
      location: locationOf(expression, documentUri),
      references: [],
      children: []
    };
    return result({ kind: 'bool', value: true }, [evidence]);
  }
  if (isFunctionCallExpression(expression) && expression.function.ref) {
    const fn = expression.function.ref;
    const argumentsResults = expression.arguments.map(argument =>
      evaluate(argument, environment, documentUri, activeCalls, libraries)
    );
    const argumentChildren = argumentsResults.flatMap(argument => argument.children);
    if (argumentChildren.some(child => child.status === 'error')) return result(undefined, argumentChildren);
    if (expression.arguments.length !== fn.parameters.length) {
      return evaluationIssue(
        expression,
        fn.name,
        `'${fn.name}' expects ${fn.parameters.length} argument(s), but received ${expression.arguments.length}.`,
        documentUri
      );
    }
    if (argumentsResults.some(argument => argument.value?.kind === 'unknown' || !argument.value)) {
      return result(unknownValue, argumentChildren);
    }
    const nested = new Map<string, Value>();
    fn.parameters.forEach((parameter, index) => nested.set(parameter.name, argumentsResults[index].value));

    if (fn.body.$type === 'ClaimBody') {
      const child = evaluateClaim(fn, nested, documentUri, activeCalls, libraries);
      const value = child.status === 'valid'
        ? { kind: 'bool' as const, value: true }
        : child.status === 'invalid' ? { kind: 'bool' as const, value: false } : unknownValue;
      return result(value, [...argumentChildren, child], child.status === 'invalid' ? child.location : undefined);
    }
    if (activeCalls.has(fn)) {
      return evaluationIssue(expression, fn.name, `Recursive function call detected at '${fn.name}'.`, documentUri);
    }
    activeCalls.add(fn);
    const calledFunction = evaluate(fn.body.expression, nested, documentUri, activeCalls, libraries);
    activeCalls.delete(fn);
    return result(calledFunction.value, [...argumentChildren, ...calledFunction.children], calledFunction.failureLocation);
  }

  if (isFunctionCallExpression(expression)) {
    return evaluationIssue(expression, expression.function.$refText, `Unknown function '${expression.function.$refText}'.`, documentUri);
  }

  if (isLibraryCallExpression(expression)) {
    const identifier = `${expression.library}.${expression.function}`;
    if (!libraries.getLibrary(expression.library)) {
      return evaluationIssue(expression, identifier, `Unknown library '${expression.library}'.`, documentUri);
    }
    const fn = libraries.getFunction(expression.library, expression.function);
    if (!fn) return evaluationIssue(expression, identifier, `Unknown library function '${identifier}'.`, documentUri);
    const argumentResults = expression.arguments.map(argument =>
      evaluate(argument, environment, documentUri, activeCalls, libraries)
    );
    const argumentChildren = argumentResults.flatMap(argument => argument.children);
    if (argumentChildren.some(child => child.status === 'error')) return result(undefined, argumentChildren);
    if (argumentResults.some(argument => !argument.value || argument.value.kind === 'unknown')) return result(unknownValue, argumentChildren);
    if (argumentResults.length !== fn.parameters.length) {
      return evaluationIssue(
        expression,
        identifier,
        `'${identifier}' expects ${fn.parameters.length} argument(s), but received ${argumentResults.length}.`,
        documentUri
      );
    }
    try {
      return result(fn.evaluate({ documentUri }, argumentResults.map(argument => argument.value!)), argumentChildren);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      activeObserver?.error("Runtime failure in '" + identifier + "': " + message, locationOf(expression, documentUri), error);
      return evaluationIssue(expression, identifier, `${identifier}: ${message}`, documentUri);
    }
  }

  if (isBuiltInCallExpression(expression)) {
    const argumentResults = expression.arguments.map(argument =>
      evaluate(argument, environment, documentUri, activeCalls, libraries)
    );
    const children = argumentResults.flatMap(argument => argument.children);
    if (children.some(child => child.status === 'error')) return result(undefined, children);
    if (argumentResults.some(argument => !argument.value || argument.value.kind === 'unknown')) return result(unknownValue, children);
    const values = argumentResults.map(argument => argument.value!);
    if (expression.function === 'debug') {
      activeObserver?.debug(values.map(displayValue).join(''));
      return result({ kind: 'bool', value: true }, children);
    }
    try {
      const value = evaluateCoreBuiltin(expression.function, values);
      if (value) return result(value, children);
      const modelValue = evaluateModelBuiltin(expression.function, values, activeModelSnapshot);
      if (modelValue) return result(modelValue, children);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return evaluationIssue(expression, expression.function, message, documentUri);
    }
    return evaluationIssue(expression, expression.function, `Built-in '${expression.function}' requires AIR/model support or is not implemented.`, documentUri);
  }
  if (isUndevelopedExpression(expression)) return result(unknownValue);
  return evaluationIssue(expression, 'expression', 'Unknown expression type.', documentUri);
}

interface EnvironmentExpansion {
  environments: Array<Map<string, Value>>;
  children: AssuranceNode[];
}

// Evaluates a list or set literal, including filtered Cartesian-product comprehensions.
function evaluateCollection(
  expression: ListExpression | SetExpression,
  environment: Map<string, Value>,
  documentUri: string,
  activeCalls: Set<ActiveDefinition>,
  libraries: ResoluteLibraryRegistry
): EvaluationResult {
  const kind = isSetExpression(expression) ? 'set' : 'list';
  if (expression.parameters.length === 0) {
    const expressions = expression.first ? [expression.first, ...expression.rest] : [];
    const evaluated = expressions.map(item => evaluate(item, environment, documentUri, activeCalls, libraries));
    const children = evaluated.flatMap(item => item.children);
    if (children.some(child => child.status === 'error')) return result(undefined, children);
    if (evaluated.some(item => !item.value)) {
      return evaluationIssue(expression, kind, `A ${kind} element did not produce a value.`, documentUri);
    }
    const elements = evaluated.map(item => item.value!);
    return result({ kind, elements: kind === 'set' ? uniqueValues(elements) : elements }, children);
  }

  const expansion = expandEnvironments(expression.parameters, environment, documentUri, activeCalls, libraries);
  if (expansion.children.some(child => child.status === 'error')) return result(undefined, expansion.children);
  const elements: ResoluteValue[] = [];
  const children = [...expansion.children];
  for (const nested of expansion.environments) {
    if (expression.filter) {
      const filter = evaluate(expression.filter, nested, documentUri, activeCalls, libraries);
      children.push(...filter.children);
      if (filter.children.some(child => child.status === 'error')) return result(undefined, children);
      if (!filter.value) return result(undefined, children);
      if (filter.value.kind !== 'bool') {
        return evaluationIssue(expression.filter, 'filter', 'A collection filter did not evaluate to Boolean.', documentUri);
      }
      if (!filter.value.value) continue;
    }
    const mapped = evaluate(expression.first!, nested, documentUri, activeCalls, libraries);
    children.push(...mapped.children);
    if (mapped.children.some(child => child.status === 'error')) return result(undefined, children);
    if (!mapped.value) return evaluationIssue(expression.first!, kind, `A ${kind} comprehension produced no value.`, documentUri);
    elements.push(mapped.value);
  }
  return result({ kind, elements: kind === 'set' ? uniqueValues(elements) : elements }, children);
}

// Evaluates forall and exists over one or more finite, possibly dependent domains.
function evaluateQuantifier(
  expression: QuantifiedExpression,
  environment: Map<string, Value>,
  documentUri: string,
  activeCalls: Set<ActiveDefinition>,
  libraries: ResoluteLibraryRegistry
): EvaluationResult {
  const expansion = expandEnvironments(expression.parameters, environment, documentUri, activeCalls, libraries);
  const children = [...expansion.children];
  if (children.some(child => child.status === 'error')) return result(undefined, children);
  let sawUnknown = false;
  for (const nested of expansion.environments) {
    const body = evaluate(expression.expression, nested, documentUri, activeCalls, libraries);
    children.push(...body.children);
    if (body.children.some(child => child.status === 'error')) return result(undefined, children);
    if (!body.value || body.value.kind === 'unknown') {
      sawUnknown = true;
      continue;
    }
    if (body.value.kind !== 'bool') {
      return evaluationIssue(expression.expression, expression.quantifier, `The body of '${expression.quantifier}' did not evaluate to Boolean.`, documentUri);
    }
    if (expression.quantifier === 'forall' && !body.value.value) {
      return result({ kind: 'bool', value: false }, children, body.failureLocation ?? locationOf(expression.expression, documentUri));
    }
    if (expression.quantifier === 'exists' && body.value.value) {
      return result({ kind: 'bool', value: true }, children);
    }
  }
  if (sawUnknown) return result(undefined, children);
  return result({ kind: 'bool', value: expression.quantifier === 'forall' }, children,
    expression.quantifier === 'exists' ? locationOf(expression, documentUri) : undefined);
}

// Expands quantified/comprehension parameters into dependent Cartesian-product environments.
function expandEnvironments(
  parameters: readonly Parameter[],
  environment: Map<string, Value>,
  documentUri: string,
  activeCalls: Set<ActiveDefinition>,
  libraries: ResoluteLibraryRegistry
): EnvironmentExpansion {
  let environments = [new Map(environment)];
  const children: AssuranceNode[] = [];
  for (const parameter of parameters) {
    const expanded: Array<Map<string, Value>> = [];
    for (const nested of environments) {
      const domain = evaluateDomain(parameter, nested, documentUri, activeCalls, libraries);
      children.push(...domain.children);
      if (!domain.value || (domain.value.kind !== 'list' && domain.value.kind !== 'set')) {
        if (!domain.children.some(child => child.status === 'error')) {
          const issue = evaluationIssue(parameter, parameter.name, `Domain of '${parameter.name}' is not a finite collection.`, documentUri);
          children.push(...issue.children);
        }
        return { environments: [], children };
      }
      for (const value of domain.value.elements) {
        const bound = new Map(nested);
        bound.set(parameter.name, value);
        expanded.push(bound);
      }
    }
    environments = expanded;
  }
  return { environments, children };
}

// Resolves one finite parameter domain from its lexical environment or constant declaration.
function evaluateDomain(
  parameter: Parameter,
  environment: Map<string, Value>,
  documentUri: string,
  activeCalls: Set<ActiveDefinition>,
  libraries: ResoluteLibraryRegistry
): EvaluationResult {
  if (!isDomainReference(parameter.declared)) {
    return evaluationIssue(parameter, parameter.name, `Domain of '${parameter.name}' must name a finite collection.`, documentUri);
  }
  const name = parameter.declared.reference.$refText;
  if (environment.has(name)) return result(environment.get(name));
  const target = parameter.declared.reference.ref;
  if (target && isConstantDefinition(target)) {
    if (activeCalls.has(target)) return evaluationIssue(parameter, name, `Recursive constant reference '${name}'.`, documentUri);
    activeCalls.add(target);
    const domain = evaluate(target.value, environment, documentUri, activeCalls, libraries);
    activeCalls.delete(target);
    return domain;
  }
  return evaluationIssue(parameter, name, `Unknown finite domain '${name}'.`, documentUri);
}

// Removes structural duplicates from set literals and set comprehensions.
function uniqueValues(values: readonly ResoluteValue[]): ResoluteValue[] {
  const unique: ResoluteValue[] = [];
  for (const value of values) if (!unique.some(existing => equalValues(existing, value))) unique.push(value);
  return unique;
}

// Implements primitive instanceof checks without claiming AIR model-type support.
function valueHasBaseType(value: ResoluteValue, type: string): boolean {
  switch (type) {
    case 'bool': return value.kind === 'bool';
    case 'int': return value.kind === 'int';
    case 'real': return value.kind === 'int' || value.kind === 'real';
    case 'string': return value.kind === 'string';
    case 'record': return value.kind === 'record';
    case 'range': return value.kind === 'range';
    case 'aadl': return value.kind === 'model';
    case 'component': case 'feature': case 'connection': case 'flow': return value.kind === 'model' && value.modelKind === type;
    default: return false;
  }
}
// Creates an explicit assurance child for an unresolved or unsupported runtime term.
function evaluationIssue(node: AstNode, identifier: string, text: string, uri: string): EvaluationResult {
  const location = locationOf(node, uri);
  return result(undefined, [{ identifier, kind: 'message', status: 'error', text, location, references: [], children: [] }]);
}

// Creates a normalized expression result with optional assurance children.
function result(value: Value, children: AssuranceNode[] = [], failureLocation?: SourceLocation): EvaluationResult {
  return { value, children, failureLocation };
}
// Mirrors explicit assurance errors to the host diagnostic logger once per evaluation.
function logEvaluationErrors(node: AssuranceNode): void {
  if (node.status === 'error' && node.kind === 'message') activeObserver?.error(node.text, node.location);
  node.children.forEach(logEvaluationErrors);
}


// Recognizes one Boolean constructor and optionally checks its payload.
function isBoolean(value: Value, expected?: boolean): value is Extract<ResoluteValue, { kind: 'bool' }> {

  return value?.kind === 'bool' && (expected === undefined || value.value === expected);
}

// Recognizes the numeric constructors shared by arithmetic and comparison operators.
function isNumber(value: Value): value is Extract<ResoluteValue, { kind: 'int' | 'real' }> {
  return value?.kind === 'int' || value?.kind === 'real';
}

// Implements primitive Resolute operators over the closed runtime value algebra.
function evaluateBinary(operator: string, left: Value, right: Value): Value {
  if (!left || !right) return undefined;
  if (left.kind === 'unknown' || right.kind === 'unknown') return unknownValue;
  if (operator === '=') return { kind: 'bool', value: equalValues(left, right) };
  if (operator === '<>') return { kind: 'bool', value: !equalValues(left, right) };
  if (isBoolean(left) && isBoolean(right)) {
    if (operator === 'and' || operator === 'andthen') return { kind: 'bool', value: left.value && right.value };
    if (operator === 'or' || operator === 'orelse') return { kind: 'bool', value: left.value || right.value };
    if (operator === '=>') return { kind: 'bool', value: !left.value || right.value };
  }
  if (operator === '+' && (left.kind === 'string' || right.kind === 'string')) {
    return { kind: 'string', value: `${displayValue(left)}${displayValue(right)}` };
  }
  if (!isNumber(left) || !isNumber(right)) return undefined;
  const numericKind = left.kind === 'real' || right.kind === 'real' || operator === '/' ? 'real' : 'int';
  switch (operator) {
    case '+': return { kind: numericKind, value: left.value + right.value };
    case '-': return { kind: numericKind, value: left.value - right.value };
    case '*': return { kind: numericKind, value: left.value * right.value };
    case '/': return { kind: 'real', value: left.value / right.value };
    case '%': return { kind: numericKind, value: left.value % right.value };
    case '^': return { kind: numericKind, value: left.value ** right.value };
    case '<': return { kind: 'bool', value: left.value < right.value };
    case '<=': return { kind: 'bool', value: left.value <= right.value };
    case '>': return { kind: 'bool', value: left.value > right.value };
    case '>=': return { kind: 'bool', value: left.value >= right.value };
    default: return undefined;
  }
}

// Compares primitive and structural values without exposing JavaScript object identity.
function equalValues(left: ResoluteValue, right: ResoluteValue): boolean {
  if (left.kind !== right.kind) return isNumber(left) && isNumber(right) && left.value === right.value;
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
  if (left.kind === 'model') {
    const other = right as typeof left;
    return left.revision === other.revision && left.id === other.id;
  }
  if (left.kind === 'range') {
    const other = right as typeof left;
    return equalValues(left.lower, other.lower) && equalValues(left.upper, other.upper);
  }
  if (left.kind === 'unknown') return true;
  if (left.kind === 'null') return true;
  return left.value === (right as typeof left).value;
}

// Converts an AST node's concrete syntax location to a transport-neutral location.
function locationOf(node: AstNode, uri: string): SourceLocation {
  const range = node.$cstNode?.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
  return { uri, range };
}

// Creates an assurance node without leaking Langium or Eclipse objects into the protocol.
function nodeFor(
  node: FunctionDefinition,
  uri: string,
  status: AssuranceNode['status'],
  text: string,
  children: AssuranceNode[] = []
): AssuranceNode {
  return { identifier: node.name, kind: 'claim', status, text, location: locationOf(node, uri), references: [], children };
}
