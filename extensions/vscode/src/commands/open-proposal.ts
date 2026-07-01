import type { ICommandDeps } from './types';
import { renderJsonHtml, showCommandError } from './types';

export const OPEN_PROPOSAL_COMMAND = 'mcp-vertex.openProposal';

/**
 * f00079 S5 (closes a00040 H6): proposal id format. The canonical repo
 * id is a single lowercase letter (the track prefix, e.g. `f`/`a`/`r`)
 * followed by five digits — the same shape the proposals linter
 * enforces (`tools/scripts/lint/proposals.script.ts`). The proposal
 * text spelled this `^\d{5}$`, but that predates the prefix scheme and
 * does not match the ids the board actually emits (`f00079`), so we
 * align with the linter instead.
 */
export const PROPOSAL_ID_REGEX = /^[a-z]\d{5}$/;

interface IProposalBoardEntry {
	readonly id: string;
	readonly status: string;
	readonly slices: ReadonlyArray<{
		readonly sliceId: string;
		readonly status: string;
		readonly owner: string | null;
	}>;
	readonly claimableSliceIds?: readonly string[];
}

interface IProposalBoardOutput {
	readonly proposals: readonly IProposalBoardEntry[];
}

/**
 * Validate the optional `proposalId` argument the command receives.
 * Returns the validated id, or a typed reason when it is missing /
 * malformed. `undefined` id is NOT an error — it is the legacy
 * "open the whole board" entry point (e.g. the command palette).
 */
export type ProposalIdCheck =
	| { readonly kind: 'absent' }
	| { readonly kind: 'valid'; readonly proposalId: string }
	| { readonly kind: 'malformed'; readonly proposalId: string };

export const checkProposalId = (raw: unknown): ProposalIdCheck => {
	if (raw === undefined || raw === null || raw === '') {
		return { kind: 'absent' };
	}
	if (typeof raw !== 'string' || !PROPOSAL_ID_REGEX.test(raw)) {
		return { kind: 'malformed', proposalId: String(raw) };
	}
	return { kind: 'valid', proposalId: raw };
};

export const registerOpenProposalCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		OPEN_PROPOSAL_COMMAND,
		// f00079 S5 (a00040 H6): the board's TreeDataProvider nodes invoke
		// this command with `arguments: [proposal.id]`. The previous
		// handler took no argument and always rendered the global board,
		// ignoring which proposal the user clicked. We now read and
		// validate the id, and scope the rendered view to it.
		async (rawProposalId?: unknown) => {
			const check = checkProposalId(rawProposalId);
			if (check.kind === 'malformed') {
				await deps.vscode.window.showErrorMessage?.(
					`mcp-vertex: malformed proposal id "${check.proposalId}".`,
				);
				return;
			}
			try {
				const board = await deps.client.request<
					Record<string, never>,
					IProposalBoardOutput
				>('mcp-vertex_proposals_proposal_board', {});

				if (check.kind === 'valid') {
					const match = board.proposals.find(
						(p) => p.id === check.proposalId,
					);
					if (match === undefined) {
						await deps.vscode.window.showErrorMessage?.(
							`mcp-vertex: proposal "${check.proposalId}" not found.`,
						);
						return;
					}
					const panel = deps.vscode.window.createWebviewPanel(
						'mcpVertexProposals',
						`mcp-vertex Proposal ${check.proposalId}`,
						deps.vscode.ViewColumn.One,
						{ enableScripts: false },
					);
					panel.webview.html = renderJsonHtml(
						`mcp-vertex Proposal ${check.proposalId}`,
						match,
					);
					return;
				}

				const panel = deps.vscode.window.createWebviewPanel(
					'mcpVertexProposals',
					'mcp-vertex Proposals',
					deps.vscode.ViewColumn.One,
					{ enableScripts: false },
				);
				panel.webview.html = renderJsonHtml(
					'mcp-vertex Proposals',
					board,
				);
			} catch (err) {
				await showCommandError(deps.vscode, 'open proposals', err);
			}
		},
	);
