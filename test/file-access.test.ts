import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { NodeFileSystem } from 'langium/node';
import { parseHelper } from 'langium/test';
import { evaluateGoal } from '../src/language/evaluator.js';
import { isFunctionDefinition, type Model } from '../src/language/generated/ast.js';
import { createFileAccessLibrary } from '../src/language/libraries/file-access-library.js';
import { createDefaultLibraryRegistry } from '../src/language/libraries/index.js';
import { createResolute2Services } from '../src/language/resolute2-module.js';
import type { ResoluteValue } from '../src/language/runtime-values.js';

const services = createResolute2Services(NodeFileSystem);
const parse = parseHelper<Model>(services.resolute2);
const textValue = (value: string): ResoluteValue => ({ kind: 'string', value });
const intValue = (value: number): ResoluteValue => ({ kind: 'int', value });

// Creates a library and source context rooted at the fixed read-only fixture.
function fixture() {
  const root = resolve('test/fixtures/file-access');
  const library = createFileAccessLibrary({ enabled: true, workspaceRoots: [root] });
  const context = { documentUri: pathToFileURL(resolve(root, 'model.resolute')).toString() };
  return { root, library, context };
}

// Covers the complete legacy local-file API within one trusted workspace root.
test('implements all legacy local FileAccess operations', () => {
  const { root, library, context } = fixture();
  const call = (name: keyof typeof library.functions, values: readonly ResoluteValue[]) =>
    library.functions[name].evaluate(context, values);
  assert.deepEqual(call('canRead', [textValue('sample.txt')]), { kind: 'bool', value: true });
  assert.equal(call('canWrite', [textValue('sample.txt')]).kind, 'bool');
  assert.equal(call('canExecute', [textValue('sample.txt')]).kind, 'bool');
  const comparison = call('compareTo', [textValue('sample.txt'), textValue('nested/child.txt')]);
  assert.ok(comparison.kind === 'int' && comparison.value !== 0);
  assert.deepEqual(call('fileExists', [textValue('sample.txt')]), { kind: 'bool', value: true });
  assert.deepEqual(call('getAbsolutePath', [textValue('sample.txt')]), textValue(resolve(root, 'sample.txt')));
  assert.deepEqual(call('getContents', [textValue('sample.txt')]), textValue('first line\nsecond line'));
  assert.deepEqual(call('getParent', [textValue('sample.txt')]), textValue(root));
  assert.deepEqual(call('getName', [textValue('sample.txt')]), textValue('sample.txt'));
  for (const name of ['getFreeSpace', 'getTotalSpace', 'getUsableSpace'] as const) {
    const value = call(name, [textValue('.')]);
    assert.ok(value.kind === 'int' && value.value > 0);
  }
  assert.equal(call('hashCode', [textValue('sample.txt')]).kind, 'int');
  assert.deepEqual(call('isAbsolute', [textValue('sample.txt')]), { kind: 'bool', value: true });
  assert.deepEqual(call('isDirectory', [textValue('nested')]), { kind: 'bool', value: true });
  assert.deepEqual(call('isFile', [textValue('sample.txt')]), { kind: 'bool', value: true });
  assert.deepEqual(call('isHidden', [textValue('.hidden')]), { kind: 'bool', value: true });
  const modified = call('lastModified', [textValue('sample.txt')]);
  assert.ok(modified.kind === 'int' && modified.value > 0);
  assert.deepEqual(call('length', [textValue('sample.txt')]), intValue(23));
  const listing = call('list', [textValue('.')]);
  assert.ok(listing.kind === 'list' && listing.elements.some(value => value.kind === 'string' && value.value === 'sample.txt'));
});

// Rejects missing authority, workspace escapes, and URLs that require network authority.
test('enforces FileAccess capability and path boundaries', () => {
  const { root, library, context } = fixture();
  assert.throws(() => library.functions.getContents.evaluate(context, [textValue('../outside.txt')]), /outside the trusted workspace|Unable to resolve/);
  assert.throws(() => library.functions.getContents.evaluate(context, [textValue('https://example.com')]), /network authority/);
  const disabled = createFileAccessLibrary({ enabled: false, workspaceRoots: [root] });
  assert.throws(() => disabled.functions.getContents.evaluate(context, [textValue('sample.txt')]), /FileAccess is disabled/);
});

// Evaluates FileAccess through parsing, linking, validation, and the assurance evaluator.
test('evaluates FileAccess from Resolute source when explicitly enabled', async () => {
  const root = resolve('test/fixtures/file-access');
  const document = await parse(
    'goal file_case() <= ** "File case" ** FileAccess.getContents("sample.txt") = "first line\\nsecond line"',
    { documentUri: pathToFileURL(resolve(root, 'model.resolute')).toString(), validation: true }
  );
  assert.equal(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1).length, 0);
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  const registry = createDefaultLibraryRegistry({ fileAccessEnabled: true, workspaceRoots: [root] });
  assert.equal(evaluateGoal(goal, document.uri.toString(), registry).status, 'valid');
});
