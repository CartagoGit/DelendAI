import type { IExternalTool } from '../contracts/interfaces/external-tool.interface';

/**
 * Shared descriptor for the GitHub CLI (`gh`) wrapped by every plugin
 * that talks to GitHub (forge, issues, error-reporting, issues-triage).
 * Centralising the descriptor here means a new GitHub-facing plugin adds
 * no duplicated `bin`/`installHints` block of its own — the external-tool
 * runner resolves this descriptor uniformly.
 */
export const GH_CLI_TOOL: IExternalTool = {
	id: 'gh',
	bin: 'gh',
	installHints: [
		{ manager: 'brew', command: 'brew install gh' },
		{ manager: 'apt', command: 'sudo apt install gh' },
		{ manager: 'winget', command: 'winget install GitHub.cli' },
	],
};
