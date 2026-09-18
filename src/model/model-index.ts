import type { SourceLocation } from '../protocol.js';

export interface ModelMetadata {
  propertyEnumerations?: ReadonlyArray<{ name: string; values: readonly string[] }>;
}

export type ModelElementKind = 'component' | 'classifier' | 'property' | 'feature' | 'connection' | 'flow';

export interface ModelElement {
  id: string;
  kind: ModelElementKind;
  airPath: readonly string[];
  name: string;
  displayPath: string;
  hasSysmlPath: boolean;
  parentId?: string;
  category?: string;
  classifier?: string;
  source?: SourceLocation;
  children: readonly string[];
  features: readonly string[];
  connections: readonly string[];
  flows: readonly string[];
  properties: readonly unknown[];
  direction?: string;
  sourceId?: string;
  destinationId?: string;
  bidirectional?: boolean;
  accessCategory?: string;
  modeNames?: readonly string[];
  arrayMember?: boolean;
  hasPrototypes?: boolean;
  enumerationValues?: readonly string[];
  flowElementIds?: readonly string[];
  incomingErrors?: readonly string[];
  outgoingErrors?: readonly string[];
  containedErrors?: readonly string[];
  reachableErrorStates?: readonly string[];
}

export interface ModelIndex {
  elements: ReadonlyMap<string, ModelElement>;
  roots: readonly string[];
  sysmlAliases: ReadonlyMap<string, readonly string[]>;
  definitionAliases: ReadonlyMap<string, string>;
  airAliases: ReadonlyMap<string, string>;
}

const AIR_PREFIX = 'AIR_DEBUG_NAMESPACE::';

/** Builds a stable, evaluator-oriented index from one or more canonical AIR documents. */
export function buildModelIndex(airDocuments: readonly string[], metadata?: ModelMetadata): ModelIndex {
  const elements = new Map<string, ModelElement>();
  const roots: string[] = [];
  const sysmlAliases = new Map<string, string[]>();
  const definitionAliases = new Map<string, string>();
  const airAliases = new Map<string, string>();
  const pendingConnections: Array<{ ownerId: string; raw: any }> = [];

  airDocuments.forEach((json, modelIndex) => {
    const aadl = JSON.parse(json) as any;
    for (const component of array(aadl.components)) {
      roots.push(visitComponent(
        component, undefined, undefined, false, modelIndex, elements, sysmlAliases,
        definitionAliases, airAliases, pendingConnections
      ));
    }
    for (const dataComponent of array(aadl.dataComponents)) {
      indexDataDefinition(dataComponent, modelIndex, elements, definitionAliases);
    }
  });

  for (const pending of pendingConnections) {
    indexConnections(pending.ownerId, pending.raw, elements, sysmlAliases, airAliases);
  }
  completeComponentConnections(elements);
  indexPropertyDefinitions(metadata, elements, definitionAliases);
  return { elements, roots, sysmlAliases, definitionAliases, airAliases };
}

/** Resolves one fully qualified SysML definition name. */
export function resolveModelDefinition(index: ModelIndex, name: string): string | undefined {
  return index.definitionAliases.get(name.toLowerCase());
}

/** Resolves a SysML-facing alias or an explicitly prefixed AIR path. */
export function resolveModelName(index: ModelIndex, name: string): readonly string[] {
  if (name.startsWith(AIR_PREFIX)) {
    const id = index.airAliases.get(name.slice(AIR_PREFIX.length).toLowerCase());
    return id ? [id] : [];
  }
  return index.sysmlAliases.get(name.toLowerCase()) ?? [];
}

