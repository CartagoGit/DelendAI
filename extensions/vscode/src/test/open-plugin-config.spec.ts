import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { McpStdioClient, readConfigurationDocument } from '@delendai/client';

import {
	OPEN_PLUGIN_CONFIG_COMMAND,
	registerOpenPluginConfigCommand,
} from '../commands/open-plugin-config';
import type { ICommandVscodeApi } from '../commands/types';

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

interface IConfigurationCenterCallArgs {
	readonly section?: string;
	readonly cursor?: number;
}

/** Two-plugin, two-page fixture so `readAll`'s cursor loop actually
 * walks a `nextCursor` that is not `null` at least once (cursor-paginated
 * coverage for the pagination branch), in addition to the `plugins` vs
 * `artifacts` section split. */
const createClient = (): McpStdioClient =>
	McpStdioClient.fromTransport({
		async callTool(request) {
			const args = request.arguments as IConfigurationCenterCallArgs;
			const section = args.section ?? 'summary';
			const cursor = args.cursor ?? 0;
			const base = {
				section,
				page: { cursor, nextCursor: null, total: 0 },
			};
			if (section === 'config') {
				return {
					structuredContent: {
						...base,
						configSchema: {
							type: 'object',
							properties: { keepLegacy: { type: 'boolean' } },
						},
						config: {},
						redactions: 0,
					},
				};
			}
			if (section === 'summary') {
				return {
					structuredContent: {
						...base,
						summary: {
							plugins: 0,
							activePlugins: 0,
							artifacts: 0,
							unavailableArtifactKinds: ['agent'],
						},
					},
				};
			}
			if (section === 'plugins') {
				const firstPage = cursor === 0;
				return {
					structuredContent: {
						...base,
						page: {
							cursor,
							nextCursor: firstPage ? 1 : null,
							total: 2,
						},
						plugins: [
							{
								id: firstPage ? 'audit' : 'security',
								origin: 'bundled',
								active: true,
								source: 'config',
								options: {},
								schemaStatus: 'unavailable',
								capabilities: {
									tools: firstPage ? 2 : 1,
									prompts: 1,
									resources: 3,
									knowledge: 0,
									skills: 0,
								},
							},
						],
					},
				};
			}
			return { structuredContent: { ...base, artifacts: [] } };
		},
	});

interface IFakePanel {
	html: string;
	readonly disposeCallbacks: Array<() => void>;
	readonly receivers: Array<(message: unknown) => void | Promise<void>>;
	readonly outbound: unknown[];
	fire(message: unknown): Promise<void>;
}

const createPanel = (): IFakePanel => {
	const receivers: Array<(message: unknown) => void | Promise<void>> = [];
	const panel: IFakePanel = {
		html: '',
		disposeCallbacks: [],
		receivers,
		outbound: [],
		async fire(message) {
			for (const receiver of receivers) {
				await receiver(message);
			}
		},
	};
	return panel;
};

const createVscode = (
	panel: IFakePanel,
	workspaceRoot: string | undefined,
	errors: string[],
): ICommandVscodeApi => ({
	ViewColumn: { One: 1 },
	commands: {
		registerCommand(command, callback) {
			commands.set(command, callback);
			return { dispose() {} };
		},
	},
	window: {
		createWebviewPanel() {
			return {
				webview: {
					get html() {
						return panel.html;
					},
					set html(value: string) {
						panel.html = value;
					},
					onDidReceiveMessage(callback) {
						panel.receivers.push(callback);
						return { dispose() {} };
					},
					async postMessage(message) {
						panel.outbound.push(message);
					},
				},
			};
		},
		async showErrorMessage(message) {
			errors.push(message);
			return undefined;
		},
	},
	workspace: {
		workspaceFolders:
			workspaceRoot === undefined
				? []
				: [{ uri: { fsPath: workspaceRoot } }],
	},
});

const commands = new Map<string, (...args: readonly unknown[]) => unknown>();

