import * as path from 'node:path';
import * as vscode from 'vscode';
import type { AssuranceNode } from './protocol.js';

export class AssuranceTreeProvider implements vscode.TreeDataProvider<AssuranceNode> {
  private root: AssuranceNode | undefined;
  private readonly changed = new vscode.EventEmitter<AssuranceNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly extensionPath: string) {}

  // Replaces the displayed assurance result and refreshes the native tree.
  setRoot(root: AssuranceNode): void {
    this.root = root;
    this.changed.fire(undefined);
  }

  // Converts a result node into an expandable item with a a checkmark, X, ?, or ! icon.
  getTreeItem(element: AssuranceNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `${element.identifier}: ${element.text}`,
      element.children.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
    item.tooltip = (element.status === 'invalid' || element.status === 'error') && element.location
      ? `${statusLabel(element.status)} - select to open ${element.location.uri}:${element.location.range.start.line + 1}`
      : statusLabel(element.status);
    item.iconPath = this.iconFor(element.status);
    item.contextValue = element.status === 'invalid' ? 'resoluteFailedCase' : element.status === 'error' ? 'resoluteErrorCase' : 'resoluteAssuranceCase';
    if ((element.status === 'invalid' || element.status === 'error') && element.location) {
      item.command = {
        command: 'resolute2.openAssuranceNode',
        title: 'Open Assurance Problem',
        arguments: [element]
      };
    }
    return item;
  }

  // Returns the root result or the subgoals called by one assurance case.
  getChildren(element?: AssuranceNode): AssuranceNode[] {
    return element ? element.children : this.root ? [this.root] : [];
  }

  // Selects the letter icon corresponding to an assurance status.
  private iconFor(status: AssuranceNode['status']): vscode.Uri | vscode.ThemeIcon {
    if (status === 'valid') {
      return vscode.Uri.file(path.join(this.extensionPath, 'resources', 'success.svg'));
    }
    if (status === 'invalid') {
      return vscode.Uri.file(path.join(this.extensionPath, 'resources', 'failure.svg'));
    }
    if (status === 'error') {
      return vscode.Uri.file(path.join(this.extensionPath, 'resources', 'error.svg'));
    }
    return vscode.Uri.file(path.join(this.extensionPath, 'resources', 'unknown.svg'));
  }
}

// Converts protocol status names into user-facing assurance terminology.
function statusLabel(status: AssuranceNode['status']): string {
  switch (status) {
    case 'valid': return 'Successful Case';
    case 'invalid': return 'Failed Case';
    case 'unknown': return 'Unknown Case';
    case 'error': return 'Evaluation Error';
  }
}
