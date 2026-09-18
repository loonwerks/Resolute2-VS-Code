import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHelper } from 'langium/test';
import { NodeFileSystem } from 'langium/node';
import { evaluateGoal } from '../src/language/evaluator.js';
import { isFunctionDefinition, type Model } from '../src/language/generated/ast.js';
import { DefaultResoluteLibraryRegistry } from '../src/language/library-api.js';
import { jsonLibrary } from '../src/language/libraries/json-library.js';
import { stringLibrary } from '../src/language/libraries/string-library.js';
import { createShellCommandLibrary } from '../src/language/libraries/shell-command-library.js';
import type { ResoluteValue } from '../src/language/runtime-values.js';
import { createResolute2Services } from '../src/language/resolute2-module.js';
import { createDefaultLibraryRegistry } from '../src/language/libraries/index.js';

const services = createResolute2Services(NodeFileSystem);
const parse = parseHelper<Model>(services.resolute2);
const registry = services.resolute2.runtime.LibraryRegistry;

// Evaluates nested JSON calls using the permissive single-quoted syntax used by the Eclipse fixture.
test('evaluates nested JSON library calls', async () => {
  const document = await parse(
    `goal json_case() <= ** "JSON case" ** Json.getBoolean(Json.toObject(Json.parse("{'result': true}")), "result")`,
    { validation: true }
  );
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  assert.equal(evaluateGoal(goal, document.uri.toString(), registry).status, 'valid');
  assert.equal(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1).length, 0);
});

// Exercises a separately registered pure library through the same evaluator path.
test('evaluates StringLib through the uniform registry', async () => {
  const document = await parse(
    'goal string_case() <= ** "String case" ** StringLib.contains("Resolute", "solute")',
    { validation: true }
  );
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  assert.equal(evaluateGoal(goal, document.uri.toString(), registry).status, 'valid');
});

// Reports unknown libraries, functions, arity, and intrinsic argument-type mismatches before evaluation.
test('validates external library calls from registry signatures', async () => {
  const cases = [
    ['goal bad() <= ** "Bad" ** Missing.call()', "Unknown Resolute library 'Missing'"],
    ['goal bad() <= ** "Bad" ** Json.missing()', "has no function 'missing'"],
    ['goal bad() <= ** "Bad" ** Json.parse()', 'expects 1 argument(s), but received 0'],
    ['goal bad() <= ** "Bad" ** Json.parse(1)', 'expects string, but received int'],
    ['goal bad(value : Json.Missing) <= ** "Bad" ** true', "has no type 'Missing'"]
  ] as const;
  for (const [source, expected] of cases) {
    const document = await parse(source, { validation: true });
    assert.ok(document.diagnostics?.some(diagnostic => typeof diagnostic.message === 'string' && diagnostic.message.includes(expected)), expected);
  }
});

// Converts malformed JSON exceptions into a source-linked assurance evaluation error.
test('surfaces JSON failures in the assurance tree', async () => {
  const document = await parse(
    'goal bad_json() <= ** "Bad JSON" ** Json.isObject(Json.parse("{"))',
    { validation: true }
  );
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  const assurance = evaluateGoal(goal, document.uri.toString(), registry);
  assert.equal(assurance.status, 'error');
  assert.equal(assurance.children[0].identifier, 'Json.parse');
  assert.match(assurance.children[0].text, /Invalid JSON/);
});

// Keeps effectful library signatures available to tooling while denying execution by default.
test('denies effectful libraries without a trust policy', async () => {
  const document = await parse(
    'goal file_case() <= ** "File case" ** FileAccess.getContents("secret") = ""',
    { validation: true }
  );
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  const assurance = evaluateGoal(goal, document.uri.toString(), registry);
  assert.equal(assurance.status, 'error');
  assert.match(assurance.children[0].text, /FileAccess is disabled/);
});

// Rejects ambiguous library registrations at construction time.
test('rejects duplicate library names case-insensitively', () => {
  const local = new DefaultResoluteLibraryRegistry();
  local.register(jsonLibrary);
  assert.throws(() => local.register({ ...jsonLibrary, name: 'json' }), /Duplicate library/);
});


// Calls one StringLib operation directly so every legacy operation can be checked independently.
function callString(name: keyof typeof stringLibrary.functions, arguments_: readonly ResoluteValue[]): ResoluteValue {
  const operation = stringLibrary.functions[name];
  assert.ok(operation, `Missing StringLib operation ${name}`);
  return operation.evaluate({ documentUri: "file:///stringlib-test.resolute" }, arguments_);
}

const textValue = (value: string): ResoluteValue => ({ kind: "string", value });
const intValue = (value: number): ResoluteValue => ({ kind: "int", value });

