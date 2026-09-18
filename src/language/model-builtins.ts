import type { AirSnapshot } from '../model/model-provider.js';
import { resolveModelDefinition, resolveModelName, type ModelElement } from '../model/model-index.js';
import type { ModelValueKind, ResoluteValue } from './runtime-values.js';

const categoryPredicates: Record<string, string> = {
  is_processor: 'Processor', is_virtual_processor: 'VirtualProcessor', is_system: 'System',
  is_bus: 'Bus', is_virtual_bus: 'VirtualBus', is_device: 'Device', is_memory: 'Memory',
  is_thread: 'Thread', is_thread_group: 'ThreadGroup', is_process: 'Process',
  is_data: 'Data', is_subprogram: 'Subprogram'
};

const featurePredicates: Record<string, string[]> = {
  is_event_port: ['EventPort', 'EventDataPort'],
  is_data_port: ['DataPort', 'EventDataPort'],
  is_port: ['DataPort', 'EventPort', 'EventDataPort'],
  is_abstract_feature: ['AbstractFeature']
};

const modelBuiltins = new Set([
  'instance', 'instances', 'name', 'has_parent', 'parent', 'type', 'has_type', 'is_of_type',
  'is_bound_to', 'has_member', 'subcomponents', 'features', 'connections', 'source', 'destination',
  'is_bidirectional', 'direction', 'is_in_array', 'has_prototypes', 'has_modes',
  'has_property', 'property', 'property_member', 'enumerated_values',
  'is_data_access', 'is_bus_access',
  'receive_error', 'contain_error', 'propagate_error', 'error_state_reachable',
  'flow_source', 'flow_destination', 'flow_elements', 'flow_specifications', 'end_to_end_flows',
  ...Object.keys(categoryPredicates), ...Object.keys(featurePredicates)
]);

