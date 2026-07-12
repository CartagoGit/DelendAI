import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { McpStdioClient, readConfigurationDocument } from '@mcp-vertex/client';

import { registerOpenConfigurationCenterCommand } from '../commands/open-configuration-center';
import type { ICommandVscodeApi } from '../commands/types';

const OPEN_CONFIGURATION_CENTER_COMMAND = 'mcp-vertex.openConfigurationCenter';
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

const createClient = (): McpStdioClient =>
	McpStdioClient.fromTransport({
		async callTool(request) {
			const args = request.arguments as {
				section?: string;
				cursor?: number;
			};
			const section = args.section ?? 'summary';
			const base = {
				section,
				page: { cursor: args.cursor ?? 0, nextCursor: null, total: 0 },
			};
			const payload =
				section === 'config'
					? {
							...base,
							configSchema: {
								type: 'object',
								properties: { keepLegacy: { type: 'boolean' } },
							},
							config: {},
							redactions: 0,
						}
					: section === 'summary'
						? {
								...base,
								summary: {
									plugins: 0,
									activePlugins: 0,
									artifacts: 0,
									unavailableArtifactKinds: ['agent'],
								},
							}
						: section === 'plugins'
							? { ...base, plugins: [] }
							: { ...base, artifacts: [] };
			return { structuredContent: payload };
		},
	});

describe('mcp-vertex.openConfigurationCenter', () => {
	it('renders the real center and only persists schema-validated messages', async () => {
		const root = await mkdtemp(join(tmpdir(), 'mcpv-vscode-config-'));
		roots.push(root);
		const commands = new Map<
			string,
			(...args: readonly unknown[]) => unknown
		>();
		let receive: ((message: unknown) => void | Promise<void>) | undefined;
		const outbound: unknown[] = [];
		const errors: string[] = [];
		const panel = {
			webview: {
				html: '',
				onDidReceiveMessage(callback: typeof receive) {
					receive = callback;
					return { dispose() {} };
				},
				async postMessage(message: unknown) {
					outbound.push(message);
				},
			},
		};
		const vscode: ICommandVscodeApi = {
			ViewColumn: { One: 1 },
			commands: {
				registerCommand(command, callback) {
					commands.set(command, callback);
					return { dispose() {} };
				},
			},
			window: {
				createWebviewPanel() {
					return panel;
				},
				async showErrorMessage(message) {
					errors.push(message);
					return undefined;
				},
				async showInformationMessage() {
					return undefined;
				},
			},
			workspace: { workspaceFolders: [{ uri: { fsPath: root } }] },
		};
		registerOpenConfigurationCenterCommand({
			vscode,
			client: createClient(),
		});

		await commands.get(OPEN_CONFIGURATION_CENTER_COMMAND)?.();
		expect(panel.webview.html).toContain('Content-Security-Policy');
		expect(panel.webview.html).toContain('__MCPV_CONFIGURATION_HOST__');
		expect(panel.webview.html).toContain('Configuration Center');

		await receive?.({ command: 'saveConfiguration', edits: [] });
		expect(errors).toHaveLength(1);
		expect(
			(await readConfigurationDocument({ workspaceRoot: root })).exists,
		).toBe(false);

		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});
		await receive?.({
			command: 'saveConfiguration',
			expectedDigest: snapshot.digest,
			edits: [{ action: 'set', path: ['keepLegacy'], value: true }],
		});
		expect(
			JSON.parse(
				await readFile(join(root, 'mcp-vertex.config.json'), 'utf8'),
			),
		).toEqual({
			keepLegacy: true,
		});
		expect(outbound).toEqual([
			expect.objectContaining({ command: 'configurationSaved' }),
		]);
	});

	it('contributes the command and server settings at the valid manifest level', async () => {
		const manifest = JSON.parse(
			await readFile(
				fileURLToPath(new URL('../../package.json', import.meta.url)),
				'utf8',
			),
		) as {
			configuration?: unknown;
			contributes?: {
				configuration?: unknown;
				commands?: Array<{ command?: string }>;
			};
		};

		expect(manifest.configuration).toBeUndefined();
		expect(manifest.contributes?.configuration).toBeDefined();
		expect(
			manifest.contributes?.commands?.some(
				(entry) => entry.command === OPEN_CONFIGURATION_CENTER_COMMAND,
			),
		).toBe(true);
	});
});
