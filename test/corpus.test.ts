import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { AstUtils } from 'langium';
import { parseHelper } from 'langium/test';
import { NodeFileSystem } from 'langium/node';
import { createResolute2Services } from '../src/language/resolute2-module.js';
import { isDomainReference, isFunctionDefinition, isReferenceExpression, type Model } from '../src/language/generated/ast.js';
import { evaluateGoal } from '../src/language/evaluator.js';
import { AadlAirProvider } from '../src/model/aadl-air-provider.js';

const services = createResolute2Services(NodeFileSystem);
const parse = parseHelper<Model>(services.resolute2);

for (const fixture of ['assurance_pat_lib.resolute', 'feb_demo_res.resolute', 'model_integration_test.resolute', 'model_integration_tests.resolute']) {
  // Parses each real Eclipse-era fixture and reports every lexer or parser error together.
  test(`parses ${fixture}`, async () => {
    const file = resolve('spec/corpus', fixture);
    const document = await parse(await readFile(file, 'utf8'), { documentUri: `file://${file}`, validation: true });
    const parseErrors = [...document.parseResult.lexerErrors, ...document.parseResult.parserErrors];
    assert.equal(parseErrors.length, 0, parseErrors.map(error => error.message).join('\n'));
    if (fixture === 'feb_demo_res.resolute') {
      const unresolved = document.diagnostics?.filter(diagnostic =>
        typeof diagnostic.message === 'string' && diagnostic.message.includes('Could not resolve reference')
      ) ?? [];
      assert.equal(unresolved.length, 0, unresolved.map(diagnostic => diagnostic.message).join('\n'));
    }
  });
}

// Confirms that the transport-neutral evaluator can execute the primitive claim subset.
test('evaluates a primitive zero-argument goal', async () => {
  const document = await parse('goal arithmetic() <= ** "Arithmetic is sound" ** 1 + 1 = 2', { validation: true });
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  const result = evaluateGoal(goal, document.uri.toString(), services.resolute2.runtime.LibraryRegistry);
  assert.equal(result.status, 'valid');
  assert.equal(result.text, 'Arithmetic is sound');
});

// Confirms that a let initializer is evaluated and its value is available in the continuation.
test('evaluates let-bound variables', async () => {
  const document = await parse(
    'goal let_example() <= ** "Let binding works" ** let value : int = 1; value + 1 = 2',
    { validation: true }
  );
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  assert.equal(evaluateGoal(goal, document.uri.toString(), services.resolute2.runtime.LibraryRegistry).status, 'valid');
});

// Confirms integer subtraction feeds equality with the expected primitive result.
test('evaluates x minus x as equal to zero', async () => {
  const document = await parse(
    'goal subtraction_equality() <= ** "Subtraction equality" ** let x : int = 7; x - x = 0',
    { validation: true }
  );
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  assert.equal(evaluateGoal(goal, document.uri.toString(), services.resolute2.runtime.LibraryRegistry).status, 'valid');
});

// Confirms malformed AIR leaves the previous valid snapshot available.
test('AIR provider preserves its last good snapshot', async () => {
  const provider = new AadlAirProvider();
  const first = await provider.refresh([{ uri: 'file:///model.json', text: '{"components":[]}' }]);
  const second = await provider.refresh([{ uri: 'file:///model.json', text: '{not json}' }]);
  assert.equal(second?.revision, first?.revision);
  assert.equal(second?.stale, true);
  assert.deepEqual(second?.air, first?.air);
  assert.equal(provider.diagnostics().length, 1);
});

// Resolves function parameters and let bindings in the continuation expression.
test('links function parameters and let-bound variables', async () => {
  const document = await parse(
    'goal scoped(input : int) <= ** "Scoped" ** let local : int = input; local + input > 0',
    { validation: true }
  );
  const references = AstUtils.streamAllContents(document.parseResult.value).filter(isReferenceExpression).toArray();
  assert.deepEqual(references.map(reference => reference.reference.$refText), ['input', 'local', 'input']);
  assert.deepEqual(references.map(reference => reference.reference.ref?.name), ['input', 'local', 'input']);
  assert.equal(document.diagnostics?.filter(diagnostic => typeof diagnostic.message === 'string' && diagnostic.message.includes('Could not resolve reference')).length, 0);
});

// Resolves a quantifier domain in the outer scope and its variable in the quantifier body.
test('links quantified variables with lexical nesting', async () => {
  const document = await parse(
    'goal all_positive(values : {int}) <= ** "Positive" ** forall (value : values) . value > 0',
    { validation: true }
  );
  const references = AstUtils.streamAllContents(document.parseResult.value).filter(isReferenceExpression).toArray();
  assert.deepEqual(references.map(reference => reference.reference.ref?.name), ['value']);
  const domainReferences = AstUtils.streamAllContents(document.parseResult.value)
    .filter(isDomainReference).toArray();
  assert.equal(domainReferences[0].reference.ref?.name, 'values');
});

// Gives the let binding precedence over an outer parameter with the same name.
test('inner let bindings shadow function parameters', async () => {
  const document = await parse(
    'goal shadowed(value : int) <= ** "Shadowed" ** let value : int = value; value = 1',
    { validation: true }
  );
  const references = AstUtils.streamAllContents(document.parseResult.value).filter(isReferenceExpression).toArray();
  assert.equal(references[0].reference.ref?.$type, 'Parameter');
  assert.equal(references[1].reference.ref?.$type, 'LetBinding');
});

