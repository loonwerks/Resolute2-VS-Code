import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateModelBuiltin } from '../src/language/model-builtins.js';
import { buildModelIndex } from '../src/model/model-index.js';
import type { AirSnapshot } from '../src/model/model-provider.js';
import { displayValue, type ResoluteValue } from '../src/language/runtime-values.js';

const position = {
  type: 'Some',
  value: {
    type: 'Position', uriOpt: { type: 'Some', value: 'file:///model.sysml' },
    beginLine: 3, beginColumn: 5, endLine: 3, endColumn: 12
  }
};
const name = (...segments: string[]) => ({ type: 'Name', name: segments, pos: position });
const option = (value: unknown) => ({ type: 'Some', value });
const air = JSON.stringify({
  type: 'Aadl',
  components: [{
    type: 'Component', identifier: name('Demo_Instance'),
    category: { type: 'ComponentCategory', value: 'System' },
    classifier: option({ type: 'Classifier', name: 'Demo::Root' }),
    features: [],
    subComponents: [{
      type: 'Component', identifier: name('Demo_Instance', 'worker'),
      category: { type: 'ComponentCategory', value: 'Process' },
      classifier: option({ type: 'Classifier', name: 'Demo::Worker' }),
      features: [{
        type: 'FeatureEnd', identifier: name('Demo_Instance', 'worker', 'input'),
        direction: { type: 'Direction', value: 'In' },
        category: { type: 'FeatureCategory', value: 'DataPort' }, properties: []
      }],
      subComponents: [], connections: [], flows: [],
      properties: [{ type: 'Property', name: name('Timing_Properties::Period'), propertyValues: [{ type: 'UnitProp', value: '10', unit: { type: 'None' } }] }]
    }],
    connections: [{
      type: 'Connection', name: name('Demo_Instance', 'to_worker'),
      kind: { type: 'ConnectionKind', value: 'Port' }, isBiDirectional: false,
      src: [{ component: name('Demo_Instance'), feature: { type: 'None' } }],
      dst: [{ component: name('Demo_Instance', 'worker'), feature: option(name('Demo_Instance', 'worker', 'input')) }],
      properties: []
    }],
    flows: [], properties: []
  }]
});
const index = buildModelIndex([air]);
const snapshot: AirSnapshot = { revision: 7, air: [air], index, stale: false };
const text = (value: string): ResoluteValue => ({ kind: 'string', value });

function call(name: string, ...args: ResoluteValue[]): ResoluteValue {
  const result = evaluateModelBuiltin(name, args, snapshot);
  assert.ok(result);
  return result;
}

test('indexes AIR hierarchy, aliases, positions, and connection endpoints', () => {
  const root = call('instance', text('Demo::Root'));
  assert.equal(root.kind, 'model');
  assert.deepEqual(call('is_system', root), { kind: 'bool', value: true });
  const children = call('subcomponents', root);
  assert.equal(children.kind, 'set');
  assert.equal(children.elements.length, 1);
  const worker = children.elements[0];
  assert.deepEqual(call('name', worker), text('worker'));
  assert.deepEqual(call('is_process', worker), { kind: 'bool', value: true });
  assert.equal(index.elements.get(worker.kind === 'model' ? worker.id : '')?.source?.range.start.line, 2);

  const features = call('features', worker);
  assert.equal(features.kind, 'set');
  assert.deepEqual(call('direction', features.elements[0]), text('In'));

  const connections = call('connections', root);
  assert.equal(connections.kind, 'set');
  const connection = connections.elements[0];
  assert.deepEqual(call('source', connection), root);
  assert.deepEqual(call('destination', connection), features.elements[0]);
});

test('converts AIR property values and rejects ambiguous aliases', () => {
  const workers = call('instances', text('Demo::Worker'));
  assert.equal(workers.kind, 'set');
  const worker = workers.elements[0];
  assert.deepEqual(call('has_property', worker, text('Period')), { kind: 'bool', value: true });
  assert.deepEqual(call('property', worker, text('Timing_Properties::Period')), { kind: 'int', value: 10 });
  assert.throws(() => call('instance', text('missing')), /fully qualified SysML names/);
});

