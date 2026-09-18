import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHelper } from 'langium/test';
import { NodeFileSystem } from 'langium/node';
import { evaluateGoal } from '../src/language/evaluator.js';
import { isFunctionDefinition, type Model } from '../src/language/generated/ast.js';
import { createResolute2Services } from '../src/language/resolute2-module.js';

const services = createResolute2Services(NodeFileSystem);
const parse = parseHelper<Model>(services.resolute2);
const registry = services.resolute2.runtime.LibraryRegistry;

// Parses and evaluates one zero-argument goal used by the core semantic tests.
async function evaluateSource(source: string) {
  const document = await parse(source, { validation: true });
  const parseErrors = [...document.parseResult.lexerErrors, ...document.parseResult.parserErrors];
  assert.equal(parseErrors.length, 0, parseErrors.map(error => error.message).join('\n'));
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  return evaluateGoal(goal, document.uri.toString(), registry);
}

test('rejects claim keywords on ordinary typed functions', async () => {
  for (const keyword of ['goal', 'strategy']) {
    const document = await parse(keyword + ' test_feature() : feature = head(features(test_process()))', {
      validation: true
    });
    assert.ok(document.diagnostics?.some(diagnostic =>
      diagnostic.severity === 1
      && diagnostic.message === "The '" + keyword + "' keyword may only prefix a claim body introduced by '<='."
    ));
  }
});

test('allows ordinary typed functions without a claim keyword', async () => {
  const document = await parse('test_feature() : feature = head(features(test_process()))', { validation: true });
  assert.equal(document.diagnostics?.some(diagnostic =>
    typeof diagnostic.message === 'string'
    && diagnostic.message.includes('keyword may only prefix a claim body')
  ), false);
});

test('evaluates list and set literals with structural set uniqueness', async () => {
  assert.equal((await evaluateSource(
    'goal collections() <= ** "Collections" ** [1, 2, 3] = [1, 2, 3] and {1, 2, 2} = {1, 2} and {1, 2} = {2, 1}'
  )).status, 'valid');
});

test('evaluates filtered set and list comprehensions', async () => {
  const source = [
    'goal comprehensions() <= ** "Comprehensions" **',
    'let values : {int} = {1, 2, 3};',
    '{value * 2 for (value : values) | value > 1} = {4, 6} and',
    '[value + 1 for (value : values)] = [2, 3, 4]'
  ].join('\n');
  assert.equal((await evaluateSource(source)).status, 'valid');
});

test('evaluates forall, exists, empty domains, and Cartesian products', async () => {
  const source = [
    'goal quantifiers() <= ** "Quantifiers" **',
    'let values : {int} = {1, 2, 3};',
    'let empty : {int} = {};',
    'forall (value : values) . value > 0 and',
    'exists (value : values) . value = 2 and',
    'forall (value : empty) . false and',
    'not (exists (value : empty) . true) and',
    'forall (left : values) (right : values) . left + right >= 2'
  ].join('\n');
  assert.equal((await evaluateSource(source)).status, 'valid');
});

test('propagates a failing quantified subgoal with its source location', async () => {
  const source = [
    'goal quantified_failure() <= ** "Quantified failure" **',
    'let values : {int} = {1, 0, 2};',
    'forall (value : values) . positive(value)',
    'goal positive(value : int) <= ** "Positive" ** value > 0'
  ].join('\n');
  const assurance = await evaluateSource(source);
  assert.equal(assurance.status, 'invalid');
  assert.ok(assurance.children.some(child => child.identifier === 'positive' && child.status === 'invalid'));
});

test('evaluates pure collection built-ins', async () => {
  const source = [
    'goal builtins() <= ** "Built-ins" **',
    'member(2, [1, 2, 3]) and has_member(3, {1, 2, 3}) and',
    'length([1, 2, 3]) = 3 and size({1, 2, 2}) = 2 and',
    'sum([1, 2, 3]) = 6 and min([3, 1, 2]) = 1 and max({3, 1, 2}) = 3 and',
    'append([1, 2], 3) = [1, 2, 3] and head([4, 5]) = 4 and tail([4, 5]) = [5] and',
    'as_set([1, 1, 2]) = {1, 2} and as_list({1, 2}) = [1, 2] and',
    'union({1, 2}, {2, 3}) = {1, 2, 3} and intersect({1, 2}, {2, 3}) = {2}'
  ].join('\n');
  assert.equal((await evaluateSource(source)).status, 'valid');
});

test('turns invalid core built-in usage into an evaluation error', async () => {
  const assurance = await evaluateSource('goal bad_head() <= ** "Bad head" ** head([]) = 1');
  assert.equal(assurance.status, 'error');
  assert.equal(assurance.children[0].identifier, 'head');
  assert.match(assurance.children[0].text, /non-empty/);
});

test('evaluates casts as legacy type assertions and implements instanceof', async () => {
  assert.equal((await evaluateSource(
    'goal types() <= ** "Types" ** (int) 1 = 1 and 1 instanceof int and 1 instanceof real and not ("x" instanceof int)'
  )).status, 'valid');
});

test('represents fail as a failed assurance node', async () => {
  const assurance = await evaluateSource('goal explicit_fail() <= ** "Failure" ** fail ** "explanation" **');
  assert.equal(assurance.status, 'invalid');
  assert.equal(assurance.children[0].identifier, 'fail');
  assert.equal(assurance.children[0].text, 'explanation');
});

test('represents solution expressions as successful evidence', async () => {
  const assurance = await evaluateSource('goal evidence() <= ** "Evidence" ** solution test_result: "report.json"');
  assert.equal(assurance.status, 'valid');
  assert.equal(assurance.children[0].kind, 'evidence');
  assert.equal(assurance.children[0].identifier, 'test_result');
  assert.equal(assurance.children[0].text, 'report.json');
});

test('evaluates named context and assumption attributes in claim scope', async () => {
  const source = [
    'goal attributes() <= ** "Attributes" **',
    'context available: true;',
    'assumption enabled: available;',
    'enabled'
  ].join('\n');
  assert.equal((await evaluateSource(source)).status, 'valid');
});

test('propagates nested undeveloped claims as unknown', async () => {
  const source = [
    'goal outer() <= ** "Outer" ** inner()',
    'goal inner() <= ** "Inner" ** undeveloped'
  ].join('\n');
  const assurance = await evaluateSource(source);
  assert.equal(assurance.status, 'unknown');
  assert.equal(assurance.children[0].status, 'unknown');
});

test('propagates undeveloped through compound expressions', async () => {
  assert.equal((await evaluateSource(
    'goal unknown_expression() <= ** "Unknown expression" ** true and undeveloped'
  )).status, 'unknown');
});

test('short-circuit operators skip unreachable evaluation errors', async () => {
  assert.equal((await evaluateSource(
    'goal short_circuit() <= ** "Short circuit" ** false andthen missing or true orelse missing'
  )).status, 'valid');
});
