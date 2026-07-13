/**
 * provider-actions.spec.ts — f00098 S3.
 *
 * Pins the provider dashboard's host-adapter behaviour: the panel
 * renders both builder models (providers + usage), degrades to the
 * opt-in hint when the plugins are absent (never an error), the
 * usage-clear command only fires behind the MODAL confirm (CLI
 * `--confirm` parity), pause wraps `set_provider_state` with the
 * recorded reason, and the 12-language string table is complete.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import {
	PROVIDERS_OPEN_DASHBOARD_COMMAND,
	PROVIDERS_PAUSE_COMMAND,
	USAGE_CLEAR_COMMAND,
	registerProviderActionCommands,
	type IProviderActionsVscodeApi,
} from '../commands/provider-actions';
import { assertProviderDashboardStringsComplete } from '../i18n/provider-dashboard.strings';

const HEALTHCHECK_PAYLOAD = {
	checkedAt: '2026-07-07T10:00:00.000Z',
	providers: [
		{
			id: 'claude-sonnet',
			cli: { installed: true, path: '/usr/bin/claude', version: '2.1.0' },
			auth: { authenticated: true, tier: 'max' },
			model: { requested: 'claude-sonnet-4-5', available: true },
			overall: 'available',
		},
	],
	summary: { total: 1, available: 1, unavailable: 0 },
};

const REPORT_PAYLOAD = {
	groupBy: 'provider',
	windowDays: 30,
	totals: {
		calls: 4,
		inputTokens: 100,
		outputTokens: 50,
		totalTokens: 150,
		costUsd: 0.25,
		errors: 0,
		autoBypassed: 0,
	},
	buckets: [
		{
			key: 'claude-sonnet',
			calls: 4,
			inputTokens: 100,
			outputTokens: 50,
			totalTokens: 150,
			costUsd: 0.25,
			errors: 0,
			autoBypassed: 0,
		},
	],
	expensiveCalls: [],
};

const MODEL_REPORT_PAYLOAD = {
	groupBy: 'model',
	totals: {
		calls: 4,
		totalTokens: 150,
		costUsd: 0.25,
		tokensSaved: 75,
		savingsPercent: 50,
	},
	buckets: [
		{
			key: 'anthropic/claude-sonnet',
			calls: 4,
			totalTokens: 150,
			costUsd: 0.25,
			tokensSaved: 75,
			savingsPercent: 50,
		},
	],
};

/** Fake transport routing by tool name; `absent` simulates unloaded plugins. */
const createClient = (opts: {
	readonly absent?: boolean;
	readonly calls?: Array<{ name: string; args: unknown }>;
}) =>
	McpStdioClient.fromTransport({
		async callTool(request: { name: string; arguments?: unknown }) {
			opts.calls?.push({ name: request.name, args: request.arguments });
			if (opts.absent === true) {
				throw new Error(`tool not found: ${request.name}`);
			}
			if (request.name.endsWith('healthcheck_providers')) {
				return { structuredContent: HEALTHCHECK_PAYLOAD };
			}
			if (request.name.endsWith('usage_report')) {
				return {
					structuredContent:
						(request.arguments as { groupBy?: string })?.groupBy ===
						'model'
							? MODEL_REPORT_PAYLOAD
							: REPORT_PAYLOAD,
				};
			}
			if (request.name.endsWith('usage_clear')) {
				return { structuredContent: { ok: true, cleared: [] } };
			}
			// get_quota / advise_spend / set_provider_state: minimal shapes.
			if (request.name.endsWith('set_provider_state')) {
				return { structuredContent: { ok: true } };
			}
			throw new Error(`no fixture for ${request.name}`);
		},
	});

