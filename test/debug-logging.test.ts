import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHelper } from 'langium/test';
import { NodeFileSystem } from 'langium/node';
import { evaluateGoal, type EvaluationObserver } from '../src/language/evaluator.js';
import { isFunctionDefinition, type Model } from '../src/language/generated/ast.js';
import { createResolute2Services } from '../src/language/resolute2-module.js';
import type { SourceLocation } from '../src/protocol.js';

const services = createResolute2Services(NodeFileSystem);
const parse = parseHelper<Model>(services.resolute2);
const registry = services.resolute2.runtime.LibraryRegistry;

interface RecordedError {
  message: string;
  location?: SourceLocation;
  error?: unknown;
}

// Creates an observer that records the same two streams sent to VS Code by the server.
function recordingObserver(debug: string[], errors: RecordedError[]): EvaluationObserver {
  return {
    debug: message => debug.push(message),
    error: (message, location, error) => errors.push({ message, location, error })
  };
}

// Preserves the Eclipse debug behavior: concatenate arguments, print one line, and return true.
test('debug prints concatenated values and evaluates to true', async () => {
  const document = await parse(
    'goal debug_case() <= ** "Debug case" ** debug("value=", 7, true)',
    { validation: true }
  );
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  const output: string[] = [];
  const errors: RecordedError[] = [];
  const assurance = evaluateGoal(goal, document.uri.toString(), registry, recordingObserver(output, errors));
  assert.equal(assurance.status, 'valid');
  assert.deepEqual(output, ['value=7true']);
  assert.deepEqual(errors, []);
});

// Mirrors a normal evaluator issue to the Debug Console stream with its source location.
test('logs explicit evaluation errors', async () => {
  const document = await parse('goal unknown_case() <= ** "Unknown" ** missing', { validation: true });
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  const errors: RecordedError[] = [];
  evaluateGoal(goal, document.uri.toString(), registry, recordingObserver([], errors));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Unknown identifier/);
  assert.ok(errors[0].location);
  assert.equal(errors[0].error, undefined);
});

// Preserves a thrown TypeScript Error for stack logging and also records its assurance evaluation error.
test('logs library runtime errors with their Error object', async () => {
  const document = await parse(
    'goal bad_json() <= ** "Bad JSON" ** Json.isObject(Json.parse("{"))',
    { validation: true }
  );
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  const errors: RecordedError[] = [];
  const assurance = evaluateGoal(goal, document.uri.toString(), registry, recordingObserver([], errors));
  assert.equal(assurance.status, 'error');
  assert.ok(errors.some(entry => entry.message.includes("Runtime failure in 'Json.parse'") && entry.error instanceof Error));
  assert.ok(errors.some(entry => entry.message.includes('Invalid JSON') && entry.error === undefined));
});
