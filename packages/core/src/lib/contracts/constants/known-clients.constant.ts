/**
 * known-clients.constant.ts — the vendor clients delendai knows, once.
 *
 * `auto-agent-selector` and `orchestrator-runner` each kept their own list
 * (and the runner a third for install hints and a fourth for profile
 * variables): they disagreed on which clients exist and on how Copilot is
 * installed, and neither knew OpenCode. Every consumer reads this one.
 * Adding a client is one entry here.
 */
import type { IKnownClient } from '../interfaces/known-client.interface';

const PIPED_TO_SHELL =
	'This installer pipes a remote script straight into a shell. Review the URL and script before running; a compromised host or MITM can execute arbitrary code.';

const npmGlobal = (pkg: string, label: string) => ({
	tool: 'npm',
	args: ['install', '-g', pkg],
	dangerous: false,
	caveat: `Installs ${label} globally via npm.`,
});

export const KNOWN_CLIENTS: readonly IKnownClient[] = [
	{
		command: 'claude',
		id: 'claude-cli',
		label: 'Claude Code (CLI)',
		vendor: 'anthropic',
		costTier: 4,
		install: npmGlobal('@anthropic-ai/claude-code', 'the Claude Code CLI'),
		loginStatusArgs: ['auth', 'status'],
		profileVariable: 'CLAUDE_CONFIG_DIR',
		loginDiscardingFlags: ['--bare'],
	},
	{
		command: 'codex',
		id: 'codex-cli',
		label: 'Codex (CLI)',
		vendor: 'openai',
		costTier: 4,
		install: npmGlobal('@openai/codex', 'the Codex CLI'),
		loginStatusArgs: ['login', 'status'],
		profileVariable: 'CODEX_HOME',
	},
	{
		command: 'copilot',
		id: 'copilot-cli',
		label: 'GitHub Copilot (CLI)',
		vendor: 'github',
		costTier: 3,
		install: npmGlobal('@github/copilot', 'the GitHub Copilot CLI'),
		loginStatusArgs: ['auth', 'status'],
	},
	{
		command: 'opencode',
		id: 'opencode-cli',
		label: 'OpenCode (CLI)',
		vendor: 'multi',
		costTier: 2,
		install: npmGlobal('opencode-ai', 'the OpenCode CLI'),
		loginStatusArgs: ['auth', 'list'],
		modelListArgs: ['models'],
	},
	{
		command: 'gemini',
		id: 'gemini-cli',
		label: 'Gemini (CLI)',
		vendor: 'google',
		costTier: 2,
		install: npmGlobal('@google/gemini-cli', 'the Gemini CLI'),
	},
	{
		command: 'aider',
		id: 'aider-cli',
		label: 'Aider (CLI)',
		vendor: 'multi',
		costTier: 2,
		install: {
			tool: 'python',
			args: ['-m', 'pip', 'install', 'aider-chat'],
			dangerous: false,
			caveat: 'Installs aider via pip; a virtualenv is recommended.',
		},
		loginStatusArgs: ['--version'],
	},
	{
		command: 'cn',
		id: 'continue-cli',
		label: 'Continue (CLI)',
		vendor: 'continue',
		costTier: 2,
		install: {
			tool: 'curl',
			args: ['-fsSL', 'https://continue.dev/install.sh'],
			pipeTo: 'sh',
			dangerous: true,
			caveat: PIPED_TO_SHELL,
		},
		loginStatusArgs: ['auth', 'status'],
	},
	{
		command: 'agent',
		id: 'cursor-agent-cli',
		label: 'Cursor Agent (CLI)',
		vendor: 'cursor',
		costTier: 3,
		install: {
			tool: 'curl',
			args: ['-fsSL', 'https://sst.dev/install'],
			pipeTo: 'sh',
			dangerous: true,
			caveat: PIPED_TO_SHELL,
		},
		loginStatusArgs: ['status'],
	},
];