test('requires qualified definitions while preserving explicit AIR debug lookup', () => {
  const root = call('instance', text('Demo::Root'));
  assert.equal(root.kind, 'model');
  if (root.kind !== 'model') return;

  assert.equal(root.id, '0:component:Demo_Instance');
  assert.equal(root.displayPath, 'Demo::Root');
  assert.deepEqual(call('name', root), text('Root'));
  assert.throws(() => call('instance', text('Root')), /fully qualified SysML names/);
  assert.throws(() => call('instance', text('Demo_Instance')), /fully qualified SysML names/);
  assert.deepEqual(call('instance', text('AIR_DEBUG_NAMESPACE::Demo_Instance')), root);

  const children = call('subcomponents', root);
  assert.equal(children.kind, 'set');
  if (children.kind !== 'set') return;
  const worker = children.elements[0];
  assert.equal(displayValue(worker), 'Demo::Root.worker');
  assert.equal(displayValue(call('type', worker)), 'Demo::Worker');

  const features = call('features', worker);
  assert.equal(features.kind, 'set');
  if (features.kind !== 'set') return;
  assert.equal(displayValue(features.elements[0]), 'Demo::Root.worker.input');

  const connections = call('connections', root);
  assert.equal(connections.kind, 'set');
  if (connections.kind !== 'set') return;
  assert.equal(displayValue(connections.elements[0]), 'Demo::Root.to_worker');
});

test('does not resolve short names shared by distinct definitions', () => {
  const rootAir = (identifier: string, classifier: string): string => JSON.stringify({
    type: 'Aadl',
    components: [{
      type: 'Component', identifier: name(identifier), classifier: option({ type: 'Classifier', name: classifier }),
      category: { type: 'ComponentCategory', value: 'System' }, features: [], subComponents: [], connections: [], flows: [], properties: []
    }]
  });
  const documents = [rootAir('First_Instance', 'PkgA::Root'), rootAir('Second_Instance', 'PkgB::Root')];
  const qualifiedSnapshot: AirSnapshot = {
    revision: 8, air: documents, index: buildModelIndex(documents), stale: false
  };
  const lookup = (query: string): ResoluteValue => {
    const result = evaluateModelBuiltin('instance', [text(query)], qualifiedSnapshot);
    assert.ok(result);
    return result;
  };

  assert.throws(() => lookup('Root'), /fully qualified SysML names/);
  assert.equal(displayValue(lookup('PkgA::Root')), 'PkgA::Root');
  assert.equal(displayValue(lookup('PkgB::Root')), 'PkgB::Root');
  assert.throws(() => evaluateModelBuiltin('instances', [], qualifiedSnapshot), /expects 1 argument/);
});

test('does not invent a SysML definition for classifier-less AIR data', () => {
  const fallbackAir = JSON.stringify({
    type: 'Aadl',
    components: [{
      type: 'Component', identifier: name('Fallback_Instance'),
      category: { type: 'ComponentCategory', value: 'System' }, features: [], subComponents: [], connections: [], flows: [], properties: []
    }]
  });
  const fallbackSnapshot: AirSnapshot = {
    revision: 9, air: [fallbackAir], index: buildModelIndex([fallbackAir]), stale: false
  };
  assert.throws(() => evaluateModelBuiltin('instance', [text('Pkg::Fallback')], fallbackSnapshot), /definition was not found/);
  const result = evaluateModelBuiltin('instance', [text('AIR_DEBUG_NAMESPACE::Fallback_Instance')], fallbackSnapshot);
  assert.ok(result);
  assert.equal(displayValue(result), 'Fallback_Instance');
});