function visitComponent(
  raw: any,
  parentId: string | undefined,
  parentDisplayPath: string | undefined,
  parentHasSysmlPath: boolean,
  modelIndex: number,
  elements: Map<string, ModelElement>,
  aliases: Map<string, string[]>,
  definitionAliases: Map<string, string>,
  airAliases: Map<string, string>,
  pendingConnections: Array<{ ownerId: string; raw: any }>
): string {
  const path = nameSegments(raw.identifier);
  const id = identity(modelIndex, 'component', path);
  const classifier = optionClassifier(raw.classifier);
  const airLocalName = path.at(-1) ?? '';
  const isRoot = parentId === undefined;
  const name = isRoot && classifier ? shortName(classifier) : airLocalName;
  const sysmlPath = isRoot
    ? classifier
    : parentHasSysmlPath && parentDisplayPath ? `${parentDisplayPath}.${airLocalName}` : undefined;
  const displayPath = sysmlPath ?? path.join('::');
  const hasSysmlPath = sysmlPath !== undefined;
  const childIds = array(raw.subComponents).map((child: any) =>
    visitComponent(
      child, id, displayPath, hasSysmlPath, modelIndex, elements, aliases,
      definitionAliases, airAliases, pendingConnections
    ));
  const featureIds = array(raw.features).map((feature: any) =>
    visitFeature(feature, id, displayPath, hasSysmlPath, modelIndex, elements, aliases, airAliases));
  const flowIds = array(raw.flows).map((flow: any) =>
    visitFlow(flow, id, displayPath, hasSysmlPath, modelIndex, elements, aliases, airAliases));
  const errors = errorFacts(raw.annexes);
  elements.set(id, {
    id, kind: 'component', airPath: path, name, displayPath, hasSysmlPath, parentId,
    category: enumValue(raw.category), classifier, source: sourceLocation(raw.identifier?.pos),
    children: childIds, features: featureIds, connections: [], flows: flowIds, properties: array(raw.properties),
    modeNames: array(raw.modes).map((mode: any) => displayName(mode.name)),
    arrayMember: hasArrayIndex(raw, airLocalName),
    hasPrototypes: array(raw.prototypes).length > 0 || array(raw.prototypeBindings).length > 0,
    ...errors
  });
  airAliases.set(path.join('::').toLowerCase(), id);
  if (hasSysmlPath) addAlias(aliases, displayPath.toLowerCase(), id);
  if (isRoot && classifier) addAlias(aliases, name.toLowerCase(), id);
  if (classifier) {
    addAlias(aliases, classifier.toLowerCase(), id);
    indexClassifierDefinition(raw, classifier, isRoot, modelIndex, errors, elements, definitionAliases);
  }
  pendingConnections.push({ ownerId: id, raw });
  return id;
}

function indexClassifierDefinition(
  raw: any,
  classifier: string,
  isRoot: boolean,
  modelIndex: number,
  errors: ReturnType<typeof errorFacts>,
  elements: Map<string, ModelElement>,
  definitionAliases: Map<string, string>
): void {
  const normalized = classifier.toLowerCase();
  const classifierId = definitionAliases.get(normalized) ?? identity(modelIndex, 'classifier', [classifier]);
  if (!elements.has(classifierId)) {
    elements.set(classifierId, {
      id: classifierId, kind: 'classifier', airPath: [classifier], name: shortName(classifier),
      displayPath: classifier, hasSysmlPath: true, classifier, source: sourceLocation(raw.identifier?.pos),
      children: [], features: [], connections: [], flows: [], properties: []
    });
  }
  const definition = elements.get(classifierId)!;
  elements.set(classifierId, {
    ...definition,
    category: definition.category ?? enumValue(raw.category),
    source: isRoot ? sourceLocation(raw.identifier?.pos) : definition.source,
    properties: mergeProperties(definition.properties, array(raw.properties)),
    modeNames: mergeStrings(definition.modeNames, array(raw.modes).map((mode: any) => displayName(mode.name))),
    arrayMember: definition.arrayMember || hasArrayIndex(raw, nameSegments(raw.identifier).at(-1) ?? ''),
    hasPrototypes: definition.hasPrototypes || array(raw.prototypes).length > 0 || array(raw.prototypeBindings).length > 0,
    incomingErrors: mergeStrings(definition.incomingErrors, errors.incomingErrors),
    outgoingErrors: mergeStrings(definition.outgoingErrors, errors.outgoingErrors),
    containedErrors: mergeStrings(definition.containedErrors, errors.containedErrors),
    reachableErrorStates: mergeStrings(definition.reachableErrorStates, errors.reachableErrorStates)
  });
  definitionAliases.set(normalized, classifierId);
}

