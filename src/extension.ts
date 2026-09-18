import * as path from 'node:path';
import * as vscode from 'vscode';
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from 'vscode-languageclient/node';
import type {
  AssuranceNode, EvaluateGoalParams, GoalDescriptor, ModelDiagnosticDto, ModelRefreshResult,
  ModelSourceFile, RefreshModelParams, RuntimeLogMessage
} from './protocol.js';
import { AssuranceTreeProvider } from './assurance-tree.js';
import { GoalsTreeProvider } from './goals-tree.js';

let client: LanguageClient | undefined;
let modelGeneration = 0;
let refreshTimer: NodeJS.Timeout | undefined;
let modelDiagnostics: vscode.DiagnosticCollection;
let evaluationBarrierActive = false;
let modelStatus: vscode.StatusBarItem;

class ResoluteDebugTerminal implements vscode.Pseudoterminal, vscode.Disposable {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private terminal: vscode.Terminal | undefined;
  private opened = false;
  private readonly pending: string[] = [];
  readonly onDidWrite = this.writeEmitter.event;

  open(): void { this.opened = true; this.pending.splice(0).forEach(message => this.writeEmitter.fire(message)); }
  close(): void { this.opened = false; this.terminal = undefined; }

  /** Writes one evaluator debug line without interpreting it as a shell command. */
  write(message: string): void {
    if (!this.terminal) this.terminal = vscode.window.createTerminal({ name: 'Resolute Debug', pty: this });
    const newline = '\r\n';
    const normalized = message.replace(/\r?\n/g, newline);
    const formatted = normalized.endsWith(newline) ? normalized : normalized + newline;
    if (this.opened) this.writeEmitter.fire(formatted);
    else this.pending.push(formatted);
    this.terminal.show(true);
  }

  dispose(): void { this.terminal?.dispose(); this.pending.length = 0; this.writeEmitter.dispose(); }
}

/** Starts the bundled language server and registers model-aware views and commands. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const assuranceTree = new AssuranceTreeProvider(context.extensionPath);
  const goalsTree = new GoalsTreeProvider();
  const debugTerminal = new ResoluteDebugTerminal();
  modelDiagnostics = vscode.languages.createDiagnosticCollection('resolute2-sysml');
  modelStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  modelStatus.text = '$(circle-slash) Resolute2 Model: Unavailable';
  modelStatus.show();

  context.subscriptions.push(debugTerminal, modelDiagnostics, modelStatus);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('resolute2.assuranceCase', assuranceTree));
  context.subscriptions.push(vscode.window.registerTreeDataProvider('resolute2.goals', goalsTree));

  await startClient(context, debugTerminal);
  await refreshGoals(goalsTree);
  scheduleModelRefresh();

  context.subscriptions.push(vscode.commands.registerCommand('resolute2.restartServer', async () => {
    await client?.stop();
    await startClient(context, debugTerminal);
    await refreshGoals(goalsTree);
    scheduleModelRefresh();
  }));
  context.subscriptions.push(vscode.commands.registerCommand(
    'resolute2.evaluateGoal',
    async (requestedGoal?: GoalDescriptor) => evaluateGoalCommand(requestedGoal, assuranceTree)
  ));
  context.subscriptions.push(vscode.commands.registerCommand('resolute2.openGoal', openGoal));
  context.subscriptions.push(vscode.commands.registerCommand('resolute2.openAssuranceNode', openAssuranceNode));
  context.subscriptions.push(vscode.commands.registerCommand('resolute2.refreshGoals', () => refreshGoals(goalsTree)));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => refreshGoals(goalsTree)));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document === vscode.window.activeTextEditor?.document) void refreshGoals(goalsTree);
    if (isSysml(event.document.uri)) scheduleModelRefresh();
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
    if (isSysml(document.uri)) scheduleModelRefresh();
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('resolute2.sireum') || event.affectsConfiguration('resolute2.sysml')) scheduleModelRefresh();
  }));
  const sysmlWatcher = vscode.workspace.createFileSystemWatcher('**/*.sysml');
  context.subscriptions.push(sysmlWatcher);
  context.subscriptions.push(sysmlWatcher.onDidCreate(scheduleModelRefresh));
  context.subscriptions.push(sysmlWatcher.onDidChange(scheduleModelRefresh));
  context.subscriptions.push(sysmlWatcher.onDidDelete(scheduleModelRefresh));
}