test('keeps a qualified definition distinct from all instances classified by it', () => {
  const domainProperty = {
    type: 'Property', name: name('CASE_Scheduling::Domain'),
    propertyValues: [{ type: 'UnitProp', value: '2', unit: { type: 'None' } }]
  };
  const collisionAir = JSON.stringify({
    type: 'Aadl',
    components: [{
      type: 'Component', identifier: name('Platform_Instance'),
      classifier: option({ type: 'Classifier', name: 'Platform::ZCU102_Impl' }),
      category: { type: 'ComponentCategory', value: 'System' }, features: [], connections: [], flows: [], properties: [],
      subComponents: [{
        type: 'Component', identifier: name('Platform_Instance', 'seL4'),
        classifier: option({ type: 'Classifier', name: 'SW::seL4' }),
        category: { type: 'ComponentCategory', value: 'System' },
        features: [], subComponents: [], connections: [], flows: [], properties: [domainProperty]
      }]
    }, {
      type: 'Component', identifier: name('seL4_Instance'),
      classifier: option({ type: 'Classifier', name: 'SW::seL4' }),
      category: { type: 'ComponentCategory', value: 'System' },
      features: [], subComponents: [], connections: [], flows: [], properties: [domainProperty]
    }]
  });
  const collisionSnapshot: AirSnapshot = {
    revision: 10, air: [collisionAir], index: buildModelIndex([collisionAir]), stale: false
  };

  assert.deepEqual(evaluateModelBuiltin('name', [text('SW::seL4')], collisionSnapshot), text('seL4'));
  assert.deepEqual(evaluateModelBuiltin('has_property', [text('SW::seL4'), text('Domain')], collisionSnapshot), { kind: 'bool', value: true });
  assert.deepEqual(evaluateModelBuiltin('property', [text('SW::seL4'), text('Domain')], collisionSnapshot), { kind: 'int', value: 2 });
  assert.throws(
    () => evaluateModelBuiltin('instance', [text('SW::seL4')], collisionSnapshot),
    /Multiple AIR component instances.*Platform::ZCU102_Impl.seL4, SW::seL4/
  );

  const plural = evaluateModelBuiltin('instances', [text('SW::seL4')], collisionSnapshot);
  assert.ok(plural);
  assert.equal(displayValue(plural), '[Platform::ZCU102_Impl.seL4, SW::seL4]');
  assert.throws(
    () => evaluateModelBuiltin('has_property', [text('Platform::ZCU102_Impl.seL4'), text('Domain')], collisionSnapshot),
    /definition was not found/
  );
});

test('indexes properties from nested AIR instances on their qualified definition', () => {
  const domainProperty = {
    type: 'Property', name: name('CASE_Scheduling::Domain'),
    propertyValues: [{ type: 'UnitProp', value: '4', unit: { type: 'None' } }]
  };
  const nestedOnlyAir = JSON.stringify({
    type: 'Aadl',
    components: [{
      type: 'Component', identifier: name('Container_Instance'),
      classifier: option({ type: 'Classifier', name: 'Platform::Container' }),
      category: { type: 'ComponentCategory', value: 'System' }, features: [], connections: [], flows: [], properties: [],
      subComponents: [{
        type: 'Component', identifier: name('Container_Instance', 'driver'),
        classifier: option({ type: 'Classifier', name: 'SW::LowLevelEthernetDriver_seL4' }),
        category: { type: 'ComponentCategory', value: 'Process' },
        features: [], subComponents: [], connections: [], flows: [], properties: [domainProperty]
      }]
    }]
  });
  const nestedSnapshot: AirSnapshot = {
    revision: 11, air: [nestedOnlyAir], index: buildModelIndex([nestedOnlyAir]), stale: false
  };

  assert.deepEqual(
    evaluateModelBuiltin('has_property', [text('SW::LowLevelEthernetDriver_seL4'), text('Domain')], nestedSnapshot),
    { kind: 'bool', value: true }
  );
  assert.deepEqual(
    evaluateModelBuiltin('property', [text('SW::LowLevelEthernetDriver_seL4'), text('Domain')], nestedSnapshot),
    { kind: 'int', value: 4 }
  );
  const definitionId = nestedSnapshot.index.definitionAliases.get('sw::lowlevelethernetdriver_sel4');
  assert.equal(definitionId ? nestedSnapshot.index.elements.get(definitionId)?.properties.length : 0, 1);
});

