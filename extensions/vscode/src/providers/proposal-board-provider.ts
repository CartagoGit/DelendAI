/**
 * proposal-board-provider.ts — f00097 S2 (evolves f00079 S4).
 *
 * The `mcp-vertex.proposals` sidebar `TreeDataProvider`. f00079 S4 shipped a
 * flat, single-tool version; S2 evolves THAT provider (rather than adding a
 * parallel one) into the read-only observability board the proposal asks for:
 *
 *  - four non-collapsible **header chips** (Locks / Stale / Queue / Health)
 *    derived from `compact_status` + `state_health` + `proposal_stale_list`;
 *  - **status-group roots** (Ready, In progress, …) built dynamically from
 *    whatever statuses the snapshot actually carries, in a canonical order;
 *  - **proposal leaves** under each group, each routing to
 *    `mcp-vertex.openProposal`;
 *  - a **recoverable banner** node when the board payload cannot be projected
 *    (with a Copy-error command), instead of a crash;
 *  - status + text **filters** that narrow the rendered tree WITHOUT
 *    refetching (served from the shared TTL cache), persisted through an
 *    optional filter store.
 *
 * All state comes from `ProposalsSnapshotSource` (the read-only data layer);
 * this class only shapes it into tree nodes. No `vscode` import — nodes are
 * plain objects and the change event is a listener set, matching
 * `ToolTreeDataProvider`.
 */
import type { McpStdioClient } from '@delendai/client';

import {
	type IProposalSummary,
	type IProposalsHeaderChips,
	type IProposalsSnapshot,
	ProposalsSnapshotSource,
} from '../lib/proposals-snapshot';
import { TreeItemCollapsibleState, type IToolTreeNode } from './tool-tree-node';

export interface IDisposable {
	dispose(): void;
}

export type IProposalTreeChangeListener = (
	element?: IProposalNode | null | undefined,
) => void;

export type ProposalNodeType = 'chip' | 'group' | 'proposal' | 'banner';

export interface IProposalNode extends IToolTreeNode {
	readonly nodeType: ProposalNodeType;
	/** The raw status a `group` node collects (normalised). */
	readonly groupStatus?: string;
	/** The projected proposal a `proposal` leaf carries. */
	readonly proposal?: IProposalSummary;
	readonly command?: {
		readonly command: string;
		readonly title: string;
		readonly arguments?: readonly unknown[];
	};
}

/** Persisted, host-agnostic filter state. Both fields optional / absent. */
export interface IProposalFilters {
	readonly status?: string;
	readonly text?: string;
}

/** Optional persistence for filters (globalState-backed in the extension). */
export interface IProposalFilterStore {
	read(): IProposalFilters;
	write(filters: IProposalFilters): void;
}

export interface IProposalBoardProviderOptions {
	readonly serverConfigured?: boolean;
	readonly snapshotSource?: ProposalsSnapshotSource;
	readonly filterStore?: IProposalFilterStore;
	readonly namespacePrefix?: string;
	readonly ttlMs?: number;
	readonly now?: () => number;
}

/** Canonical status → { rank, label }. Unknown statuses sort last, Title-cased. */
const STATUS_META = new Map<
	string,
	{ readonly rank: number; readonly label: string }
>([
	['pending', { rank: 0, label: 'Pending' }],
	['ready', { rank: 1, label: 'Ready' }],
	['in_progress', { rank: 2, label: 'In progress' }],
	['review', { rank: 3, label: 'Review' }],
	['paused', { rank: 4, label: 'Paused' }],
	['blocked', { rank: 5, label: 'Blocked' }],
	['done', { rank: 6, label: 'Done' }],
	['retired', { rank: 7, label: 'Retired' }],
]);

/** Normalise a raw status so `in-progress` and `in_progress` group together. */
const normaliseStatus = (status: string): string =>
	status.trim().toLowerCase().replace(/-/g, '_');

const labelForStatus = (status: string): string =>
	STATUS_META.get(status)?.label ??
	status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const rankForStatus = (status: string): number =>
	STATUS_META.get(status)?.rank ?? 99;

export class ProposalBoardProvider {
	private readonly source: ProposalsSnapshotSource;
	private readonly filterStore: IProposalFilterStore | undefined;
	private readonly listeners = new Set<IProposalTreeChangeListener>();
	private filters: IProposalFilters;
	private readonly serverConfigured: boolean;

	constructor(
		client: Pick<McpStdioClient, 'request'>,
		options: IProposalBoardProviderOptions = {},
	) {
		this.serverConfigured = options.serverConfigured ?? true;
		this.source =
			options.snapshotSource ??
			new ProposalsSnapshotSource({
				client,
				...(options.namespacePrefix === undefined
					? {}
					: { namespacePrefix: options.namespacePrefix }),
				...(options.ttlMs === undefined
					? {}
					: { ttlMs: options.ttlMs }),
				...(options.now === undefined ? {} : { now: options.now }),
			});
		this.filterStore = options.filterStore;
		this.filters = options.filterStore?.read() ?? {};
	}

	readonly onDidChangeTreeData = (
		listener: IProposalTreeChangeListener,
	): IDisposable => {
		this.listeners.add(listener);
		return { dispose: () => void this.listeners.delete(listener) };
	};

	getTreeItem(element: IProposalNode): IProposalNode {
		return element;
	}