/** Saves all relevant workspace documents before obtaining the exact model revision for evaluation. */
async function prepareEvaluation(): Promise<number | undefined> {
  cancelScheduledRefresh();
  const relevant = vscode.workspace.textDocuments.filter(document =>
    document.isDirty && document.uri.scheme === 'file' && isResoluteOrSysml(document.uri)
    && vscode.workspace.getWorkspaceFolder(document.uri) !== undefined);
  for (const document of relevant) {
    if (!await document.save()) {
      void vscode.window.showErrorMessage(`Resolute2 evaluation cancelled because '${document.uri.fsPath}' was not saved.`);
      throw new Error(`Unable to save ${document.uri.toString()} before evaluation.`);
    }
  }
  cancelScheduledRefresh();
  const result = await refreshModel();
  if (!result) throw new Error('Unable to establish a model generation before evaluation.');
  return result.revision;
}

/** Evaluates a requested goal only after the save and model-generation barrier completes. */
async function evaluateGoalCommand(requestedGoal: GoalDescriptor | undefined, assuranceTree: AssuranceTreeProvider): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'resolute2' || !client) return;

  try {
    let goal = requestedGoal;
    if (!goal) {
      const goals = await client.sendRequest<GoalDescriptor[]>('resolute/listGoals', editor.document.uri.toString());
      const selected = await vscode.window.showQuickPick(
        goals.filter(candidate => candidate.parameters.length === 0).map(candidate => ({ label: candidate.name, goal: candidate })),
        { placeHolder: 'Choose a zero-argument Resolute goal' }
      );
      goal = selected?.goal;
    }
    if (!goal) return;

    evaluationBarrierActive = true;
    try {
      const revision = await prepareEvaluation();
      const result = await client.sendRequest<AssuranceNode>('resolute/evaluateGoal', {
        documentUri: goal.location.uri,
        qualifiedName: goal.qualifiedName,
        expectedModelRevision: revision
      } satisfies EvaluateGoalParams);
      assuranceTree.setRoot(withStaleWarning(result));
    } finally {
      evaluationBarrierActive = false;
      scheduleModelRefresh();
    }
  } catch (error) {
    console.error('Resolute2 evaluate-goal command failed.', error);
  }
}

/** Adds a visible stale-model warning without changing the logical result status. */
function withStaleWarning(result: AssuranceNode): AssuranceNode {
  if (!result.model?.stale) return result;
  return {
    ...result,
    children: [{
      identifier: 'model',
      kind: 'message',
      status: 'unknown',
      text: `Using last valid AIR model revision ${result.model.revision}; saved SysML sources currently contain errors.`,
      references: [],
      children: []
    }, ...result.children]
  };
}

/** Schedules a coalesced background model refresh for editing diagnostics. */
function scheduleModelRefresh(): void {
  if (evaluationBarrierActive) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { refreshTimer = undefined; void refreshModel(); }, 750);
}

function cancelScheduledRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
}

/** Sends one complete workspace and library SysML source set to the language server. */
async function refreshModel(): Promise<ModelRefreshResult | undefined> {
  if (!client) return undefined;
  modelStatus.text = '$(sync~spin) Resolute2 Model: Building';
  try {
    const files = await collectSysmlSources();
    const result = await client.sendRequest<ModelRefreshResult>('resolute/refreshModel', {
      files,
      generation: ++modelGeneration
    } satisfies RefreshModelParams);
    applyModelDiagnostics(result.diagnostics);
    modelStatus.text = result.state === 'ready'
      ? `$(check) Resolute2 Model: Ready r${String(result.revision)}`
      : result.state === 'stale'
        ? `$(warning) Resolute2 Model: Stale r${String(result.revision)}`
        : '$(circle-slash) Resolute2 Model: Unavailable';
    return result;
  } catch (error) {
    modelStatus.text = '$(error) Resolute2 Model: Unavailable';
    console.error('Resolute2 model refresh failed.', error);
    return undefined;
  }
}

/** Collects workspace SysML files, configured external libraries, and current open-buffer text. */
async function collectSysmlSources(): Promise<ModelSourceFile[]> {
  const uris = new Map<string, vscode.Uri>();
  for (const uri of await vscode.workspace.findFiles('**/*.sysml', '**/{node_modules,.git}/**')) uris.set(uri.toString(), uri);

  const configured = vscode.workspace.getConfiguration('resolute2.sysml').get<string[]>('libraryPaths', []);
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    for (const configuredPath of configured) {
      const expanded = configuredPath.replaceAll('${workspaceFolder}', folder.uri.fsPath);
      for (const uri of await vscode.workspace.findFiles(new vscode.RelativePattern(expanded, '**/*.sysml'))) {
        uris.set(uri.toString(), uri);
      }
    }
  }

  const open = new Map(vscode.workspace.textDocuments
    .filter(document => isSysml(document.uri))
    .map(document => [document.uri.toString(), document.getText()]));
  const files: ModelSourceFile[] = [];
  for (const [key, uri] of uris) {
    const text = open.get(key) ?? Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    files.push({ uri: key, text });
  }
  return files.sort((left, right) => left.uri.localeCompare(right.uri));
}

