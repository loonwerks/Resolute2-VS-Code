import * as vscode from 'vscode';
import type { GoalDescriptor } from './protocol.js';

export class GoalsTreeProvider implements vscode.TreeDataProvider<GoalDescriptor> {
  private goals: GoalDescriptor[] = [];
  private readonly changed = new vscode.EventEmitter<GoalDescriptor | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  // Replaces the goals shown for the active Resolute document.
  setGoals(goals: GoalDescriptor[]): void {
    this.goals = goals;
    this.changed.fire(undefined);
  }

  // Converts a goal descriptor into a source-navigable tree item.
  getTreeItem(goal: GoalDescriptor): vscode.TreeItem {
    const item = new vscode.TreeItem(goal.name, vscode.TreeItemCollapsibleState.None);
    item.description = goal.parameters.length === 0
      ? 'goal'
      : `goal(${goal.parameters.join(', ')})`;
    item.tooltip = `${goal.qualifiedName}(${goal.parameters.join(', ')})`;
    item.iconPath = new vscode.ThemeIcon('target');
    item.contextValue = goal.parameters.length === 0 ? 'resoluteExecutableGoal' : 'resoluteGoal';
    item.command = {
      command: 'resolute2.openGoal',
      title: 'Open Goal',
      arguments: [goal]
    };
    return item;
  }

  // Returns the flat goal list for the active document.
  getChildren(): GoalDescriptor[] {
    return this.goals;
  }
}
