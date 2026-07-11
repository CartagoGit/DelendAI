/**
 * external-mcps-ack.spec.ts — f00068 S5.
 *
 * Pins the IDE ack surface over `external_mcp_ack`: the command lists
 * pending activations, records an accept/reject through the tool, the
 * non-modal notification only fires when something is pending and its
 * `Review` action opens the flow, the plugin-absent path degrades to a
 * toast (never an error), and the 12-language string table is complete.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import {
	EXTERNAL_MCPS_ACK_COMMAND,
	registerExternalMcpsAckCommand,
	surfaceExternalMcpsPendingAcks,
	type IExternalMcpsAckVscodeApi,
} from '../commands/external-mcps-ack';
import { assertExternalMcpsStringsComplete } from '../i18n/external-mcps.strings';

const PENDING_PAYLOAD = {
	ok: true,
	mode: 'list',
	total: 2,
	pending: [
		{ serverId: 'filesystem', requestedAt: '2026-07-11T10:00:00.000Z' },
		{
			serverId: 'github',
			requestedAt: '2026-07-11T10:01:00.000Z',
			reason: 'need repo access',
		},
	],
};

/** Fake transport routing by tool name; `absent` simulates the unloaded plugin. */
const createClient = (opts: {
	readonly absent?: boolean;
	readonly empty?: boolean;
	readonly calls?: Array<{ name: string; args: unknown }>;
}) =>
	McpStdioClient.fromTransport({
		async callTool(request: { name: string; arguments?: unknown }) {
			opts.calls?.push({ name: request.name, args: request.arguments });
			if (opts.absent === true) {
				throw new Error(`tool not found: ${request.name}`);
			}
			if (request.name.endsWith('external-mcps_ack')) {
				const args = request.arguments as { list?: boolean };
				if (args?.list === true) {
					return {
						structuredContent: opts.empty
							? { ok: true, mode: 'list', total: 0, pending: [] }
							: PENDING_PAYLOAD,
					};
				}
				return {
					structuredContent: { ok: true, mode: 'record', total: 1 },
				};
			}
			throw new Error(`no fixture for ${request.name}`);
		},
	});

const createVscode = (opts?: {
	readonly pickServer?: string;
	readonly pickDecision?: string;
	readonly notificationChoice?: string;
}) => {
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	const messages: string[] = [];
	let quickPickCount = 0;
	const vscode: IExternalMcpsAckVscodeApi = {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand(command, callback) {
				commands.set(command, callback);
				return { dispose() {} };
			},
		},
		window: {
			createWebviewPanel() {
				return { webview: { html: '' } };
			},
			async showInformationMessage(_message, ..._actions) {
				messages.push(_message);
				return opts?.notificationChoice;
			},
			async showQuickPick(items) {
				quickPickCount += 1;
				// First QuickPick = server; second = accept/reject decision.
				if (quickPickCount === 1) {
					return opts?.pickServer ?? items[0]?.id;
				}
				return opts?.pickDecision ?? items[0]?.id;
			},
		},
	};
	return {
		vscode,
		commands,
		messages,
		quickPickCount: () => quickPickCount,
	};
};

describe('external-mcps ack command (f00068 S5)', () => {
	it('records an accept through external_mcp_ack for the picked server', async () => {
		const calls: Array<{ name: string; args: unknown }> = [];
		const { vscode, commands, messages } = createVscode({
			pickServer: 'github',
			pickDecision: 'accept',
		});
		registerExternalMcpsAckCommand({
			vscode,
			client: createClient({ calls }),
		});
		await commands.get(EXTERNAL_MCPS_ACK_COMMAND)?.();
		const records = calls.filter(
			(c) =>
				c.name.endsWith('external-mcps_ack') &&
				(c.args as { list?: boolean }).list !== true,
		);
		expect(records).toHaveLength(1);
		expect(records[0]!.args).toEqual({ server: 'github', accept: true });
		expect(messages.some((m) => m.includes('github'))).toBe(true);
	});

	it('records a rejection when the decision QuickPick returns reject', async () => {
		const calls: Array<{ name: string; args: unknown }> = [];
		const { vscode, commands } = createVscode({
			pickServer: 'filesystem',
			pickDecision: 'reject',
		});
		registerExternalMcpsAckCommand({
			vscode,
			client: createClient({ calls }),
		});
		await commands.get(EXTERNAL_MCPS_ACK_COMMAND)?.();
		const records = calls.filter(
			(c) =>
				c.name.endsWith('external-mcps_ack') &&
				(c.args as { list?: boolean }).list !== true,
		);
		expect(records[0]!.args).toEqual({
			server: 'filesystem',
			accept: false,
		});
	});

	it('shows the empty-state toast and records nothing when nothing is pending', async () => {
		const calls: Array<{ name: string; args: unknown }> = [];
		const { vscode, commands, messages } = createVscode();
		registerExternalMcpsAckCommand({
			vscode,
			client: createClient({ calls, empty: true }),
		});
		await commands.get(EXTERNAL_MCPS_ACK_COMMAND)?.();
		expect(
			calls.filter((c) => (c.args as { list?: boolean }).list !== true),
		).toHaveLength(0);
		expect(messages.length).toBe(1);
	});

	it('degrades to the empty path when the plugin is absent — never throws', async () => {
		const { vscode, commands, messages } = createVscode();
		registerExternalMcpsAckCommand({
			vscode,
			client: createClient({ absent: true }),
		});
		await commands.get(EXTERNAL_MCPS_ACK_COMMAND)?.();
		expect(messages).toHaveLength(1);
	});
});

describe('external-mcps pending-ack notification (non-modal, decision 5)', () => {
	it('surfaces a toast with the pending count and opens the flow on Review', async () => {
		const calls: Array<{ name: string; args: unknown }> = [];
		const { vscode, messages } = createVscode({
			notificationChoice: 'Review',
			pickServer: 'github',
			pickDecision: 'accept',
		});
		await surfaceExternalMcpsPendingAcks({
			vscode,
			client: createClient({ calls }),
		});
		// The first message is the "N ... awaiting" toast.
		expect(messages[0]).toContain('2');
		// Review → runAckFlow → a record call landed.
		const records = calls.filter(
			(c) =>
				c.name.endsWith('external-mcps_ack') &&
				(c.args as { list?: boolean }).list !== true,
		);
		expect(records).toHaveLength(1);
	});

	it('stays silent when there are no pending activations', async () => {
		const { vscode, messages } = createVscode();
		await surfaceExternalMcpsPendingAcks({
			vscode,
			client: createClient({ empty: true }),
		});
		expect(messages).toHaveLength(0);
	});

	it('never throws when the plugin is absent', async () => {
		const { vscode, messages } = createVscode();
		await surfaceExternalMcpsPendingAcks({
			vscode,
			client: createClient({ absent: true }),
		});
		expect(messages).toHaveLength(0);
	});

	it('the 12-language string table is complete', () => {
		expect(assertExternalMcpsStringsComplete()).toEqual([]);
	});
});
