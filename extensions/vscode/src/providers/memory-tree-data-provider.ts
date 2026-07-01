import type { MemoryService, IMemoryListEntry } from '@mcp-vertex/client';

import { TreeItemCollapsibleState } from './tool-tree-node';

export interface IMemoryTreeNode {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly tooltip?: string;
	readonly collapsibleState: TreeItemCollapsibleState;
	readonly contextValue:
		| 'mcpVertexMemoryRoot'
		| 'mcpVertexMemoryNote'
		| 'mcpVertexMemoryMore';
	readonly note?: IMemoryListEntry;
}

export type IMemoryTreeChangeListener = (
	element?: IMemoryTreeNode | null | undefined,
) => void;

export class MemoryTreeDataProvider {
	private readonly listeners = new Set<IMemoryTreeChangeListener>();
	private cache:
		| {
				readonly notes: readonly IMemoryListEntry[];
				readonly total: number;
				readonly limit: number;
		  }
		| undefined;

	constructor(private readonly memory: Pick<MemoryService, 'list'>) {}

	readonly onDidChangeTreeData = (
		listener: IMemoryTreeChangeListener,
	): { dispose(): void } => {
		this.listeners.add(listener);
		return {
			dispose: () => {
				this.listeners.delete(listener);
			},
		};
	};

	getTreeItem(element: IMemoryTreeNode): IMemoryTreeNode {
		return element;
	}

	async getChildren(element?: IMemoryTreeNode): Promise<IMemoryTreeNode[]> {
		if (element !== undefined) return [];
		const notes = await this.notes();
		if (notes.notes.length === 0) {
			return [
				{
					id: 'memory:empty',
					label: 'No memory notes',
					collapsibleState: TreeItemCollapsibleState.None,
					contextValue: 'mcpVertexMemoryRoot',
				},
			];
		}
		const nodes: IMemoryTreeNode[] = notes.notes.map((note) => ({
			id: `memory:${note.id}`,
			label: note.title,
			description: note.tags.join(', '),
			tooltip: note.id,
			collapsibleState: TreeItemCollapsibleState.None,
			contextValue: 'mcpVertexMemoryNote',
			note,
		}));
		if (notes.total > notes.notes.length) {
			nodes.push({
				id: 'memory:more',
				label: `${notes.total - notes.notes.length} more memory notes`,
				description: `showing first ${notes.limit}`,
				tooltip: 'Refresh or use memory search/recall for more notes.',
				collapsibleState: TreeItemCollapsibleState.None,
				contextValue: 'mcpVertexMemoryMore',
			});
		}
		return nodes;
	}

	refresh(): void {
		this.cache = undefined;
		for (const listener of this.listeners) listener(undefined);
	}

	private async notes(): Promise<{
		readonly notes: readonly IMemoryListEntry[];
		readonly total: number;
		readonly limit: number;
	}> {
		if (this.cache === undefined) {
			const limit = 100;
			const result = await this.memory.list({ limit });
			this.cache = {
				notes: result.notes,
				total: result.total,
				limit,
			};
		}
		return this.cache;
	}
}
