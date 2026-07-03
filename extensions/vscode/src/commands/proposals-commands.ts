/**
 * proposals-commands.ts — f00097 S4.
 *
 * The two local, read-only commands the proposals board owns:
 *
 *  - `mcp-vertex.proposals.refresh` — invalidate the shared snapshot and
 *    repaint the sidebar tree (also the handler `mcp-vertex.refresh` delegates
 *    to, so a global refresh keeps the board fresh);
 *  - `mcp-vertex.proposals.copyError` — copy the raw `recoverable` payload the
 *    board banner carries to the clipboard (its `arguments: [raw]`), so a
 *    reviewer can file the schema-drift without retyping it.
 *
 * Neither mutates proposal state — they stay inside the read-only contract.
 */
import type { ICommandDeps } from './types';

export const PROPOSALS_REFRESH_COMMAND = 'mcp-vertex.proposals.refresh';
export const PROPOSALS_COPY_ERROR_COMMAND = 'mcp-vertex.proposals.copyError';

export const registerProposalsRefreshCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		PROPOSALS_REFRESH_COMMAND,
		async () => {
			deps.proposalsTree?.refresh();
			await deps.vscode.window.showInformationMessage?.(
				'mcp-vertex: proposals board refreshed',
			);
		},
	);

export const registerProposalsCopyErrorCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		PROPOSALS_COPY_ERROR_COMMAND,
		async (raw?: unknown) => {
			const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
			await deps.vscode.env?.clipboard.writeText(text ?? '');
			await deps.vscode.window.showInformationMessage?.(
				'mcp-vertex: proposal error copied to clipboard',
			);
		},
	);