function visitFeature(
  raw: any,
  parentId: string,
  parentDisplayPath: string,
  parentHasSysmlPath: boolean,
  modelIndex: number,
  elements: Map<string, ModelElement>,
  aliases: Map<string, string[]>,
  airAliases: Map<string, string>
): string {
  const path = nameSegments(raw.identifier);
  const id = identity(modelIndex, 'feature', path);
  const name = path.at(-1) ?? '';
  const sysmlPath = parentHasSysmlPath ? `${parentDisplayPath}.${name}` : undefined;
  const displayPath = sysmlPath ?? path.join('::');
  const hasSysmlPath = sysmlPath !== undefined;
  const nested = array(raw.features).map((feature: any) =>
    visitFeature(feature, id, displayPath, hasSysmlPath, modelIndex, elements, aliases, airAliases));
  elements.set(id, {
    id, kind: 'feature', airPath: path, name, displayPath, hasSysmlPath, parentId,
    category: enumValue(raw.category), classifier: optionClassifier(raw.classifier),
    source: sourceLocation(raw.identifier?.pos), children: [], features: nested, connections: [], flows: [],
    properties: array(raw.properties), direction: enumValue(raw.direction),
    accessCategory: enumValue(raw.accessCategory), arrayMember: hasArrayIndex(raw, name)
  });
  airAliases.set(path.join('::').toLowerCase(), id);
  if (hasSysmlPath) addAlias(aliases, displayPath.toLowerCase(), id);
  return id;
}

function visitFlow(
  raw: any,
  parentId: string,
  parentDisplayPath: string,
  parentHasSysmlPath: boolean,
  modelIndex: number,
  elements: Map<string, ModelElement>,
  aliases: Map<string, string[]>,
  airAliases: Map<string, string>
): string {
  const path = nameSegments(raw.name);
  const id = identity(modelIndex, 'flow', path);
  const name = path.at(-1) ?? '';
  const sysmlPath = parentHasSysmlPath ? `${parentDisplayPath}.${name}` : undefined;
  const displayPath = sysmlPath ?? path.join('::');
  const hasSysmlPath = sysmlPath !== undefined;
  const sourceId = endpointNameId(optionValue(raw.source), elements, airAliases);
  const destinationId = endpointNameId(optionValue(raw.sink), elements, airAliases);
  elements.set(id, {
    id, kind: 'flow', airPath: path, name, displayPath, hasSysmlPath, parentId,
    category: enumValue(raw.kind), source: sourceLocation(raw.name?.pos),
    children: [], features: [], connections: [], flows: [], properties: [], sourceId, destinationId,
    flowElementIds: [sourceId, destinationId].filter((value): value is string => Boolean(value))
  });
  airAliases.set(path.join('::').toLowerCase(), id);
  if (hasSysmlPath) addAlias(aliases, displayPath.toLowerCase(), id);
  return id;
}

function indexConnections(
  ownerId: string,
  raw: any,
  elements: Map<string, ModelElement>,
  aliases: Map<string, string[]>,
  airAliases: Map<string, string>
): void {
  const owner = elements.get(ownerId);
  if (!owner) return;
  const connectionIds: string[] = [];
  for (const connection of array(raw.connections)) {
    const path = nameSegments(connection.name);
    const id = identity(Number(ownerId.split(':', 1)[0]), 'connection', path);
    const name = path.at(-1) ?? '';
    const sysmlPath = owner.hasSysmlPath ? `${owner.displayPath}.${name}` : undefined;
    const displayPath = sysmlPath ?? path.join('::');
    const hasSysmlPath = sysmlPath !== undefined;
    const sourceId = endpointId(connection.src?.[0], elements, airAliases);
    const destinationId = endpointId(connection.dst?.[0], elements, airAliases);
    elements.set(id, {
      id, kind: 'connection', airPath: path, name, displayPath, hasSysmlPath, parentId: ownerId,
      category: enumValue(connection.kind), source: sourceLocation(connection.name?.pos),
      children: [], features: [], connections: [], flows: [], properties: array(connection.properties),
      sourceId, destinationId, bidirectional: Boolean(connection.isBiDirectional)
    });
    airAliases.set(path.join('::').toLowerCase(), id);
    if (hasSysmlPath) addAlias(aliases, displayPath.toLowerCase(), id);
    connectionIds.push(id);
    attachConnection(sourceId, id, elements);
    attachConnection(destinationId, id, elements);
  }
  const currentOwner = elements.get(ownerId) ?? owner;
  elements.set(ownerId, { ...currentOwner, connections: mergeStrings(currentOwner.connections, connectionIds) });
}