/** Evaluates AIR-backed built-ins, returning undefined only for non-model names. */
export function evaluateModelBuiltin(
  name: string,
  args: readonly ResoluteValue[],
  snapshot: AirSnapshot | undefined
): ResoluteValue | undefined {
  if (!modelBuiltins.has(name)) return undefined;
  if (!snapshot) throw new Error('No valid Sireum AIR model is available.');

  if (name === 'property_member') {
    requireArity(name, args, 2);
    if (args[0].kind !== 'record') throw new Error("Built-in 'property_member' expects a record.");
    const key = stringArg(name, args[1]);
    const entry = [...args[0].fields].find(([field]) => field.toLowerCase() === key.toLowerCase())?.[1];
    if (!entry) throw new Error(`Record field '${key}' was not found.`);
    return entry;
  }

  if (name === 'instance' || name === 'instances') {
    requireArity(name, args, 1);
    const query = stringArg(name, args[0]);
    if (name === 'instance' && query.startsWith('AIR_DEBUG_NAMESPACE::')) {
      return modelValue(snapshot, uniqueLookup(snapshot, query));
    }
    const definition = definitionLookup(snapshot, query);
    const matches = instancesOfDefinition(snapshot, definition);
    if (name === 'instances') return set(matches.map(id => modelValue(snapshot, id)));
    if (matches.length === 0) throw new Error(`No AIR component instance is classified by '${query}'.`);
    if (matches.length > 1) {
      throw new Error(`Multiple AIR component instances are classified by '${query}': ${displayPaths(snapshot, matches).join(', ')}.`);
    }
    return modelValue(snapshot, matches[0]);
  }

  const element = elementArg(name, args[0], snapshot);

  if (name === 'name') {
    requireArity(name, args, 1);
    return string(element.name);
  }
  if (name === 'has_parent') {
    requireArity(name, args, 1);
    return bool(Boolean(element.parentId));
  }
  if (name === 'parent') {
    requireArity(name, args, 1);
    if (!element.parentId) throw new Error(`Element '${element.name}' has no parent.`);
    return modelValue(snapshot, element.parentId);
  }
  if (name === 'type') {
    requireArity(name, args, 1);
    if (!element.classifier) throw new Error(`Element '${element.name}' has no classifier.`);
    const classifier = classifierElement(snapshot, element.classifier);
    if (!classifier) throw new Error(`Classifier '${element.classifier}' is absent from the model index.`);
    return modelValue(snapshot, classifier.id);
  }
  if (name === 'has_type') {
    requireArity(name, args, 1);
    return bool(Boolean(element.classifier));
  }
  if (name === 'is_of_type') {
    requireArity(name, args, 2);
    const expected = classifierName(args[1], snapshot);
    return bool(Boolean(expected && element.classifier?.toLowerCase() === expected.toLowerCase()));
  }
  if (name === 'has_member') {
    requireArity(name, args, 2);
    const member = stringArg(name, args[1]).toLowerCase();
    return bool([...element.children, ...element.features].some(id =>
      snapshot.index.elements.get(id)?.name.toLowerCase() === member));
  }
  if (name === 'subcomponents') {
    requireArity(name, args, 1);
    return modelSet(snapshot, element.children);
  }
  if (name === 'features') {
    requireArity(name, args, 1);
    return modelSet(snapshot, element.features);
  }
  if (name === 'connections') {
    requireArity(name, args, 1);
    return modelSet(snapshot, element.connections);
  }
  if (name === 'source' || name === 'destination') {
    requireArity(name, args, 1);
    const target = name === 'source' ? element.sourceId : element.destinationId;
    if (!target) throw new Error(`Connection '${element.name}' has no ${name} endpoint.`);
    return modelValue(snapshot, target);
  }
  if (name === 'is_bidirectional') {
    requireArity(name, args, 1);
    return bool(Boolean(element.bidirectional));
  }
  if (name === 'direction') {
    requireArity(name, args, 1);
    return string(element.direction ?? 'None');
  }
  if (name === 'is_in_array') {
    requireArity(name, args, 1);
    return bool(Boolean(element.arrayMember));
  }
  if (name === 'has_prototypes') {
    requireArity(name, args, 1);
    return bool(Boolean(element.hasPrototypes));
  }
  if (name === 'has_modes') {
    requireArity(name, args, 1);
    return bool((element.modeNames?.length ?? 0) > 0);
  }
  if (name === 'is_bound_to') {
    requireArity(name, args, 2);
    const resource = elementArg(name, args[1], snapshot);
    return bool(bindingTargets(element, snapshot).includes(resource.id));
  }
  if (name === 'enumerated_values') {
    requireArity(name, args, 1);
    if (element.kind !== 'property' || !element.enumerationValues) {
      throw new Error(`Element '${element.displayPath}' is not an enumerated property definition.`);
    }
    return set(element.enumerationValues.map(string));
  }
  if (name === 'has_property') {
    requireArity(name, args, 2);
    return bool(findProperties(element, stringArg(name, args[1])).length > 0);
  }
  if (name === 'property') {
    if (args.length < 2 || args.length > 3) throw new Error("Built-in 'property' expects 2 or 3 arguments.");
    const propertyQuery = stringArg(name, args[1]);
    const properties = findProperties(element, propertyQuery);
    if (properties.length === 0) {
      if (args[2]) return args[2];
      throw new Error(`Property ${propertyQuery} is not defined on ${element.name}.`);
    }
    if (properties.length > 1) {
      throw new Error(`Property ${propertyQuery} has conflicting AIR associations on ${element.displayPath}.`);
    }
    const values = array((properties[0] as any).propertyValues).map(value => propertyValue(value, snapshot));
    return values.length === 1 ? values[0] : { kind: 'list', elements: values };
  }

  if (categoryPredicates[name]) {
    requireArity(name, args, 1);
    return bool(element.category === categoryPredicates[name]);
  }
  if (featurePredicates[name]) {
    requireArity(name, args, 1);
    return bool(featurePredicates[name].includes(element.category ?? ''));
  }
  if (name === 'is_data_access' || name === 'is_bus_access') {
    requireArity(name, args, 1);
    const expected = name === 'is_data_access' ? 'Data' : 'Bus';
    if (element.kind === 'feature') return bool(element.accessCategory === expected || element.category === `${expected}Access`);
    if (element.kind !== 'connection' || element.category !== 'Access') return bool(false);
    return bool([element.sourceId, element.destinationId].some(id => endpointCategory(id, snapshot) === expected));
  }

  if (name === 'receive_error' || name === 'contain_error' || name === 'propagate_error' || name === 'error_state_reachable') {
    requireArity(name, args, 2);
    const query = stringArg(name, args[1]);
    const values = name === 'receive_error' ? element.incomingErrors
      : name === 'contain_error' ? element.containedErrors
        : name === 'propagate_error' ? element.outgoingErrors : element.reachableErrorStates;
    return bool(matchesName(values, query));
  }

  if (name === 'flow_specifications') {
    requireArity(name, args, 1);
    return modelSet(snapshot, element.flows);
  }
  if (name === 'end_to_end_flows') {
    requireArity(name, args, 1);
    const ids = element.flows.filter(id => snapshot.index.elements.get(id)?.category === 'EndToEnd');
    return modelSet(snapshot, ids);
  }
  if (name === 'flow_source' || name === 'flow_destination') {
    requireArity(name, args, 1);
    const target = name === 'flow_source' ? element.sourceId : element.destinationId;
    if (!target) throw new Error(`Flow '${element.name}' has no ${name === 'flow_source' ? 'source' : 'destination'}.`);
    return modelValue(snapshot, target);
  }
  if (name === 'flow_elements') {
    requireArity(name, args, 1);
    return modelSet(snapshot, element.flowElementIds ?? []);
  }

  return undefined;
}