test('reports conflicting effective AIR property values across instances', () => {
  const domainProperty = (value: string) => ({
    type: 'Property', name: name('CASE_Scheduling::Domain'),
    propertyValues: [{ type: 'UnitProp', value, unit: { type: 'None' } }]
  });
  const conflictingAir = JSON.stringify({
    type: 'Aadl',
    components: [{
      type: 'Component', identifier: name('Container_Instance'),
      classifier: option({ type: 'Classifier', name: 'Platform::Container' }),
      category: { type: 'ComponentCategory', value: 'System' }, features: [], connections: [], flows: [], properties: [],
      subComponents: [{
        type: 'Component', identifier: name('Container_Instance', 'first'),
        classifier: option({ type: 'Classifier', name: 'SW::Driver' }),
        category: { type: 'ComponentCategory', value: 'Process' },
        features: [], subComponents: [], connections: [], flows: [], properties: [domainProperty('4')]
      }, {
        type: 'Component', identifier: name('Container_Instance', 'second'),
        classifier: option({ type: 'Classifier', name: 'SW::Driver' }),
        category: { type: 'ComponentCategory', value: 'Process' },
        features: [], subComponents: [], connections: [], flows: [], properties: [domainProperty('5')]
      }]
    }]
  });
  const conflictingSnapshot: AirSnapshot = {
    revision: 12, air: [conflictingAir], index: buildModelIndex([conflictingAir]), stale: false
  };

  assert.deepEqual(
    evaluateModelBuiltin('has_property', [text('SW::Driver'), text('Domain')], conflictingSnapshot),
    { kind: 'bool', value: true }
  );
  assert.throws(
    () => evaluateModelBuiltin('property', [text('SW::Driver'), text('Domain')], conflictingSnapshot),
    /conflicting AIR associations/
  );
});

