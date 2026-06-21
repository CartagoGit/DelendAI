import type { IToolDescriptor, OverviewService } from '@mcp-vertex/client';

import {
	pluginNode,
	serverNode,
	toolNode,
	type IToolTreeNode,
	type TreeItemCollapsibleState,
} from './tool-tree-node';

export interface IDisposable {
	dispose(): void;
}

export type ITreeChangeListener = (
	element?: IToolTreeNode | null | undefined,
) => void;

export interface IFileSystemWatcher {
	onDidChange(listener: () => void): IDisposable;
	onDidCreate(listener: () => void): IDisposable;
	onDidDelete(listener: () => void): IDisposable;
}

export class ToolTreeDataProvider {
	private readonly listeners = new Set<ITreeChangeListener>();
	private toolsCache: readonly IToolDescriptor[] | undefined;

	constructor(
		private readonly overview: Pick<OverviewService, 'listTools'>,
	) {}

	readonly onDidChangeTreeData = (
		listener: ITreeChangeListener,
	): IDisposable => {
		this.listeners.add(listener);
		return {
			dispose: () => {
				this.listeners.delete(listener);
			},
		};
	};

	getTreeItem(element: IToolTreeNode): IToolTreeNode {
		return element;
	}

	async getChildren(element?: IToolTreeNode): Promise<IToolTreeNode[]> {
		if (element === undefined) {
			return [serverNode()];
		}
		if (element.kind === 'server') {
			const byPlugin = await this.toolsByPlugin();
			return [...byPlugin.entries()]
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([plugin, tools]) => pluginNode(plugin, tools.length));
		}
		if (element.kind === 'plugin' && element.plugin !== undefined) {
			const tools =
				(await this.toolsByPlugin()).get(element.plugin) ?? [];
			return [...tools]
				.sort((left, right) => left.name.localeCompare(right.name))
				.map((tool) => toolNode(tool));
		}
		return [];
	}

	refresh(): void {
		this.toolsCache = undefined;
		for (const listener of this.listeners) {
			listener(undefined);
		}
	}

	bindConfigWatcher(watcher: IFileSystemWatcher): IDisposable {
		const disposables = [
			watcher.onDidChange(() => this.refresh()),
			watcher.onDidCreate(() => this.refresh()),
			watcher.onDidDelete(() => this.refresh()),
		];
		return {
			dispose: () => {
				for (const disposable of disposables) {
					disposable.dispose();
				}
			},
		};
	}

	private async toolsByPlugin(): Promise<Map<string, IToolDescriptor[]>> {
		const tools = await this.tools();
		const byPlugin = new Map<string, IToolDescriptor[]>();
		for (const tool of tools) {
			const bucket = byPlugin.get(tool.plugin) ?? [];
			bucket.push(tool);
			byPlugin.set(tool.plugin, bucket);
		}
		return byPlugin;
	}

	private async tools(): Promise<readonly IToolDescriptor[]> {
		this.toolsCache ??= await this.overview.listTools();
		return this.toolsCache;
	}
}

export type ITreeItemCollapsibleState = TreeItemCollapsibleState;