// Keeps a let binding out of scope in its own initializer.
test('does not expose a let binding before its declaration', async () => {
  const document = await parse(
    'goal invalid() <= ** "Invalid" ** let missing : int = missing; true',
    { validation: true }
  );
  const reference = AstUtils.streamAllContents(document.parseResult.value).filter(isReferenceExpression).head();
  assert.equal(reference?.reference.ref, undefined);
  assert.ok(document.diagnostics?.some(diagnostic => typeof diagnostic.message === 'string' && diagnostic.message.includes('Could not resolve reference')));
});

// Resolves collection-comprehension variables in both the map and filter expressions.
test('links comprehension variables from the real example pattern', async () => {
  const document = await parse(
    'positive(values : {int}) : {int} = {value for (value : values) | value > 0}',
    { validation: true }
  );
  const references = AstUtils.streamAllContents(document.parseResult.value).filter(isReferenceExpression).toArray();
  assert.deepEqual(references.map(reference => reference.reference.ref?.name), ['value', 'value']);
  const domain = AstUtils.streamAllContents(document.parseResult.value).filter(isDomainReference).head();
  assert.equal(domain?.reference.ref?.name, 'values');
  assert.equal(document.diagnostics?.filter(diagnostic =>
    typeof diagnostic.message === 'string' && diagnostic.message.includes('Could not resolve reference')
  ).length, 0);
});

// Builds a nested assurance tree and attaches a failed leaf to its false term.
test('records called subgoals and failed source locations', async () => {
  const source = [
    'goal top() <=',
    '** "Top-level case" **',
    'middle()',
    '',
    'goal middle() <=',
    '** "Middle case" **',
    'leaf()',
    '',
    'goal leaf() <=',
    '** "Leaf case" **',
    'false'
  ].join('\n');
  const document = await parse(source, { validation: true });
  const top = document.parseResult.value.definitions.filter(isFunctionDefinition).find(
    definition => definition.name === 'top'
  );
  assert.ok(top);

  const assurance = evaluateGoal(top, document.uri.toString(), services.resolute2.runtime.LibraryRegistry);
  assert.equal(assurance.status, 'invalid', JSON.stringify(assurance));
  assert.equal(assurance.children.length, 1);
  assert.equal(assurance.children[0].text, 'Middle case');
  assert.equal(assurance.children[0].children.length, 1);
  const failedLeaf = assurance.children[0].children[0];
  assert.equal(failedLeaf.text, 'Leaf case');
  assert.equal(failedLeaf.status, 'invalid');
  assert.equal(failedLeaf.location?.range.start.line, 10);
  assert.equal(failedLeaf.location?.range.start.character, 0);
});

// Propagates an evaluation error from a called goal through every caller.
test('propagates subgoal errors up the assurance tree', async () => {
  const source = [
    'goal top_error() <=',
    '** "Top error case" **',
    'broken()',
    '',
    'goal broken() <=',
    '** "Broken case" **',
    'analysis("not implemented")'
  ].join('\n');
  const document = await parse(source, { validation: true });
  const top = document.parseResult.value.definitions.filter(isFunctionDefinition).find(
    definition => definition.name === 'top_error'
  );
  assert.ok(top);

  const assurance = evaluateGoal(top, document.uri.toString(), services.resolute2.runtime.LibraryRegistry);
  assert.equal(assurance.identifier, 'top_error');
  assert.equal(assurance.status, 'error');
  assert.equal(assurance.children.length, 1);
  assert.equal(assurance.children[0].identifier, 'broken');
  assert.equal(assurance.children[0].status, 'error');
  assert.equal(assurance.location?.range.start.line, 6);
});

// Evaluates the real sub_goal2 through constants and preserves its false inequality.
test('evaluates sub_goal2 inequality from assurance_pat_lib', async () => {
  const source = await readFile(resolve('spec/corpus/assurance_pat_lib.resolute'), 'utf8');
  const document = await parse(source, {
    documentUri: 'file:///assurance-constant-evaluation.resolute',
    validation: true
  });
  const subGoal = document.parseResult.value.definitions.filter(isFunctionDefinition).find(
    definition => definition.name === 'sub_goal2'
  );
  assert.ok(subGoal);
  const assurance = evaluateGoal(subGoal, document.uri.toString(), services.resolute2.runtime.LibraryRegistry);
  assert.equal(assurance.status, 'valid');
});


// Materializes an unresolved identifier as an error node and propagates it to the goal.
test('shows an unknown identifier as a propagated evaluation issue', async () => {
  const document = await parse(
    'goal unknown_identifier() <= ** "Unknown identifier case" ** missing_value',
    { validation: true }
  );
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  const assurance = evaluateGoal(goal, document.uri.toString(), services.resolute2.runtime.LibraryRegistry);
  assert.equal(assurance.status, 'error');
  assert.equal(assurance.children.length, 1);
  assert.equal(assurance.children[0].identifier, 'missing_value');
  assert.match(assurance.children[0].text, /Unknown identifier/);
  assert.equal(assurance.children[0].status, 'error');
});

// Confirms finite quantifiers evaluate the complete current February demonstration.
test("evaluates the complete feb_demo assurance case", async () => {
  const source = await readFile(resolve("spec/corpus/feb_demo_res.resolute"), "utf8");
  const document = await parse(source, {
    documentUri: "file:///feb-demo-evaluation.resolute",
    validation: true
  });
  const top = document.parseResult.value.definitions.filter(isFunctionDefinition).find(
    definition => definition.name === "component_contracts_satisfied"
  );
  assert.ok(top);
  const assurance = evaluateGoal(top, document.uri.toString(), services.resolute2.runtime.LibraryRegistry);
  assert.equal(assurance.status, "valid");
  assert.equal(assurance.children[0]?.identifier, "argue_over_components");
  assert.equal(assurance.children[0]?.status, "valid");
});