function endpointId(
  endpoint: any,
  elements: Map<string, ModelElement>,
  airAliases: Map<string, string>
): string | undefined {
  if (!endpoint) return undefined;
  const componentPath = nameSegments(endpoint.component);
  const featurePath = optionValue(endpoint.feature) ? nameSegments(optionValue(endpoint.feature)) : [];
  const targetPath = featurePath.length > 0 ? featurePath : componentPath;
  return endpointPathId(targetPath, elements, airAliases);
}

function endpointNameId(
  name: any,
  elements: Map<string, ModelElement>,
  airAliases: Map<string, string>
): string | undefined {
  return endpointPathId(nameSegments(name), elements, airAliases);
}

function endpointPathId(
  path: readonly string[],
  elements: Map<string, ModelElement>,
  airAliases: Map<string, string>
): string | undefined {
  if (path.length === 0) return undefined;
  const normalized = path.join('::').toLowerCase();
  return airAliases.get(normalized)
    ?? [...elements.values()].find(element => element.airPath.join('::').toLowerCase() === normalized)?.id;
}

function attachConnection(
  elementId: string | undefined,
  connectionId: string,
  elements: Map<string, ModelElement>
): void {
  if (!elementId) return;
  const element = elements.get(elementId);
  if (element && !element.connections.includes(connectionId)) {
    elements.set(elementId, { ...element, connections: [...element.connections, connectionId] });
  }
}

function completeComponentConnections(elements: Map<string, ModelElement>): void {
  for (const element of [...elements.values()]) {
    if (element.kind !== 'component') continue;
    const featureConnections = element.features.flatMap(featureId => descendantFeatureConnections(featureId, elements));
    elements.set(element.id, { ...element, connections: mergeStrings(element.connections, featureConnections) });
  }
}

function descendantFeatureConnections(featureId: string, elements: Map<string, ModelElement>): string[] {
  const feature = elements.get(featureId);
  if (!feature) return [];
  return [...feature.connections, ...feature.features.flatMap(id => descendantFeatureConnections(id, elements))];
}

function indexDataDefinition(
  raw: any,
  modelIndex: number,
  elements: Map<string, ModelElement>,
  definitionAliases: Map<string, string>
): void {
  const classifier = optionClassifier(raw.classifier);
  if (!classifier) return;
  const normalized = classifier.toLowerCase();
  const id = definitionAliases.get(normalized) ?? identity(modelIndex, 'classifier', [classifier]);
  const existing = elements.get(id);
  elements.set(id, {
    id, kind: 'classifier', airPath: [classifier], name: shortName(classifier), displayPath: classifier,
    hasSysmlPath: true, classifier, category: existing?.category ?? enumValue(raw.category),
    source: existing?.source ?? sourceLocation(raw.identifier?.pos), children: [], features: [], connections: [], flows: [],
    properties: mergeProperties(existing?.properties ?? [], array(raw.properties))
  });
  definitionAliases.set(normalized, id);
}

function indexPropertyDefinitions(
  metadata: ModelMetadata | undefined,
  elements: Map<string, ModelElement>,
  definitionAliases: Map<string, string>
): void {
  for (const property of metadata?.propertyEnumerations ?? []) {
    const normalized = property.name.toLowerCase();
    const id = 'metadata:property:' + property.name;
    elements.set(id, {
      id, kind: 'property', airPath: [property.name], name: shortName(property.name), displayPath: property.name,
      hasSysmlPath: true, children: [], features: [], connections: [], flows: [], properties: [],
      enumerationValues: [...property.values]
    });
    definitionAliases.set(normalized, id);
  }
}

