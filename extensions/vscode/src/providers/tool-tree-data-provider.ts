import type {
	AgentCatalogService,
	IToolDescriptor,
	OverviewService,
} from '@mcp-vertex/client';

import {
	pluginNode,
	serverNode,
	toolNode,
	type IToolTreeNode,
	TreeItemCollapsibleState,
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
	private skillsCache:
		| Awaited<ReturnType<AgentCatalogService['getSkills']>>
		| undefined;
	private proposalsCache:
		| Awaited<ReturnType<AgentCatalogService['getProposals']>>
		| undefined;

	constructor(
		private readonly overview: Pick<OverviewService, 'listTools'>,
		private readonly catalog?: Pick<
			AgentCatalogService,
			'getSkills' | 'getProposals'
		>,
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
			const nodes: IToolTreeNode[] = [];
			const skills = await this.skills();
			if (skills.length > 0) {
				nodes.push({
					kind: 'plugin',
					id: 'plugin:__skills__',
					label: 'Skills',
					description: `${skills.length} skills`,
					collapsibleState: TreeItemCollapsibleState.Collapsed,
					contextValue: 'mcpVertexSkillGroup',
					plugin: '__skills__',
				});
			}
			const proposals = await this.proposals();
			if (proposals.length > 0) {
				nodes.push({
					kind: 'plugin',
					id: 'plugin:__actionable_proposals__',
					label: 'Actionable proposals',
					description: `${proposals.length} proposals`,
					collapsibleState: TreeItemCollapsibleState.Collapsed,
					contextValue: 'mcpVertexProposalGroup',
					plugin: '__actionable_proposals__',
				});
			}
			nodes.push(serverNode());
			return nodes;
		}
		if (element.id === 'plugin:__skills__') {
			return (await this.skills()).map((skill) => ({
				kind: 'tool',
				id: `skill:${skill.id}`,
				label: skill.id,
				description: skill.summary,
				tooltip: skill.summary,
				collapsibleState: TreeItemCollapsibleState.None,
				contextValue: 'mcpVertexSkill',
				plugin: '__skills__',
			}));
		}
		if (element.id === 'plugin:__actionable_proposals__') {
			return (await this.proposals()).map((proposal) => ({
				kind: 'tool',
				id: `proposal:${proposal.id}`,
				label: proposal.id,
				description: `${proposal.status} · ${proposal.title}`,
				tooltip: proposal.title,
				collapsibleState: TreeItemCollapsibleState.None,
				contextValue: 'mcpVertexProposal',
				plugin: '__actionable_proposals__',
			}));
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
		this.skillsCache = undefined;
		this.proposalsCache = undefined;
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

	private async skills(): Promise<
		Awaited<ReturnType<AgentCatalogService['getSkills']>>
	> {
		if (this.catalog === undefined) return [];
		this.skillsCache ??= await this.catalog.getSkills();
		return this.skillsCache;
	}

	private async proposals(): Promise<
		Awaited<ReturnType<AgentCatalogService['getProposals']>>
	> {
		if (this.catalog === undefined) return [];
		this.proposalsCache ??= await this.catalog.getProposals();
		return this.proposalsCache;
	}
}

export type ITreeItemCollapsibleState = TreeItemCollapsibleState;
