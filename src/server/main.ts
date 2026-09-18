import path from 'node:path';
import { URI, type LangiumDocument } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { isFunctionDefinition, type Model } from '../language/generated/ast.js';
import { evaluateGoal, type EvaluationObserver } from '../language/evaluator.js';
import { createResolute2Services } from '../language/resolute2-module.js';
import { ModelRuntime } from '../model/model-runtime.js';
import { SireumBridgeClient } from '../model/sireum-bridge-client.js';
import { SysmlModelProvider } from '../model/sysml-provider.js';
import type {
  AssuranceNode, EvaluateGoalParams, GoalDescriptor, ModelRefreshResult, RefreshModelParams,
  RuntimeLogMessage, SourceLocation
} from '../protocol.js';

const connection = createConnection(ProposedFeatures.all);
const { shared, resolute2 } = createResolute2Services({ connection, ...NodeFileSystem });

const bridge = createBridge();
const modelRuntime = new ModelRuntime(bridge ? new SysmlModelProvider(bridge) : undefined);

const evaluationObserver: EvaluationObserver = {
  debug: message => connection.sendNotification('resolute/debugOutput', message),
  error: (message, location, error) => sendRuntimeLog(error ? 'runtime-error' : 'evaluation-error', message, location, error)
};

/** Creates the local Sireum process boundary only for trusted workspaces with a configured installation. */
function createBridge(): SireumBridgeClient | undefined {
  if (process.env.RESOLUTE2_WORKSPACE_TRUSTED !== 'true') return undefined;
  const sireumHome = process.env.RESOLUTE2_SIREUM_HOME;
  const extensionPath = process.env.RESOLUTE2_EXTENSION_PATH;
  if (!sireumHome || !extensionPath) return undefined;
  return new SireumBridgeClient(
    sireumHome,
    path.join(extensionPath, 'dist', 'resolute-sireum-bridge.jar'),
    message => connection.console.error(message)
  );
}

/** Sends evaluator and runtime failures to the extension host without making them LSP diagnostics. */
function sendRuntimeLog(level: RuntimeLogMessage['level'], message: string, location?: SourceLocation, error?: unknown): void {
  const stack = error instanceof Error ? error.stack : undefined;
  connection.sendNotification('resolute/runtimeLog', { level, message, stack, location } satisfies RuntimeLogMessage);
}

/** Runs a language-server request and logs unexpected TypeScript failures. */
async function loggedRequest<T>(name: string, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendRuntimeLog('runtime-error', `Resolute language-server request '${name}' failed: ${message}`, undefined, error);
    throw error;
  }
}

/** Waits for workspace discovery and safely reuses a document inserted by an LSP update. */
async function getReadyDocument(documentUri: string): Promise<LangiumDocument> {
  await shared.workspace.WorkspaceManager.ready;
  const uri = URI.parse(documentUri);
  const documents = shared.workspace.LangiumDocuments;
  const existing = documents.getDocument(uri);
  if (existing) return existing;
  try { return await documents.getOrCreateDocument(uri); }
  catch (error) {
    const concurrentlyAdded = documents.getDocument(uri);
    if (concurrentlyAdded) return concurrentlyAdded;
    throw error;
  }
}

function definitionLocation(definition: { $cstNode?: { range: SourceLocation['range'] } }, uri: string): SourceLocation {
  return { uri, range: definition.$cstNode?.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } };
}

connection.onRequest('resolute/listGoals', documentUri => loggedRequest('resolute/listGoals', async () => {
  const document = await getReadyDocument(documentUri);
  const model = document.parseResult.value as Model;
  return model.definitions.filter(isFunctionDefinition).filter(fn => fn.kind === 'goal').map(fn => ({
    name: fn.name,
    qualifiedName: fn.name,
    parameters: fn.parameters.map(parameter => parameter.name),
    location: definitionLocation(fn, documentUri)
  } satisfies GoalDescriptor));
}));

/** Rebuilds the authoritative model from one complete source generation. */
connection.onRequest('resolute/refreshModel', (params: RefreshModelParams) => loggedRequest('resolute/refreshModel', async () => {
  const snapshot = await modelRuntime.refresh(params.files);
  return {
    generation: params.generation,
    revision: snapshot?.revision,
    state: modelRuntime.state,
    stale: Boolean(snapshot?.stale),
    diagnostics: [...modelRuntime.diagnostics()]
  } satisfies ModelRefreshResult;
}));

connection.onRequest('resolute/evaluateGoal', (params: EvaluateGoalParams) => loggedRequest('resolute/evaluateGoal', async () => {
  const document = await getReadyDocument(params.documentUri);
  const snapshot = modelRuntime.snapshot;
  if (params.expectedModelRevision !== undefined && snapshot?.revision !== params.expectedModelRevision) {
    return {
      identifier: params.qualifiedName, kind: 'message', status: 'error',
      text: `Model revision changed before evaluation (expected ${params.expectedModelRevision}, found ${String(snapshot?.revision)}).`,
      references: [], children: []
    } satisfies AssuranceNode;
  }
  const model = document.parseResult.value as Model;
  const goal = model.definitions.find(definition => isFunctionDefinition(definition) && definition.name === params.qualifiedName);
  if (!goal || !isFunctionDefinition(goal)) {
    return { identifier: params.qualifiedName, kind: 'message', status: 'error', text: `Unknown goal '${params.qualifiedName}'.`, references: [], children: [] } satisfies AssuranceNode;
  }
  const assurance = evaluateGoal(goal, params.documentUri, resolute2.runtime.LibraryRegistry, evaluationObserver, snapshot);
  if (snapshot) assurance.model = { revision: snapshot.revision, stale: snapshot.stale };
  return assurance;
}));

connection.onShutdown(() => bridge?.stop());
startLanguageServer(shared);
