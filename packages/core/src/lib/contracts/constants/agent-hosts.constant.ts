/**
 * agent-hosts.constant.ts — the one list of hosts delendai writes agents and
 * instructions for. Adding a host is an entry here; every writer reads it.
 */
import type { IAgentHost } from '../interfaces/agent-host.interface';

export const AGENT_HOSTS: readonly IAgentHost[] = [
	{
		id: 'copilot',
		label: 'GitHub Copilot (VS Code)',
		agents: {
			dir: '.github/agents',
			suffix: '.agent.md',
			format: 'copilot',
		},
		instructions: '.github/copilot-instructions.md',
		evidence: {
			paths: [
				'.github/agents',
				'.github/copilot-instructions.md',
				'.vscode',
			],
		},
	},
	{
		id: 'claude',
		label: 'Claude Code',
		agents: { dir: '.claude/agents', suffix: '.md', format: 'claude' },
		instructions: 'CLAUDE.md',
		evidence: {
			paths: ['.claude', 'CLAUDE.md', '.mcp.json'],
			env: ['CLAUDECODE'],
		},
	},
	{
		id: 'codex',
		label: 'Codex CLI',
		agents: { dir: '.codex/agents', suffix: '.md', format: 'codex' },
		instructions: 'AGENTS.md',
		evidence: { paths: ['.codex'], env: ['CODEX_HOME'] },
	},
	{
		id: 'opencode',
		label: 'OpenCode',
		agents: { dir: '.opencode/agent', suffix: '.md', format: 'opencode' },
		instructions: 'AGENTS.md',
		evidence: { paths: ['.opencode', 'opencode.json', 'opencode.jsonc'] },
	},
	{
		id: 'cursor',
		label: 'Cursor',
		instructions: '.cursor/rules/delendai.mdc',
		evidence: { paths: ['.cursor', '.cursorrules'] },
	},
	{
		id: 'windsurf',
		label: 'Windsurf',
		instructions: '.windsurfrules',
		evidence: { paths: ['.windsurfrules', '.windsurf'] },
	},
	{
		id: 'gemini',
		label: 'Gemini CLI',
		instructions: 'GEMINI.md',
		evidence: { paths: ['.gemini', 'GEMINI.md'] },
	},
	{
		id: 'continue',
		label: 'Continue',
		instructions: '.continue/rules/delendai.md',
		evidence: { paths: ['.continue'] },
	},
	{
		id: 'agents-md',
		label: 'Terminal agents that read AGENTS.md',
		instructions: 'AGENTS.md',
		evidence: { paths: ['AGENTS.md'] },
	},
];

/** The variable naming the hosts for one run, comma-separated, over the configuration. */
export const HOSTS_VARIABLE = 'DELENDAI_HOSTS';