test('implements binding, declaration metadata, modes, arrays, flows, and EMV2 queries', () => {
  const advancedAir = JSON.stringify({
    type: 'Aadl',
    components: [{
      type: 'Component', identifier: name('Advanced_Instance'),
      classifier: option({ type: 'Classifier', name: 'Demo::Advanced' }),
      category: { type: 'ComponentCategory', value: 'System' },
      prototypes: [{}], modes: [{ type: 'Mode', name: name('Advanced_Instance', 'Operational') }],
      features: [{
        type: 'FeatureEnd', identifier: name('Advanced_Instance', 'input'), index: 1,
        direction: { type: 'Direction', value: 'In' },
        category: { type: 'FeatureCategory', value: 'EventDataPort' }, properties: []
      }, {
        type: 'FeatureEnd', identifier: name('Advanced_Instance', 'output'),
        direction: { type: 'Direction', value: 'Out' },
        category: { type: 'FeatureCategory', value: 'EventDataPort' }, properties: []
      }],
      subComponents: [{
        type: 'Component', identifier: name('Advanced_Instance', 'cpu'),
        classifier: option({ type: 'Classifier', name: 'Demo::Cpu' }),
        category: { type: 'ComponentCategory', value: 'Processor' },
        features: [], subComponents: [], connections: [], flows: [], properties: []
      }, {
        type: 'Component', identifier: name('Advanced_Instance', 'worker'),
        classifier: option({ type: 'Classifier', name: 'Demo::Worker' }),
        category: { type: 'ComponentCategory', value: 'Process' },
        features: [], subComponents: [], connections: [], flows: [],
        properties: [{
          type: 'Property', name: name('Deployment_Properties::Actual_Processor_Binding'),
          propertyValues: [{ type: 'ReferenceProp', value: name('Advanced_Instance', 'cpu') }]
        }]
      }],
      connections: [],
      flows: [{
        type: 'Flow', name: name('Advanced_Instance', 'through'),
        kind: { type: 'FlowKind', value: 'Path' },
        source: option(name('Advanced_Instance', 'input')),
        sink: option(name('Advanced_Instance', 'output'))
      }],
      properties: [],
      annexes: [{
        type: 'Annex', name: 'EMV2', clause: {
          type: 'Emv2Clause',
          propagations: [{
            type: 'Emv2Propagation', direction: { type: 'PropagationDirection', value: 'In' },
            propagationPoint: name('Advanced_Instance', 'input'), errorTokens: [name('Errors::Incoming')]
          }, {
            type: 'Emv2Propagation', direction: { type: 'PropagationDirection', value: 'Out' },
            propagationPoint: name('Advanced_Instance', 'output'), errorTokens: [name('Errors::Outgoing')]
          }],
          componentBehavior: option({
            type: 'Emv2BehaviorSection', events: [{ type: 'ErrorEvent', id: name('Errors::Contained') }],
            transitions: [{
              type: 'ErrorTransition', sourceState: name('Nominal'), targetState: name('Failed'), condition: {}
            }], propagations: []
          })
        }
      }]
    }],
    dataComponents: []
  });
  const advancedIndex = buildModelIndex([advancedAir], {
    propertyEnumerations: [{ name: 'Demo::Policy', values: ['First', 'Second'] }]
  });
  const advancedSnapshot: AirSnapshot = {
    revision: 20, air: [advancedAir], index: advancedIndex, stale: false
  };
  const invoke = (builtin: string, ...arguments_: ResoluteValue[]): ResoluteValue => {
    const value = evaluateModelBuiltin(builtin, arguments_, advancedSnapshot);
    assert.ok(value);
    return value;
  };

  const root = invoke('instance', text('Demo::Advanced'));
  const children = invoke('subcomponents', root);
  assert.equal(children.kind, 'set');
  if (children.kind !== 'set') return;
  const cpu = children.elements.find(value => invoke('is_processor', value).kind === 'bool'
    && (invoke('is_processor', value) as Extract<ResoluteValue, { kind: 'bool' }>).value);
  const worker = children.elements.find(value => invoke('is_process', value).kind === 'bool'
    && (invoke('is_process', value) as Extract<ResoluteValue, { kind: 'bool' }>).value);
  assert.ok(cpu && worker);
  assert.deepEqual(invoke('is_bound_to', worker, cpu), { kind: 'bool', value: true });
  assert.deepEqual(invoke('has_modes', root), { kind: 'bool', value: true });
  assert.deepEqual(invoke('has_prototypes', root), { kind: 'bool', value: true });

  const features = invoke('features', root);
  assert.equal(features.kind, 'set');
  if (features.kind !== 'set') return;
  assert.deepEqual(invoke('is_in_array', features.elements[0]), { kind: 'bool', value: true });

  assert.deepEqual(invoke('enumerated_values', text('Demo::Policy')), {
    kind: 'set', elements: [text('First'), text('Second')]
  });
  const flows = invoke('flow_specifications', root);
  assert.equal(flows.kind, 'set');
  if (flows.kind !== 'set') return;
  assert.equal(flows.elements.length, 1);
  assert.deepEqual(invoke('flow_source', flows.elements[0]), features.elements[0]);
  assert.deepEqual(invoke('flow_destination', flows.elements[0]), features.elements[1]);
  assert.deepEqual(invoke('flow_elements', flows.elements[0]), features);
  assert.deepEqual(invoke('end_to_end_flows', root), { kind: 'set', elements: [] });

  assert.deepEqual(invoke('receive_error', root, text('Incoming')), { kind: 'bool', value: true });
  assert.deepEqual(invoke('contain_error', root, text('Contained')), { kind: 'bool', value: true });
  assert.deepEqual(invoke('propagate_error', root, text('Outgoing')), { kind: 'bool', value: true });
  assert.deepEqual(invoke('error_state_reachable', root, text('Failed')), { kind: 'bool', value: true });
});