/** Replaces all Sireum-owned diagnostics after a complete model generation. */
function applyModelDiagnostics(diagnostics: readonly ModelDiagnosticDto[]): void {
  modelDiagnostics.clear();
  const grouped = new Map<string, vscode.Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.uri) continue;
    const range = new vscode.Range(
      diagnostic.startLine ?? 0, diagnostic.startCharacter ?? 0,
      diagnostic.endLine ?? diagnostic.startLine ?? 0, diagnostic.endCharacter ?? diagnostic.startCharacter ?? 0
    );
    const severity = diagnostic.severity === 'error' ? vscode.DiagnosticSeverity.Error
      : diagnostic.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
    const item = new vscode.Diagnostic(range, diagnostic.message, severity);
    item.source = diagnostic.source ?? 'Sireum';
    grouped.set(diagnostic.uri, [...(grouped.get(diagnostic.uri) ?? []), item]);
  }
  for (const [uri, items] of grouped) modelDiagnostics.set(vscode.Uri.parse(uri), items);
}

async function refreshGoals(provider: GoalsTreeProvider): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'resolute2' || !client) { provider.setGoals([]); return; }
  try {
    provider.setGoals(await client.sendRequest<GoalDescriptor[]>('resolute/listGoals', editor.document.uri.toString()));
  } catch (error) {
    provider.setGoals([]);
    console.error('Unable to refresh the Resolute2 Goals view.', error);
  }
}

async function openGoal(goal: GoalDescriptor): Promise<void> { await openLocation(goal.location); }
async function openAssuranceNode(node: AssuranceNode): Promise<void> { if (node.location) await openLocation(node.location); }

async function openLocation(location: AssuranceNode['location']): Promise<void> {
  if (!location) return;
  const uri = vscode.Uri.parse(location.uri);
  const range = new vscode.Range(location.range.start.line, location.range.start.character, location.range.end.line, location.range.end.character);
  const editor = await vscode.window.showTextDocument(uri);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function logRuntimeMessage(log: RuntimeLogMessage): void {
  const source = log.location ? ` (${log.location.uri}:${log.location.range.start.line + 1}:${log.location.range.start.character + 1})` : '';
  const category = log.level === 'runtime-error' ? 'runtime error' : 'evaluation error';
  console.error(`[Resolute2 ${category}] ${log.message}${source}${log.stack ? `\n${log.stack}` : ''}`);
}

/** Creates and starts the language client with trusted model-process configuration. */
async function startClient(context: vscode.ExtensionContext, debugTerminal: ResoluteDebugTerminal): Promise<void> {
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.cjs'));
  const shellCommandsEnabled = vscode.workspace.isTrusted && vscode.workspace.getConfiguration('resolute2.shellCmd').get<boolean>('enabled', false);
  const fileAccessEnabled = vscode.workspace.isTrusted && vscode.workspace.getConfiguration('resolute2.fileAccess').get<boolean>('enabled', false);
  const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) ?? [];
  const configuredSireum = vscode.workspace.getConfiguration('resolute2.sireum').get<string>('home', '').trim();
  const serverEnvironment = {
    ...process.env,
    RESOLUTE2_SHELL_CMD_ENABLED: String(shellCommandsEnabled),
    RESOLUTE2_FILE_ACCESS_ENABLED: String(fileAccessEnabled),
    RESOLUTE2_WORKSPACE_ROOTS: JSON.stringify(workspaceRoots),
    RESOLUTE2_WORKSPACE_TRUSTED: String(vscode.workspace.isTrusted),
    RESOLUTE2_SIREUM_HOME: configuredSireum || process.env.SIREUM_HOME || '',
    RESOLUTE2_EXTENSION_PATH: context.extensionPath
  };
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc, options: { env: serverEnvironment } },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { env: serverEnvironment } }
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'resolute2' }],
    synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{resolute,sysml}') },
    outputChannelName: 'Resolute2 Language Server'
  };
  client = new LanguageClient('resolute2', 'Resolute2 Language Server', serverOptions, clientOptions);
  await client.start();
  context.subscriptions.push(client.onNotification('resolute/debugOutput', message => debugTerminal.write(String(message))));
  context.subscriptions.push(client.onNotification('resolute/runtimeLog', (log: RuntimeLogMessage) => logRuntimeMessage(log)));
}

function isSysml(uri: vscode.Uri): boolean { return uri.path.toLowerCase().endsWith('.sysml'); }
function isResoluteOrSysml(uri: vscode.Uri): boolean {
  const lower = uri.path.toLowerCase();
  return lower.endsWith('.sysml') || lower.endsWith('.resolute');
}

export async function deactivate(): Promise<void> {
  if (refreshTimer) clearTimeout(refreshTimer);
  await client?.stop();
}