function optionClassifier(option: any): string | undefined {
  const value = optionValue(option);
  return typeof value?.name === 'string' ? value.name : undefined;
}

function hasArrayIndex(raw: any, name: string): boolean {
  const pathIndex = /\[([0-9]+)\]/.exec(name)?.[1];
  return array(raw.indices).some(index => Number(index?.value ?? index) > 0)
    || (typeof raw.index === 'number' && raw.index > 0)
    || (pathIndex !== undefined && Number(pathIndex) > 0);
}

function errorFacts(
  annexes: unknown
): Pick<ModelElement, 'incomingErrors' | 'outgoingErrors' | 'containedErrors' | 'reachableErrorStates'> {
  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  const contained = new Set<string>();
  const reachable = new Set<string>();
  for (const annex of array(annexes)) {
    const clause = annex?.clause;
    if (clause?.type !== 'Emv2Clause') continue;
    for (const propagation of array(clause.propagations)) {
      const target = enumValue(propagation.direction) === 'In' ? incoming : outgoing;
      for (const token of array(propagation.errorTokens)) addErrorName(target, token);
    }
    const behavior = optionValue(clause.componentBehavior);
    for (const event of array(behavior?.events)) addErrorName(contained, event.id);
    for (const transition of array(behavior?.transitions)) addErrorName(reachable, transition.targetState);
    for (const propagation of array(behavior?.propagations)) {
      for (const target of array(propagation.target)) {
        const errors = enumValue(target.direction) === 'In' ? incoming : outgoing;
        for (const token of array(target.errorTokens)) addErrorName(errors, token);
      }
    }
  }
  return {
    incomingErrors: [...incoming], outgoingErrors: [...outgoing],
    containedErrors: [...contained], reachableErrorStates: [...reachable]
  };
}

function addErrorName(target: Set<string>, raw: any): void {
  const name = displayName(raw);
  if (!name) return;
  target.add(name);
  target.add(shortName(name));
}

function displayName(raw: any): string {
  return nameSegments(raw).join('::');
}

function optionValue(option: any): any {
  return option?.type === 'Some' ? option.value
    : option?.type === 'None' ? undefined
      : option?.value ?? option;
}

function identity(modelIndex: number, kind: ModelElementKind, path: readonly string[]): string {
  return `${modelIndex}:${kind}:${path.join('::')}`;
}

function nameSegments(name: any): string[] {
  const raw = name?.name;
  return Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : [];
}

function shortName(name: string): string {
  return name.split('::').at(-1) ?? name;
}

function enumValue(value: any): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value?.value === 'string') return value.value;
  return undefined;
}

function sourceLocation(option: any): SourceLocation | undefined {
  const pos = option?.value ?? option;
  const uri = pos?.uriOpt?.value?.value ?? pos?.uriOpt?.value ?? pos?.uri;
  if (typeof uri !== 'string') return undefined;
  const number = (value: unknown, fallback = 1): number => typeof value === 'number' ? value : fallback;
  return {
    uri,
    range: {
      start: { line: Math.max(0, number(pos.beginLine) - 1), character: Math.max(0, number(pos.beginColumn) - 1) },
      end: { line: Math.max(0, number(pos.endLine) - 1), character: Math.max(0, number(pos.endColumn)) }
    }
  };
}

function addAlias(aliases: Map<string, string[]>, alias: string, id: string): void {
  const values = aliases.get(alias) ?? [];
  if (!values.includes(id)) aliases.set(alias, [...values, id]);
}

function mergeStrings(existing: readonly string[] | undefined, additions: readonly string[] | undefined): string[] {
  return [...new Set([...(existing ?? []), ...(additions ?? [])])];
}

function mergeProperties(existing: readonly unknown[], additions: readonly unknown[]): readonly unknown[] {
  const result = [...existing];
  const fingerprints = new Set(result.map(property => JSON.stringify(property)));
  for (const property of additions) {
    const fingerprint = JSON.stringify(property);
    if (!fingerprints.has(fingerprint)) {
      fingerprints.add(fingerprint);
      result.push(property);
    }
  }
  return result;
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}