	async getChildren(element?: IProposalNode): Promise<IProposalNode[]> {
		if (!this.serverConfigured) {
			return element === undefined
				? [
						{
							kind: 'tool',
							nodeType: 'banner',
							id: 'banner:not-configured',
							label: 'Configure MCP server to load proposals',
							collapsibleState: TreeItemCollapsibleState.None,
							contextValue: 'mcpVertexProposalBanner',
						},
					]
				: [];
		}
		const snapshot = await this.source.get();
		if (element === undefined) return this.rootNodes(snapshot);
		if (element.nodeType === 'group' && element.groupStatus !== undefined) {
			return this.leafNodes(snapshot, element.groupStatus);
		}
		return [];
	}

	/**
	 * Explicit / focus refresh: drop the cached snapshot and repaint. Wired to
	 * `mcp-vertex.proposals.refresh` and window-focus in S4.
	 */
	refresh(): void {
		this.source.invalidate();
		this.notify();
	}

	/** Read the current filters (for the command palette / tests). */
	getFilters(): IProposalFilters {
		return this.filters;
	}

	/**
	 * Update filters and repaint WITHOUT invalidating the snapshot, so a
	 * filter change never triggers a refetch (proposal S2 acceptance).
	 */
	setFilters(next: IProposalFilters): void {
		this.filters = { ...next };
		this.filterStore?.write(this.filters);
		this.notify();
	}

	private notify(): void {
		for (const listener of this.listeners) listener(undefined);
	}

	private rootNodes(snapshot: IProposalsSnapshot): IProposalNode[] {
		const nodes: IProposalNode[] = [...chipNodes(snapshot.chips)];
		if (snapshot.recoverable !== undefined) {
			nodes.push(bannerNode(snapshot.recoverable));
		}
		nodes.push(...this.groupNodes(snapshot.proposals));
		return nodes;
	}

	private groupNodes(
		proposals: readonly IProposalSummary[],
	): IProposalNode[] {
		const wantStatus =
			this.filters.status === undefined
				? undefined
				: normaliseStatus(this.filters.status);
		const counts = new Map<string, number>();
		for (const proposal of this.visible(proposals)) {
			const status = normaliseStatus(proposal.status);
			if (wantStatus !== undefined && status !== wantStatus) continue;
			counts.set(status, (counts.get(status) ?? 0) + 1);
		}
		return [...counts.entries()]
			.sort(
				([left], [right]) => rankForStatus(left) - rankForStatus(right),
			)
			.map(([status, count]) => groupNode(status, count));
	}

	private leafNodes(
		snapshot: IProposalsSnapshot,
		groupStatus: string,
	): IProposalNode[] {
		return this.visible(snapshot.proposals)
			.filter((p) => normaliseStatus(p.status) === groupStatus)
			.sort((left, right) => left.id.localeCompare(right.id))
			.map(proposalNode);
	}

	/** Apply the text filter (case-insensitive id substring). */
	private visible(
		proposals: readonly IProposalSummary[],
	): readonly IProposalSummary[] {
		const text = this.filters.text?.trim().toLowerCase();
		if (text === undefined || text.length === 0) return proposals;
		return proposals.filter((p) => p.id.toLowerCase().includes(text));
	}
}

const chipNodes = (chips: IProposalsHeaderChips): IProposalNode[] => [
	chipNode('locks', 'Locks', String(chips.locks)),
	chipNode('stale', 'Stale', String(chips.stale)),
	chipNode(
		'queue',
		'Queue',
		chips.queueBackpressure ? 'backpressure' : 'clear',
	),
	chipNode('health', 'Health', chips.health),
];

const chipNode = (id: string, label: string, value: string): IProposalNode => ({
	kind: 'tool',
	nodeType: 'chip',
	id: `chip:${id}`,
	label: `${label} (${value})`,
	tooltip: `${label}: ${value}`,
	collapsibleState: TreeItemCollapsibleState.None,
	contextValue: 'mcpVertexProposalChip',
});

const bannerNode = (recoverable: {
	readonly message: string;
	readonly raw: string;
}): IProposalNode => ({
	kind: 'tool',
	nodeType: 'banner',
	id: 'banner:recoverable',
	label: `⚠ ${recoverable.message}`,
	tooltip:
		'Board data could not be fully projected — click to copy the raw payload',
	collapsibleState: TreeItemCollapsibleState.None,
	contextValue: 'mcpVertexProposalBanner',
	command: {
		command: 'mcp-vertex.proposals.copyError',
		title: 'Copy error',
		arguments: [recoverable.raw],
	},
});

const groupNode = (status: string, count: number): IProposalNode => ({
	kind: 'plugin',
	nodeType: 'group',
	id: `group:${status}`,
	label: labelForStatus(status),
	description: String(count),
	collapsibleState: TreeItemCollapsibleState.Collapsed,
	contextValue: 'mcpVertexProposalGroup',
	groupStatus: status,
});

const proposalNode = (proposal: IProposalSummary): IProposalNode => ({
	kind: 'tool',
	nodeType: 'proposal',
	id: `proposal:${proposal.id}`,
	label: proposal.id,
	description: `${proposal.status} • ${proposal.slices.length} slices`,
	tooltip:
		proposal.claimableSliceIds.length > 0
			? `${proposal.claimableSliceIds.length} claimable slices`
			: proposal.status,
	collapsibleState: TreeItemCollapsibleState.None,
	contextValue: 'mcpVertexProposal',
	proposal,
	command: {
		command: 'mcp-vertex.openProposal',
		title: 'Open Proposal',
		arguments: [proposal.id],
	},
});