const createVscode = (opts?: {
	readonly confirmAnswer?: string;
	readonly inputAnswer?: string;
}) => {
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	const messages: string[] = [];
	const panels: Array<{ webview: { html: string } }> = [];
	let modalPrompts = 0;
	const vscode: IProviderActionsVscodeApi = {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand(command, callback) {
				commands.set(command, callback);
				return { dispose() {} };
			},
		},
		window: {
			createWebviewPanel() {
				const panel = { webview: { html: '' } };
				panels.push(panel);
				return panel;
			},
			async showInformationMessage(message) {
				messages.push(message);
				return undefined;
			},
			async showQuickPick(items) {
				return items[0];
			},
			async showInputBox() {
				return opts?.inputAnswer ?? 'maintenance window';
			},
			async showWarningMessage(_message, _options, ..._actions) {
				modalPrompts += 1;
				return opts?.confirmAnswer;
			},
		},
	};
	return {
		vscode,
		commands,
		messages,
		panels,
		modalPrompts: () => modalPrompts,
	};
};

describe('provider dashboard commands (f00098 S3)', () => {
	it('openDashboard renders both builder models into the panel', async () => {
		const { vscode, commands, panels } = createVscode();
		registerProviderActionCommands({ vscode, client: createClient({}) });
		await commands.get(PROVIDERS_OPEN_DASHBOARD_COMMAND)?.();
		expect(panels).toHaveLength(1);
		const html = panels[0]!.webview.html;
		expect(html).toContain('claude-sonnet');
		expect(html).toContain('available');
		expect(html).toContain('$0.2500');
		expect(html).toContain('anthropic/claude-sonnet');
		expect(html).toContain('75');
		// Script-free webview: the default-deny CSP is embedded.
		expect(html).toContain('Content-Security-Policy');
	});

	it('degrades to the opt-in hint when the plugins are absent — never an error', async () => {
		const { vscode, commands, panels } = createVscode();
		registerProviderActionCommands({
			vscode,
			client: createClient({ absent: true }),
		});
		await commands.get(PROVIDERS_OPEN_DASHBOARD_COMMAND)?.();
		const html = panels[0]!.webview.html;
		expect(html).toContain('--plugins=usage-tracking,orchestrator-runner');
		expect(html).toContain('--plugins=usage-tracking');
		expect(html).not.toContain('failed');
	});

	it('usage.clear declined at the modal confirm never calls the tool', async () => {
		const calls: Array<{ name: string; args: unknown }> = [];
		const { vscode, commands, modalPrompts } = createVscode();
		registerProviderActionCommands({
			vscode,
			client: createClient({ calls }),
		});
		await commands.get(USAGE_CLEAR_COMMAND)?.();
		expect(modalPrompts()).toBe(1);
		expect(
			calls.filter((c) => c.name.endsWith('usage_clear')),
		).toHaveLength(0);
	});

	it('usage.clear confirmed calls usage_clear with confirm:true', async () => {
		const calls: Array<{ name: string; args: unknown }> = [];
		const { vscode, commands, messages } = createVscode({
			confirmAnswer: 'Clear log',
		});
		registerProviderActionCommands({
			vscode,
			client: createClient({ calls }),
		});
		await commands.get(USAGE_CLEAR_COMMAND)?.();
		const clearCalls = calls.filter((c) => c.name.endsWith('usage_clear'));
		expect(clearCalls).toHaveLength(1);
		expect(clearCalls[0]!.args).toEqual({ confirm: true });
		expect(messages.some((m) => m.includes('cleared'))).toBe(true);
	});

	it('pause wraps set_provider_state with the picked id and reason', async () => {
		const calls: Array<{ name: string; args: unknown }> = [];
		const { vscode, commands } = createVscode({
			inputAnswer: 'maintenance window',
		});
		registerProviderActionCommands({
			vscode,
			client: createClient({ calls }),
		});
		await commands.get(PROVIDERS_PAUSE_COMMAND)?.();
		const stateCalls = calls.filter((c) =>
			c.name.endsWith('set_provider_state'),
		);
		expect(stateCalls).toHaveLength(1);
		expect(stateCalls[0]!.args).toEqual({
			providerId: 'claude-sonnet',
			state: 'rate-limited',
			reason: 'maintenance window',
		});
	});

	it('the 12-language string table is complete', () => {
		expect(assertProviderDashboardStringsComplete()).toEqual([]);
	});
});
