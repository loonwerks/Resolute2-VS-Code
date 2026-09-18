# Resolute2 for VS Code

A version of Resolute for VS Code with SysMLv2 model support.

## Quickstart

* Clone this repository
* Run `npm run build`
* Run `npm run package` and answer yes to ignore the warnings about repository and license
* Install the resulting `resolute2-vscode.vsix` into VS Code
* Open the `spec/corpus` directory for examples to toy around with


## Prerequisites

- A local Sireum installation with `SIREUM_HOME` set, or the `resolute2.sireum.home` VS Code setting
- The AADL-for-SysML library directories, configured with `resolute2.sysml.libraryPaths`

Example workspace settings:

```json
{
  "resolute2.sireum.home": "/absolute/path/to/Sireum",
  "resolute2.sysml.libraryPaths": [
    "/absolute/path/to/aadl.library",
    "/absolute/path/to/hamr.aadl.library"
  ]
}
```

Library paths are searched recursively for `.sysml` files. `${workspaceFolder}` can be used in a path.

## Development

Developed against Node.js 24.18.1

```bash
npm install
npm run build
npm test
```

`npm run build` generates Langium artifacts, checks TypeScript, bundles the extension and language server, and compiles `dist/resolute-sireum-bridge.jar` with Sireum’s bundled JDK, targeting Java 21 bytecode, and links it against `$SIREUM_HOME/bin/sireum.jar`.

Press F5 in a VS Code session and choose `Run Resolute2 Extension`. Open a `.resolute` file in the Extension Development Host opened by the debugger.

## Things to keep in mind

### Evaluation consistency

----

Before a goal runs, the extension saves every dirty workspace-owned `.resolute` and `.sysml` document. If any save fails, evaluation is cancelled. It then waits for Sireum to process that saved source generation and sends the resulting AIR revision with the evaluation request.

If saved SysML contains an error, diagnostics appear on the relevant source locations. The last valid AIR snapshot remains available and is marked stale. The assurance view explicitly reports when that stale revision was used.

Non-model Resolute scripts still parse and evaluate when Sireum is not configured. Model built-ins report that no valid AIR model is available.

### Model names

----

String arguments that denote SysML model definitions must use fully qualified names such as `SW::seL4`. Such a name denotes the `seL4` part definition in package `SW`, not a component usage or AIR instance path. `instance("SW::seL4")` requires exactly one AIR component classified by that definition, while `instances("SW::seL4")` returns all such components. Short names and ordinary instance paths are rejected. Raw AIR identifiers remain available only through the explicit `AIR_DEBUG_NAMESPACE::` prefix for debugging. Definition entries aggregate effective AIR properties from every indexed component carrying that classifier. Identical associations are deduplicated; conflicting values remain visible and make `property` report an ambiguity rather than selecting one instance arbitrarily.