// Covers the complete Eclipse StringLib surface through the uniform TypeScript interface.
test("implements all legacy StringLib operations", () => {
  const strings = (values: string[]): ResoluteValue => ({ kind: "list", elements: values.map(textValue) });
  assert.deepEqual(callString("concat", [textValue("a"), textValue("b")]), textValue("ab"));
  assert.deepEqual(callString("contains", [textValue("Resolute"), textValue("solute")]), { kind: "bool", value: true });
  assert.deepEqual(callString("endsWith", [textValue("Resolute"), textValue("ute")]), { kind: "bool", value: true });
  assert.deepEqual(callString("hashCode", [textValue("😀")]), intValue(1772899));
  assert.deepEqual(callString("indexOf", [textValue("ababa"), textValue("ba")]), intValue(1));
  assert.deepEqual(callString("join", [textValue("-"), strings(["a", "b", "c"])]), textValue("a-b-c"));
  assert.deepEqual(callString("lastIndexOf", [textValue("ababa"), textValue("ba")]), intValue(3));
  assert.deepEqual(callString("stringLength", [textValue("😀")]), intValue(2));
  assert.deepEqual(callString("matches", [textValue("abc"), textValue("b")]), { kind: "bool", value: false });
  assert.deepEqual(callString("matches", [textValue("abc"), textValue("a.c")]), { kind: "bool", value: true });
  assert.deepEqual(callString("matches", [textValue("abc\n"), textValue("abc")]), { kind: "bool", value: false });
  assert.deepEqual(callString("replace", [textValue("a-a"), textValue("a"), textValue("b")]), textValue("b-b"));
  assert.deepEqual(callString("split", [textValue("a,b,,"), textValue(",")]), strings(["a", "b"]));
  assert.deepEqual(callString("startsWith", [textValue("Resolute"), textValue("Res")]), { kind: "bool", value: true });
  assert.deepEqual(callString("substring", [textValue("Resolute"), intValue(1), intValue(4)]), textValue("eso"));
  assert.deepEqual(callString("toLowerCase", [textValue("AbC")]), textValue("abc"));
  assert.deepEqual(callString("toUpperCase", [textValue("AbC")]), textValue("ABC"));
  assert.deepEqual(callString("trim", [textValue(" \tResolute\n")]), textValue("Resolute"));
  assert.deepEqual(callString("trim", [textValue("\u00a0Resolute\u00a0")]), textValue("\u00a0Resolute\u00a0"));
});

// Converts direct misuse and Java-incompatible substring bounds into explicit library failures.
test("reports StringLib argument and substring errors", () => {
  assert.throws(() => callString("join", [textValue(","), intValue(1)]), /list of strings/);
  assert.throws(() => callString("substring", [textValue("abc"), intValue(2), intValue(1)]), /bounds/);
  assert.throws(() => callString("substring", [textValue("abc"), intValue(-1), intValue(1)]), /bounds/);
});


// Exercises ShellCmd without a shell, including quoted arguments and opaque result accessors.
test("executes ShellCmd and exposes its return code and combined output", () => {
  const library = createShellCommandLibrary({ enabled: true, timeoutMs: 2_000 });
  const context = { documentUri: "file:///tmp/shell-command-test.resolute" };
  const result = library.functions.exec.evaluate(context, [textValue("/usr/bin/printf \x27hello world\x27")]);
  assert.deepEqual(library.functions.get_return_code.evaluate(context, [result]), intValue(0));
  assert.deepEqual(library.functions.get_output.evaluate(context, [result]), textValue("hello world"));
});

// Preserves nonzero process exits as data so Resolute code can inspect them.
test("returns nonzero ShellCmd exits instead of converting them to runtime errors", () => {
  const library = createShellCommandLibrary({ enabled: true, timeoutMs: 2_000 });
  const context = { documentUri: "file:///tmp/shell-command-test.resolute" };
  const result = library.functions.exec.evaluate(context, [textValue("/usr/bin/false")]);
  assert.deepEqual(library.functions.get_return_code.evaluate(context, [result]), intValue(1));
  assert.deepEqual(library.functions.get_output.evaluate(context, [result]), textValue(""));
});

// Requires explicit authority before any ShellCmd operation can execute.
test("denies ShellCmd when process execution is disabled", () => {
  const library = createShellCommandLibrary({ enabled: false });
  assert.throws(
    () => library.functions.exec.evaluate({ documentUri: "file:///tmp/test.resolute" }, [textValue("/usr/bin/true")]),
    /ShellCmd is disabled/
  );
});


// Evaluates ShellCmd through parsing, linking, the registry, and the normal assurance evaluator.
test("evaluates ShellCmd from Resolute source when explicitly enabled", async () => {
  const document = await parse([
    "goal shell_case() <= ** \"Shell case\" **",
    "let command_result : ShellCmd.shell_return_type = ShellCmd.exec(\"/usr/bin/printf ok\");",
    "ShellCmd.get_return_code(command_result) = 0 and ShellCmd.get_output(command_result) = \"ok\""
  ].join("\n"), { validation: true });
  assert.equal(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1).length, 0);
  const goal = document.parseResult.value.definitions.find(isFunctionDefinition);
  assert.ok(goal);
  const assurance = evaluateGoal(goal, document.uri.toString(), createDefaultLibraryRegistry({ shellCommandsEnabled: true }));
  assert.equal(assurance.status, "valid");
});