function elementArg(name: string, value: ResoluteValue | undefined, snapshot: AirSnapshot): ModelElement {
  if (!value) throw new Error(`Built-in '${name}' requires a model element.`);
  const id = value.kind === 'model' ? value.id
    : value.kind === 'string' ? definitionLookup(snapshot, value.value) : undefined;
  const element = id ? snapshot.index.elements.get(id) : undefined;
  if (!element) throw new Error(`Built-in '${name}' received an unknown model element.`);
  return element;
}

function definitionLookup(snapshot: AirSnapshot, name: string): string {
  const segments = name.split('::');
  if (segments.length < 2 || segments.some(segment => segment.length === 0)) {
    throw new Error(`Model names must be fully qualified SysML names such as SW::seL4. Received: ${name}`);
  }
  const id = resolveModelDefinition(snapshot.index, name);
  if (!id) throw new Error(`SysML definition was not found: ${name}`);
  return id;
}

function instancesOfDefinition(snapshot: AirSnapshot, definitionId: string): string[] {
  const classifier = snapshot.index.elements.get(definitionId)?.classifier?.toLowerCase();
  if (!classifier) return [];
  return [...snapshot.index.elements.values()]
    .filter(element => element.kind === 'component' && element.classifier?.toLowerCase() === classifier)
    .map(element => element.id);
}

function classifierElement(snapshot: AirSnapshot, classifier: string): ModelElement | undefined {
  const id = resolveModelDefinition(snapshot.index, classifier);
  return id ? snapshot.index.elements.get(id) : undefined;
}

function classifierName(value: ResoluteValue | undefined, snapshot: AirSnapshot): string | undefined {
  if (value?.kind === 'string') return snapshot.index.elements.get(definitionLookup(snapshot, value.value))?.classifier;
  if (value?.kind === 'model') return snapshot.index.elements.get(value.id)?.classifier;
  throw new Error("Built-in 'is_of_type' expects a model element or fully qualified model name as its second argument.");
}

function bindingTargets(element: ModelElement, snapshot: AirSnapshot): string[] {
  const propertyNames = element.kind === 'connection'
    ? ['Actual_Connection_Binding']
    : ['Actual_Processor_Binding', 'Actual_Memory_Binding'];
  const result = new Set<string>();
  for (const propertyName of propertyNames) {
    for (const property of findProperties(element, propertyName)) {
      for (const value of array((property as any).propertyValues)) {
        if (value?.type !== 'ReferenceProp') continue;
        const path = nameSegments(value.value).join('::').toLowerCase();
        const id = snapshot.index.airAliases.get(path);
        if (id) result.add(id);
      }
    }
  }
  return [...result];
}

function endpointCategory(id: string | undefined, snapshot: AirSnapshot): string | undefined {
  let element = id ? snapshot.index.elements.get(id) : undefined;
  while (element && element.kind === 'feature') element = element.parentId ? snapshot.index.elements.get(element.parentId) : undefined;
  return element?.category;
}

function matchesName(values: readonly string[] | undefined, query: string): boolean {
  const normalized = query.toLowerCase();
  return (values ?? []).some(value => value.toLowerCase() === normalized || value.split('::').at(-1)?.toLowerCase() === normalized);
}

function displayPaths(snapshot: AirSnapshot, ids: readonly string[]): string[] {
  return ids.map(id => snapshot.index.elements.get(id)?.displayPath ?? id);
}

