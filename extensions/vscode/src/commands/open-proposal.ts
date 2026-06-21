import type { ICommandDeps } from './types';
import { renderJsonHtml } from './types';

export const OPEN_PROPOSAL_COMMAND = 'mcp-vertex.openProposal';

interface IProposalBoardOutput {
	readonly proposals: ReadonlyArray<{
		readonly id: string;
		readonly status: string;
		readonly slices: ReadonlyArray<{
			readonly sliceId: string;
			readonly status: string;
			readonly owner: string | null;
		}>;
		readonly claimableSliceIds?: readonly string[];
	}>;
}

export const registerOpenProposalCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(OPEN_PROPOSAL_COMMAND, async () => {
		const board = await deps.client.request<
			Record<string, never>,
			IProposalBoardOutput
		>('proposals_proposal_board', {});
		const panel = deps.vscode.window.createWebviewPanel(
			'mcpVertexProposals',
			'mcp-vertex Proposals',
			deps.vscode.ViewColumn.One,
			{ enableScripts: false },
		);
		panel.webview.html = renderJsonHtml('mcp-vertex Proposals', board);
	});
