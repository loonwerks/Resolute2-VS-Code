import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { NodeFileSystem } from 'langium/node';
import { parseHelper } from 'langium/test';
import { createResolute2Services } from '../src/language/resolute2-module.js';
import { isFunctionDefinition, type Model } from '../src/language/generated/ast.js';
import { evaluateGoal } from '../src/language/evaluator.js';
import { SysmlModelProvider } from '../src/model/sysml-provider.js';
import test from 'node:test';
import { SireumBridgeClient } from '../src/model/sireum-bridge-client.js';

const sireumHome = process.env.SIREUM_HOME;

test('starts the packaged Sireum bridge and negotiates protocol version 1', { skip: !sireumHome }, async () => {
  const logs: string[] = [];
  const client = new SireumBridgeClient(
    sireumHome!, path.resolve('dist/resolute-sireum-bridge.jar'), message => logs.push(message)
  );
  try {
    await client.start();
    assert.deepEqual(logs, []);
  } finally {
    client.stop();
  }
});

/** Recursively reads the checked-in SysML model generation used by the extension corpus. */
async function corpusModelFiles(directory: string): Promise<Array<{ uri: string; text: string }>> {
  const result: Array<{ uri: string; text: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await corpusModelFiles(file));
    else if (entry.name.endsWith('.sysml')) result.push({ uri: `file://${file}`, text: await readFile(file, 'utf8') });
  }
  return result.sort((left, right) => left.uri.localeCompare(right.uri));
}

test('evaluates every model built-in corpus goal against Sireum AIR', { skip: !sireumHome, timeout: 120_000 }, async () => {
  const client = new SireumBridgeClient(
    sireumHome!, path.resolve('dist/resolute-sireum-bridge.jar'), message => { throw new Error(message); }
  );
  try {
    const provider = new SysmlModelProvider(client);
    const snapshot = await provider.refresh(await corpusModelFiles(path.resolve('spec/corpus/model')));
    assert.ok(snapshot);
    const services = createResolute2Services(NodeFileSystem);
    const parse = parseHelper<Model>(services.resolute2);
    const sourceFile = path.resolve('spec/corpus/model_integration_tests.resolute');
    const document = await parse(await readFile(sourceFile, 'utf8'), {
      documentUri: `file://${sourceFile}`, validation: true
    });
    const parseErrors = [...document.parseResult.lexerErrors, ...document.parseResult.parserErrors];
    assert.equal(parseErrors.length, 0, parseErrors.map(error => error.message).join('\n'));
    const goals = document.parseResult.value.definitions.filter(isFunctionDefinition).filter(definition => definition.kind === 'goal');
    const failures = goals.map(goal => ({
      goal: goal.name,
      result: evaluateGoal(goal, document.uri.toString(), services.resolute2.runtime.LibraryRegistry, undefined, snapshot)
    })).filter(entry => entry.result.status !== 'valid');
    assert.deepEqual(failures.map(entry => ({ goal: entry.goal, status: entry.result.status, text: entry.result.text })), []);
  } finally {
    client.stop();
  }
});