describe('delendai.openPluginConfig', () => {
	it('shows a workspace-required error and never opens a panel with no folder', async () => {
		const panel = createPanel();
		const errors: string[] = [];
		commands.clear();
		registerOpenPluginConfigCommand({
			vscode: createVscode(panel, undefined, errors),
			client: createClient(),
		});
		const result = await commands.get(OPEN_PLUGIN_CONFIG_COMMAND)?.();
		expect(result).toBeUndefined();
		expect(errors).toEqual([
			'delendai: open a workspace before configuring the project.',
		]);
		expect(panel.html).toBe('');
	});

	it('opens the center scoped to one plugin, then saves and discards through it', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-vscode-plugin-'));
		roots.push(root);
		const panel = createPanel();
		const errors: string[] = [];
		commands.clear();
		registerOpenPluginConfigCommand({
			vscode: createVscode(panel, root, errors),
			client: createClient(),
		});

		const returned = await commands.get(OPEN_PLUGIN_CONFIG_COMMAND)?.(
			'audit',
		);
		expect(returned).toBeDefined();
		expect(panel.html).toContain('Content-Security-Policy');
		expect(panel.html).toContain('__DELENDAI_CONFIGURATION_HOST__');
		// Two plugin pages were fetched (cursor 0 → nextCursor 1 → null),
		// walking the `readAll` pagination loop for a non-null cursor.
		expect(panel.html).toContain('2 tools');

		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});
		await panel.fire({
			command: 'saveConfiguration',
			expectedDigest: snapshot.digest,
			edits: [{ action: 'set', path: ['keepLegacy'], value: true }],
		});
		expect(
			JSON.parse(
				await readFile(join(root, 'delendai.config.json'), 'utf8'),
			),
		).toEqual({ keepLegacy: true });
		expect(panel.outbound).toEqual([
			expect.objectContaining({ command: 'configurationSaved' }),
		]);

		// A stale digest is reported as a conflict instead of silently
		// dropped or thrown.
		await panel.fire({
			command: 'saveConfiguration',
			expectedDigest: snapshot.digest,
			edits: [{ action: 'set', path: ['keepLegacy'], value: false }],
		});
		expect(panel.outbound).toEqual([
			expect.objectContaining({ command: 'configurationSaved' }),
			{ command: 'configurationConflict' },
		]);

		// An unknown/invalid message is dropped by the schema guard.
		await panel.fire({ command: 'notACommand' });
		expect(panel.outbound).toHaveLength(2);

		const htmlAfterSave = panel.html;
		panel.html = '<mutated>';
		await panel.fire({ command: 'discardConfiguration' });
		expect(panel.html).toBe(htmlAfterSave);
	});

	it('opens the full, unscoped center when no plugin id is given', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-vscode-plugin-'));
		roots.push(root);
		const panel = createPanel();
		const errors: string[] = [];
		commands.clear();
		registerOpenPluginConfigCommand({
			vscode: createVscode(panel, root, errors),
			client: createClient(),
		});

		await commands.get(OPEN_PLUGIN_CONFIG_COMMAND)?.();
		expect(panel.html).toContain('Content-Security-Policy');
		// An empty/non-string plugin id argument is treated the same as
		// "no plugin" — the raw command arg is `unknown` (e.g. a VS Code
		// tree-item click can pass odd shapes), so falsy/non-string input
		// must not throw.
		await commands.get(OPEN_PLUGIN_CONFIG_COMMAND)?.(42);
		await commands.get(OPEN_PLUGIN_CONFIG_COMMAND)?.('');
		expect(errors).toEqual([]);
	});

	it('reports a load failure through showErrorMessage', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-vscode-plugin-'));
		roots.push(root);
		const panel = createPanel();
		const errors: string[] = [];
		commands.clear();
		const failingClient = McpStdioClient.fromTransport({
			callTool() {
				return Promise.reject(new Error('server unreachable'));
			},
		});
		registerOpenPluginConfigCommand({
			vscode: createVscode(panel, root, errors),
			client: failingClient,
		});

		const result = await commands.get(OPEN_PLUGIN_CONFIG_COMMAND)?.();
		expect(result).toBeUndefined();
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('open plugin config failed');
		expect(errors[0]).toContain('server unreachable');
	});

	it('reports a missing configuration schema as a load failure', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-vscode-plugin-'));
		roots.push(root);
		const panel = createPanel();
		const errors: string[] = [];
		commands.clear();
		const client = McpStdioClient.fromTransport({
			async callTool(request) {
				const args = request.arguments as IConfigurationCenterCallArgs;
				const section = args.section ?? 'summary';
				const base = {
					section,
					page: { cursor: 0, nextCursor: null, total: 0 },
				};
				if (section === 'config') {
					// No `configSchema` — the server has none to offer.
					return { structuredContent: { ...base, config: {} } };
				}
				if (section === 'summary') {
					return {
						structuredContent: {
							...base,
							summary: {
								plugins: 0,
								activePlugins: 0,
								artifacts: 0,
								unavailableArtifactKinds: [],
							},
						},
					};
				}
				if (section === 'plugins') {
					return { structuredContent: { ...base, plugins: [] } };
				}
				return { structuredContent: { ...base, artifacts: [] } };
			},
		});
		registerOpenPluginConfigCommand({
			vscode: createVscode(panel, root, errors),
			client,
		});

		const result = await commands.get(OPEN_PLUGIN_CONFIG_COMMAND)?.();
		expect(result).toBeUndefined();
		expect(errors).toEqual([
			'delendai: open plugin config failed: configuration schema is unavailable',
		]);
	});

	it('reports a save failure (not just a save rejection) through postMessage and showErrorMessage', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-vscode-plugin-'));
		roots.push(root);
		const panel = createPanel();
		const errors: string[] = [];
		commands.clear();
		registerOpenPluginConfigCommand({
			vscode: createVscode(panel, root, errors),
			client: createClient(),
		});
		await commands.get(OPEN_PLUGIN_CONFIG_COMMAND)?.();

		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});
		// Replace the config file with a directory of the same name so
		// `saveConfigurationDocument`'s internal re-read throws (EISDIR)
		// instead of resolving with `{ ok: false }` — the genuine
		// exception path, distinct from a reported conflict/invalid.
		await mkdir(join(root, 'delendai.config.json'));
		await panel.fire({
			command: 'saveConfiguration',
			expectedDigest: snapshot.digest,
			edits: [{ action: 'set', path: ['keepLegacy'], value: true }],
		});

		expect(panel.outbound).toEqual([{ command: 'configurationInvalid' }]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('save plugin config failed');
	});
});
