/**
 * install-hints.ts — how to install a missing provider CLI.
 *
 * CRITICAL I4: any hint whose install pipes a remote script into a shell
 * (`curl … | sh`) sets `pipeTo: 'sh'` and is flagged `dangerous: true`,
 * with a `caveat` warning, so a host never silently runs a piped-to-shell
 * installer. Hints without a `pipeTo` are ordinary package-manager
 * installs and are not dangerous.
 *
 * The table is keyed by the CLI command a provider invokes. Unknown
 * commands fall back to a generic, non-dangerous "install <command>" hint.
 */
import type { IInstallHint } from '../types';

const DANGEROUS_CAVEAT =
	'This installer pipes a remote script straight into a shell. Review the URL and script before running; a compromised host or MITM can execute arbitrary code.';

const KNOWN: Readonly<Record<string, IInstallHint>> = {
	claude: {
		tool: 'npm',
		args: ['install', '-g', '@anthropic-ai/claude-code'],
		dangerous: false,
		caveat: 'Installs the Claude Code CLI globally via npm.',
	},
	codex: {
		tool: 'npm',
		args: ['install', '-g', '@openai/codex'],
		dangerous: false,
		caveat: 'Installs the Codex CLI globally via npm.',
	},
	copilot: {
		tool: 'gh',
		args: ['extension', 'install', 'github/gh-copilot'],
		dangerous: false,
		caveat: 'Installs the GitHub Copilot CLI as a gh extension.',
	},
	aider: {
		tool: 'python',
		args: ['-m', 'pip', 'install', 'aider-chat'],
		dangerous: false,
		caveat: 'Installs aider via pip; a virtualenv is recommended.',
	},
	cn: {
		tool: 'curl',
		args: ['-fsSL', 'https://continue.dev/install.sh'],
		pipeTo: 'sh',
		dangerous: true,
		caveat: DANGEROUS_CAVEAT,
	},
	agent: {
		tool: 'curl',
		args: ['-fsSL', 'https://sst.dev/install'],
		pipeTo: 'sh',
		dangerous: true,
		caveat: DANGEROUS_CAVEAT,
	},
};

/** Install guidance for a CLI command, always non-`undefined`. */
export const installHintFor = (command: string): IInstallHint => {
	const known = KNOWN[command];
	if (known !== undefined) return known;
	return {
		tool: command,
		args: [],
		dangerous: false,
		caveat: `No known installer for "${command}". Install it from its official source and ensure it is on PATH.`,
	};
};
