import type { McpStdioClient } from '@mcp-vertex/client';

import { TreeItemCollapsibleState, type IToolTreeNode } from './tool-tree-node';

export interface IProposalBoardEntry {
	readonly id: string;
	readonly status: string;
	readonly slices: ReadonlyArray<{
		readonly sliceId: string;
		readonly status: string;
		readonly owner: string | null;
	}>;
	readonly claimableSliceIds?: readonly string[];
}

export interface IProposalBoardOutput {
	readonly proposals: readonly IProposalBoardEntry[];
}

export interface IProposalNode extends IToolTreeNode {
	readonly proposal?: IProposalBoardEntry;
	readonly command?: {
		readonly command: string;
		readonly title: string;
		readonly arguments?: readonly unknown[];
	};
}

const STATUS_ORDER = new Map([
	['in-progress', 0],
	['in_progress', 0],
	['ready', 1],
	['blocked', 2],
	['paused', 3],
	['done', 4],
]);

export class ProposalBoardProvider {
	private cache: readonly IProposalBoardEntry[] | undefined;

	constructor(private readonly client: Pick<McpStdioClient, 'request'>) {}

	getTreeItem(element: IProposalNode): IProposalNode {
		return element;
	}

	async getChildren(element?: IProposalNode): Promise<IProposalNode[]> {
		if (element !== undefined) return [];
		const proposals = await this.proposals();
		return [...proposals].sort(compareProposals).map((proposal) => ({
			kind: 'tool',
			id: `proposal:${proposal.id}`,
			label: proposal.id,
			description: `${proposal.status} • ${proposal.slices.length} slices`,
			tooltip: proposal.claimableSliceIds?.length
				? `${proposal.claimableSliceIds.length} claimable slices`
				: proposal.status,
			collapsibleState: TreeItemCollapsibleState.None,
			contextValue: 'mcpVertexProposal',
			proposal,
			command: {
				command: 'mcp-vertex.openProposal',
				title: 'Open Proposal Board',
				arguments: [proposal.id],
			},
		}));
	}

	refresh(): void {
		this.cache = undefined;
	}

	private async proposals(): Promise<readonly IProposalBoardEntry[]> {
		this.cache ??= (
			await this.client.request<
				Record<string, never>,
				IProposalBoardOutput
			>('mcp-vertex_proposals_proposal_board', {})
		).proposals;
		return this.cache;
	}
}

const compareProposals = (
	left: IProposalBoardEntry,
	right: IProposalBoardEntry,
): number =>
	(STATUS_ORDER.get(left.status) ?? 99) -
		(STATUS_ORDER.get(right.status) ?? 99) ||
	left.id.localeCompare(right.id);
