import type {
	AgentCatalogService,
	IToolDescriptor,
	OverviewService,
} from '@delendai/client';

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
		private readonly serverConfigured = true,
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
		if (!this.serverConfigured) {
			return element === undefined
				? [
						serverNode(
							'Configure mcp-vertex.server.command and server.args to connect',
						),
					]
				: [];
		}
		if (element === undefined) {
			try {
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
			} catch (error) {
				return [statusNode(error)];
			}
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
			let byPlugin: Map<
				string,
				{
					readonly tools: readonly IToolDescriptor[];
					readonly loaded: boolean;
				}
			>;
			try {
				byPlugin = await this.toolsByPlugin();
			} catch (error) {
				return [statusNode(error)];
			}
			return [...byPlugin.entries()]
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([plugin, bucket]) =>
					pluginNode(plugin, bucket.tools.length, {
						loaded: bucket.loaded,
					}),
				);
		}
		if (element.kind === 'plugin' && element.plugin !== undefined) {
			const bucket =
				(await this.toolsByPlugin()).get(element.plugin) ?? null;
			if (bucket === null) return [];
			// Sort lazy tools together but show eager tools first so the
			// user sees the active surface without expanding anything.
			const sorted = [...bucket.tools].sort((left, right) => {
				const ll = left.loaded ?? true;
				const rl = right.loaded ?? true;
				if (ll === rl) return left.name.localeCompare(right.name);
				return ll ? -1 : 1;
			});
			return sorted.map((tool) =>
				toolNode(tool, { loaded: tool.loaded ?? true }),
			);
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

	private async toolsByPlugin(): Promise<
		Map<
			string,
			{
				readonly tools: readonly IToolDescriptor[];
				readonly loaded: boolean;
			}
		>
	> {
		const tools = await this.tools();
		const byPlugin = new Map<
			string,
			{ tools: IToolDescriptor[]; loaded: boolean }
		>();
		for (const tool of tools) {
			const bucket =
				byPlugin.get(tool.plugin) ??
				({ tools: [], loaded: true } as {
					tools: IToolDescriptor[];
					loaded: boolean;
				});
			bucket.tools.push(tool);
			if (tool.loaded === false) bucket.loaded = false;
			byPlugin.set(tool.plugin, bucket);
		}
		return byPlugin;
	}

	private async tools(): Promise<readonly IToolDescriptor[]> {
		if (!this.serverConfigured) return [];
		this.toolsCache ??= await this.overview.listTools();
		return this.toolsCache;
	}

	private async skills(): Promise<
		Awaited<ReturnType<AgentCatalogService['getSkills']>>
	> {
		if (!this.serverConfigured || this.catalog === undefined) return [];
		this.skillsCache ??= await this.catalog.getSkills();
		return this.skillsCache;
	}

	private async proposals(): Promise<
		Awaited<ReturnType<AgentCatalogService['getProposals']>>
	> {
		if (!this.serverConfigured || this.catalog === undefined) return [];
		this.proposalsCache ??= await this.catalog.getProposals();
		return this.proposalsCache;
	}
}

const statusNode = (error: unknown): IToolTreeNode => ({
	kind: 'plugin',
	id: 'plugin:status',
	label: `MCP server unavailable: ${
		error instanceof Error ? error.message : String(error)
	}`,
	collapsibleState: TreeItemCollapsibleState.None,
	contextValue: 'mcpVertexStatus',
});

export type ITreeItemCollapsibleState = TreeItemCollapsibleState;
