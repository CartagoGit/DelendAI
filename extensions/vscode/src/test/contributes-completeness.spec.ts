/**
 * f00100 S4 — Registered-command completeness ratchet.
 *
 * Asserts that:
 *   1. Every `contributes.commands[].command` has a handler registered
 *      in `activate()`.
 *   2. Every `mcp-vertex.*` handler registered in `activate()` has a
 *      matching `contributes.commands` entry.
 *
 * Both directions, so dead-or-phantom commands fail the suite.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { McpStdioClient, type IOverview } from '@delendai/client';

import {
	activate,
	__resetRuntimeHandle,
	type IExtensionContext,
	type IVscodeApi,
} from '../extension';

const overviewFixture: IOverview = {
	server: { name: 'mcp-vertex', version: '0.1.0' },
	namespacePrefix: 'mcp-vertex',
	plugins: ['core'],
	tools: ['mcp-vertex_overview'],
	knowledge: [],
	recommendedNextAction: 'Call overview first.',
};

/** Read contributed command ids from `package.json`. */
const readContributedCommands = (): readonly string[] => {
	const pkgPath = resolve(__dirname, '..', '..', 'package.json');
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
		contributes?: {
			commands?: readonly { command: string }[];
		};
	};
	return (pkg.contributes?.commands ?? []).map((c) => c.command);
};

/** Activate with a full fake and collect registered command ids. */
const collectRegisteredCommands = async (): Promise<Set<string>> => {
	__resetRuntimeHandle();
	const commands = new Set<string>();
	const context: IExtensionContext = {
		subscriptions: [],
		globalState: {
			get<T>(): T | undefined {
				return undefined;
			},
			async update() {
				// no-op
			},
		},
	};
	const vscode: IVscodeApi = {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand(command, _callback) {
				commands.add(command);
				return { dispose() {} };
			},
		},
		window: {
			createWebviewPanel() {
				return { webview: { html: '' } };
			},
		},
	};
	const client = McpStdioClient.fromTransport({
		async callTool() {
			return { structuredContent: overviewFixture };
		},
	});
	await activate(context, { vscode, createClient: async () => client });
	return commands;
};

describe('f00100 S4 — contributes-completeness ratchet', () => {
	it('every contributed command has a registered handler', async () => {
		const contributed = readContributedCommands();
		const registered = await collectRegisteredCommands();

		const missing = contributed.filter((id) => !registered.has(id));
		expect(
			missing,
			`Contributed commands with NO registered handler:\n  ${missing.join('\n  ')}\n\nAdd a handler in activate() or remove the command from package.json.`,
		).toEqual([]);
	});

	it('every registered mcp-vertex.* handler has a contributes entry', async () => {
		const contributed = new Set(readContributedCommands());
		const registered = await collectRegisteredCommands();

		const phantom = [...registered]
			.filter((id) => id.startsWith('mcp-vertex.'))
			.filter((id) => !contributed.has(id));

		expect(
			phantom,
			`Registered handlers with NO contributes.commands entry:\n  ${phantom.join('\n  ')}\n\nAdd a contributes.commands entry in package.json or remove the handler.`,
		).toEqual([]);
	});

	it('contributed command count matches a known ratchet', async () => {
		const contributed = readContributedCommands();
		// f00100 S3: 29 commands after adding category grouping + refresh icons
		// + saveSettings/resetSettings (previously phantom — detected by ratchet).
		// Update this number with a dated rationale when commands are added/removed.
		// f00107 S3: + plugin activation switchboard.
		// Configuration Center is the 31st intentionally contributed command.
		// f00119 S6: auto-agent-selector panel command is the 32nd.
		// x00072 SEC-001 S1: start-server-untrusted command is the 33rd.
		// f00192 S1: openAgentTimeline is the 34th.
		// Runtime observer log command is the 35th.
		// `openDashboardTab` (dashboard in an editor tab) is the 37th.
		expect(contributed.length).toBe(37);
	});
});
