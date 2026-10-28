/**
 * subscription-hosts.constant.ts — how a subscription's own host is run,
 * and how it is recognised as the host this server is already in.
 *
 * A subscription belongs to a host (Claude Code, Codex, Cursor, Copilot):
 * a task routed to it runs there. Only when that host is the one this
 * server answers is it handled in context; otherwise its CLI is started.
 * A host with no CLI (Copilot in an editor) cannot be started from here.
 */
import type { ISubscriptionHost } from '../interfaces/subscription-host.interface';

export const SUBSCRIPTION_HOSTS: Readonly<Record<string, ISubscriptionHost>> = {
	'claude-code': {
		cli: {
			command: 'claude',
			args: ['-p', '--output-format=stream-json', '--verbose'],
		},
		current: /claude/iu,
	},
	codex: { cli: { command: 'codex', args: ['exec'] }, current: /codex/iu },
	cursor: {
		cli: { command: 'cursor-agent', args: ['-p'] },
		current: /cursor/iu,
	},
	'vscode-copilot': { current: /copilot|visual studio code|vscode/iu },
};