function uniqueLookup(snapshot: AirSnapshot, name: string): string {
  const aliasMatches = resolveModelName(snapshot.index, name);
  const normalized = name.toLowerCase();
  const exactDisplayMatches = aliasMatches.filter(id => snapshot.index.elements.get(id)?.displayPath.toLowerCase() === normalized);
  const matches = exactDisplayMatches.length > 0 ? exactDisplayMatches : aliasMatches;
  if (matches.length === 0) throw new Error(`Model element '${name}' was not found.`);
  if (matches.length > 1) {
    const candidates = matches.map(id => snapshot.index.elements.get(id)?.displayPath ?? id);
    throw new Error(`Model name '${name}' is ambiguous: ${candidates.join(', ')}.`);
  }
  return matches[0];
}

function modelSet(snapshot: AirSnapshot, ids: readonly string[]): ResoluteValue {
  return set(ids.map(id => modelValue(snapshot, id)));
}

function modelValue(snapshot: AirSnapshot, id: string): ResoluteValue {
  const element = snapshot.index.elements.get(id);
  const kind = element?.kind ?? 'aadl';
  return {
    kind: 'model', modelKind: kind as ModelValueKind, revision: snapshot.revision,
    id, displayPath: element?.displayPath ?? id
  };
}

function string(value: string): ResoluteValue { return { kind: 'string', value }; }
function bool(value: boolean): ResoluteValue { return { kind: 'bool', value }; }
function set(elements: readonly ResoluteValue[]): ResoluteValue { return { kind: 'set', elements }; }

function stringArg(name: string, value: ResoluteValue | undefined): string {
  if (value?.kind !== 'string') throw new Error(`Built-in '${name}' expects a string argument.`);
  return value.value;
}

function requireArity(name: string, args: readonly unknown[], expected: number): void {
  if (args.length !== expected) throw new Error(`Built-in '${name}' expects ${expected} argument(s), received ${args.length}.`);
}

function findProperties(element: ModelElement, name: string): unknown[] {
  const normalized = name.toLowerCase();
  const exact = element.properties.filter(property => propertyName(property).toLowerCase() === normalized);
  if (exact.length > 0) return exact;
  return element.properties.filter(property => propertyName(property).split('::').at(-1)?.toLowerCase() === normalized);
}

function propertyName(property: any): string {
  return nameSegments(property?.name).join('::');
}

function propertyValue(raw: any, snapshot: AirSnapshot): ResoluteValue {
  const type = String(raw?.type ?? '');
  if (type === 'UnitProp') {
    const value = Number(raw.value);
    const numeric: ResoluteValue = Number.isInteger(value) ? { kind: 'int', value } : { kind: 'real', value };
    const unit = optionValue(raw.unit);
    return unit === undefined ? numeric : {
      kind: 'record', fields: new Map([['value', numeric], ['unit', string(String(unit))]])
    };
  }
  if (type === 'RangeProp') {
    return { kind: 'range', lower: propertyValue(raw.low, snapshot), upper: propertyValue(raw.high, snapshot) };
  }
  if (type === 'RecordProp') {
    return { kind: 'record', fields: new Map(array(raw.properties).map((property: any) => [
      propertyName(property).split('::').at(-1) ?? propertyName(property),
      propertyValue(array(property.propertyValues)[0], snapshot)
    ])) };
  }
  if (type === 'ReferenceProp') {
    const path = nameSegments(raw.value).join('::');
    const id = snapshot.index.airAliases.get(path.toLowerCase());
    return id ? modelValue(snapshot, id) : string(path);
  }
  if (type === 'ClassifierProp') {
    const classifier = String(raw.name ?? '');
    const id = resolveModelDefinition(snapshot.index, classifier);
    return id ? modelValue(snapshot, id) : string(classifier);
  }
  const value = String(raw?.value ?? raw?.name ?? '');
  if (type === 'ValueProp' && /^(true|false)$/i.test(value)) return bool(value.toLowerCase() === 'true');
  return string(value);
}

function optionValue(option: any): any {
  return option?.type === 'Some' ? option.value
    : option?.type === 'None' ? undefined
      : option?.value ?? option;
}

function nameSegments(name: any): string[] {
  const raw = name?.name;
  return Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : [];
}

function array(value: unknown): any[] { return Array.isArray(value) ? value : []; }
