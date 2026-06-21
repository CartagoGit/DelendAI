import type {
	McpStdioClient,
	NotificationsService,
	OverviewService,
} from '@mcp-vertex/client';

import { OPEN_DASHBOARD_COMMAND } from '../commands/open-dashboard';
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

/**
 * `McpVertexStatusBar` — VS Code status bar summary, upgraded in f00022
 * to include the same KPIs the dashboard exposes (tools, proposals,
 * tokens, agents). Click → open the dashboard.
 */
export class McpVertexStatusBar {
	constructor(
		private readonly item: IStatusBarItem,
		private readonly overview: Pick<OverviewService, 'listTools'>,
		private readonly client: Pick<McpStdioClient, 'request'>,
		private readonly notifications?: Pick<
			NotificationsService,
			'addEventListener'
		>,
		private readonly openDashboardCommand: string = OPEN_DASHBOARD_COMMAND,
		_showOverviewCommand: string = SHOW_OVERVIEW_COMMAND,
	) {}

	async start(): Promise<void> {
		this.item.command = this.openDashboardCommand;
		this.item.tooltip = 'mcp-vertex Dashboard (click to open)';
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
		const tokenSummary = await this.tokensSummary();
		const agentCount = await this.agentCount();
		const segments: string[] = ['$(mcp-vertex) mcp-vertex'];
		segments.push(`${tools.length} tools`);
		segments.push(`${proposalCount} proposals`);
		if (tokenSummary !== undefined) segments.push(tokenSummary);
		if (agentCount !== undefined) segments.push(`${agentCount} agents`);
		this.item.text = segments.join(' • ');
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

	private async tokensSummary(): Promise<string | undefined> {
		try {
			const snap = await this.client.request<
				Record<string, never>,
				{
					readonly totals: { readonly totalBytes: number };
				}
			>('mcp-vertex_metrics', {});
			const tokens = Math.ceil(snap.totals.totalBytes * 0.25);
			if (tokens < 1000) return `${tokens} tok`;
			return `${(tokens / 1000).toFixed(1)}k tok`;
		} catch {
			return undefined;
		}
	}

	private async agentCount(): Promise<number | undefined> {
		try {
			const result = await this.client.request<
				Record<string, never>,
				{ readonly agents: readonly { readonly name: string }[] }
			>('proposals_agent_names', {});
			return result.agents.length;
		} catch {
			return undefined;
		}
	}
}
