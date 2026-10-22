/**
 * agent-hosts.constant.ts — the one list of hosts delendai writes agents and
 * instructions for, and recognises agents running in. Adding a host is an
 * entry here: every writer reads it, and every list that names hosts by
 * their markers, programs or chat directories is derived from it
 * (`agent-slots-in-sync.script.ts` refuses a list kept beside it).
 */
import type { IAgentHost } from '../interfaces/agent-host.interface';

export const AGENT_HOSTS: readonly IAgentHost[] = [
	{
		id: 'copilot',
		label: 'GitHub Copilot (VS Code)',
		skills: { dir: '.github/skills' },
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
		identity: {
			name: 'vscode-copilot',
			slug: 'copilot',
			applications: [
				'copilot',
				'github-copilot',
				'vscode',
				'visual-studio-code',
				'code',
			],
			chatProducts: ['Code', 'Code - Insiders', 'VSCodium'],
		},
	},
	{
		id: 'claude',
		label: 'Claude Code',
		skills: { dir: '.claude/skills' },
		agents: { dir: '.claude/agents', suffix: '.md', format: 'claude' },
		instructions: 'CLAUDE.md',
		evidence: {
			paths: ['.claude', 'CLAUDE.md', '.mcp.json'],
			env: ['CLAUDECODE'],
		},
		identity: {
			name: 'claude-code',
			applications: ['claude-code'],
			// In every shell it spawns.
			markers: ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'],
		},
	},
	{
		id: 'codex',
		label: 'Codex CLI',
		skills: { dir: '.agents/skills' },
		agents: { dir: '.codex/agents', suffix: '.md', format: 'codex' },
		instructions: 'AGENTS.md',
		evidence: { paths: ['.codex'], env: ['CODEX_HOME'] },
		identity: {
			name: 'codex-cli',
			applications: ['codex', 'codex-cli', 'codex-mcp-client'],
			markerPrefixes: ['CODEX_'],
		},
	},
	{
		id: 'opencode',
		label: 'OpenCode',
		skills: { dir: '.opencode/skills' },
		agents: { dir: '.opencode/agent', suffix: '.md', format: 'opencode' },
		instructions: 'AGENTS.md',
		evidence: { paths: ['.opencode', 'opencode.json', 'opencode.jsonc'] },
		identity: { applications: ['opencode'], markers: ['OPENCODE'] },
	},
	{
		id: 'cursor',
		label: 'Cursor',
		instructions: '.cursor/rules/delendai.mdc',
		evidence: { paths: ['.cursor', '.cursorrules'] },
		identity: {
			name: 'cursor',
			applications: ['cursor'],
			markerPrefixes: ['CURSOR_'],
			chatProducts: ['Cursor'],
		},
	},
	{
		id: 'windsurf',
		label: 'Windsurf',
		instructions: '.windsurfrules',
		evidence: { paths: ['.windsurfrules', '.windsurf'] },
		identity: { applications: ['windsurf'], chatProducts: ['Windsurf'] },
	},
	{
		id: 'gemini',
		label: 'Gemini CLI',
		instructions: 'GEMINI.md',
		evidence: { paths: ['.gemini', 'GEMINI.md'] },
		identity: { applications: ['gemini-cli'], markers: ['GEMINI_CLI'] },
	},
	{
		id: 'continue',
		label: 'Continue',
		instructions: '.continue/rules/delendai.md',
		evidence: { paths: ['.continue'] },
		identity: { name: 'continue', applications: ['continue'] },
	},
	{
		id: 'agents-md',
		label: 'Terminal agents that read AGENTS.md',
		instructions: 'AGENTS.md',
		evidence: { paths: ['AGENTS.md'] },
	},
	// Hosts delendai writes nothing for, recognised when an agent runs in them.
	{
		id: 'aider',
		label: 'Aider',
		evidence: { paths: [] },
		identity: { name: 'aider', applications: ['aider'] },
	},
	{
		id: 'cline',
		label: 'Cline',
		evidence: { paths: [] },
		identity: { applications: ['cline'] },
	},
	{
		id: 'roo',
		label: 'Roo Code',
		evidence: { paths: [] },
		identity: { applications: ['roo', 'roo-code'] },
	},
	{
		id: 'kilo',
		label: 'Kilo Code',
		evidence: { paths: [] },
		identity: { applications: ['kilo', 'kilo-code'] },
	},
	{
		id: 'zed',
		label: 'Zed',
		evidence: { paths: [] },
		identity: { applications: ['zed'] },
	},
	{
		id: 'mcp-inspector',
		label: 'MCP Inspector',
		evidence: { paths: [] },
		identity: { applications: ['mcp-inspector'] },
	},
];

const identities = AGENT_HOSTS.flatMap((host) =>
	host.identity === undefined ? [] : [host.identity],
);

/** The programs, never models, an MCP client or process may report itself as. */
export const AGENT_HOST_APPLICATIONS: readonly string[] = identities.flatMap(
	(identity) => identity.applications ?? [],
);

/** Variables that name an agent host exactly. */
export const AGENT_HOST_VARIABLES: readonly string[] = identities.flatMap(
	(identity) => identity.markers ?? [],
);

/** Prefixes whose variables only an agent host sets. */
export const AGENT_HOST_VARIABLE_PREFIXES: readonly string[] =
	identities.flatMap((identity) => identity.markerPrefixes ?? []);

/** The user directory names hosts keep their chat state under. */
export const AGENT_HOST_CHAT_PRODUCTS: readonly string[] = identities.flatMap(
	(identity) => identity.chatProducts ?? [],
);

/** A composite identity's host name → its part of a branch name. */
export const AGENT_HOST_SLUGS: Readonly<Record<string, string>> =
	Object.fromEntries(
		identities.flatMap((identity) =>
			identity.name === undefined
				? []
				: [[identity.name, identity.slug ?? identity.name]],
		),
	);

/** The variable naming the hosts for one run, comma-separated, over the configuration. */
export const HOSTS_VARIABLE = 'DELENDAI_HOSTS';
