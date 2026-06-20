import type {
	McpStdioClient,
	NotificationsService,
	OverviewService,
} from '@mcp-vertex/client';

import { SHOW_OVERVIEW_COMMAND } from '../extension';

export interface IStatusBarItem {
	text: string;
	tooltip?: string;
	command?: string;
	show(): void;
	dispose(): void;
}

export interface IProposalBoardSummary {
	readonly proposals: readonly { readonly id: string }[];
}

export class McpVertexStatusBar {
	constructor(
		private readonly item: IStatusBarItem,
		private readonly overview: Pick<OverviewService, 'listTools'>,
		private readonly client: Pick<McpStdioClient, 'request'>,
		private readonly notifications?: Pick<
			NotificationsService,
			'addEventListener'
		>,
	) {}

	async start(): Promise<void> {
		this.item.command = SHOW_OVERVIEW_COMMAND;
		this.item.tooltip = 'mcp-vertex status';
		this.notifications?.addEventListener('lock-released', () => {
			void this.update();
		});
		this.notifications?.addEventListener('cap', () => {
			void this.update();
		});
		this.notifications?.addEventListener('bloqueado', () => {
			void this.update();
		});
		await this.update();
		this.item.show();
	}

	async update(): Promise<void> {
		const tools = await this.overview.listTools();
		const proposalCount = await this.proposalCount();
		this.item.text = `$(tools) mcp-vertex • ${tools.length} tools • ${proposalCount} proposals`;
	}

	dispose(): void {
		this.item.dispose();
	}

	private async proposalCount(): Promise<number | string> {
		try {
			const board = await this.client.request<
				Record<string, never>,
				IProposalBoardSummary
			>('proposals_proposal_board', {});
			return board.proposals.length;
		} catch {
			return '?';
		}
	}
}
