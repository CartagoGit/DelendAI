/**
 * `open-configuration-center-edge-cases.spec.ts` — fills the branch
 * gaps `configuration-center.spec.ts` leaves in
 * `../commands/open-configuration-center.ts`: no workspace, a
 * multi-folder workspace (the `showQuickPick` branch), a missing
 * configuration schema (the outer catch), and the save-response
 * branches other than the single happy path already covered there
 * (conflict, non-conflict validation issues, and a no-op save that
 * skips the restart prompt).
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { McpStdioClient, readConfigurationDocument } from '@delendai/client';

import {
	OPEN_CONFIGURATION_CENTER_COMMAND,
	registerOpenConfigurationCenterCommand,
} from '../commands/open-configuration-center';
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

const DEFAULT_CONFIG_SCHEMA: Readonly<Record<string, unknown>> = {
	type: 'object',
	properties: { keepLegacy: { type: 'boolean' } },
};

/** `configSchema: null` (not an omitted/`undefined` argument — a default
 * parameter would silently substitute its default for an explicit
 * `undefined`) simulates a server response that omits the schema. */
const createClient = (
	configSchema: Readonly<
		Record<string, unknown>
	> | null = DEFAULT_CONFIG_SCHEMA,
): McpStdioClient =>
	McpStdioClient.fromTransport({
		async callTool(request) {
			const args = request.arguments as IConfigurationCenterCallArgs;
			const section = args.section ?? 'summary';
			const base = {
				section,
				page: { cursor: args.cursor ?? 0, nextCursor: null, total: 0 },
			};
			if (section === 'config') {
				return {
					structuredContent:
						configSchema === null
							? { ...base, config: {}, redactions: 0 }
							: {
									...base,
									configSchema,
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

const commands = new Map<string, (...args: readonly unknown[]) => unknown>();

interface IFakePanel {
	html: string;
	readonly receivers: Array<(message: unknown) => void | Promise<void>>;
	readonly outbound: unknown[];
	fire(message: unknown): Promise<void>;
}

const createPanel = (): IFakePanel => {
	const receivers: Array<(message: unknown) => void | Promise<void>> = [];
	return {
		html: '',
		receivers,
		outbound: [],
		async fire(message) {
			for (const receiver of receivers) await receiver(message);
		},
	};
};

const createVscode = (options: {
	readonly panel?: IFakePanel;
	readonly workspaceFolders?: ReadonlyArray<{
		readonly uri: { readonly fsPath: string };
	}>;
	readonly errors: string[];
	readonly quickPickIndex?: number;
	readonly infoActionIndex?: number | undefined;
}): ICommandVscodeApi => {
	const { panel, workspaceFolders, errors } = options;
	return {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand(command, callback) {
				commands.set(command, callback);
				return { dispose() {} };
			},
			async executeCommand() {
				return undefined;
			},
		},
		window: {
			createWebviewPanel() {
				if (panel === undefined) {
					throw new Error('test did not expect a panel to open');
				}
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
			async showQuickPick(items) {
				return items[options.quickPickIndex ?? 0];
			},
			async showInformationMessage(_message, ...actions) {
				return options.infoActionIndex === undefined
					? undefined
					: actions[options.infoActionIndex];
			},
		},
		workspace: { workspaceFolders: workspaceFolders ?? [] },
	};
};

describe('delendai.openConfigurationCenter — edge cases', () => {
	it('shows a workspace-required error and opens no panel with zero folders', async () => {
		const errors: string[] = [];
		commands.clear();
		registerOpenConfigurationCenterCommand({
			vscode: createVscode({ workspaceFolders: [], errors }),
			client: createClient(),
		});

		const result = await commands.get(
			OPEN_CONFIGURATION_CENTER_COMMAND,
		)?.();
		expect(result).toBeUndefined();
		expect(errors).toEqual([
			'delendai: open a workspace before configuring the project.',
		]);
	});

	it('offers a quick pick and uses the chosen folder when the workspace has several', async () => {
		const rootA = await mkdtemp(join(tmpdir(), 'delendai-vscode-a-'));
		const rootB = await mkdtemp(join(tmpdir(), 'delendai-vscode-b-'));
		roots.push(rootA, rootB);
		const panel = createPanel();
		const errors: string[] = [];
		commands.clear();
		registerOpenConfigurationCenterCommand({
			vscode: createVscode({
				panel,
				workspaceFolders: [
					{ uri: { fsPath: rootA } },
					{ uri: { fsPath: rootB } },
				],
				errors,
				quickPickIndex: 1,
			}),
			client: createClient(),
		});

		await commands.get(OPEN_CONFIGURATION_CENTER_COMMAND)?.();
		expect(errors).toEqual([]);
		expect(panel.html).toContain('Content-Security-Policy');

		// The picked folder (rootB) is the one that actually receives the
		// save — proof the quick-pick's choice, not just folder[0], won.
		const snapshot = await readConfigurationDocument({
			workspaceRoot: rootB,
		});
		await panel.fire({
			command: 'saveConfiguration',
			expectedDigest: snapshot.digest,
			edits: [{ action: 'set', path: ['keepLegacy'], value: true }],
		});
		expect(
			JSON.parse(
				await readFile(join(rootB, 'delendai.config.json'), 'utf8'),
			),
		).toEqual({ keepLegacy: true });
	});

	it('reports a missing configuration schema through the outer catch', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-vscode-c-'));
		roots.push(root);
		const panel = createPanel();
		const errors: string[] = [];
		commands.clear();
		registerOpenConfigurationCenterCommand({
			vscode: createVscode({
				panel,
				workspaceFolders: [{ uri: { fsPath: root } }],
				errors,
			}),
			client: createClient(null),
		});

		const result = await commands.get(
			OPEN_CONFIGURATION_CENTER_COMMAND,
		)?.();
		expect(result).toBeUndefined();
		expect(errors).toEqual([
			'delendai: delendai Configuration Center failed: configuration schema is unavailable',
		]);
	});

	it('reports a conflicting digest without touching the file or offering a restart', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-vscode-d-'));
		roots.push(root);
		const panel = createPanel();
		const errors: string[] = [];
		commands.clear();
		registerOpenConfigurationCenterCommand({
			vscode: createVscode({
				panel,
				workspaceFolders: [{ uri: { fsPath: root } }],
				errors,
			}),
			client: createClient(),
		});
		await commands.get(OPEN_CONFIGURATION_CENTER_COMMAND)?.();

		await panel.fire({
			command: 'saveConfiguration',
			expectedDigest: 'f'.repeat(64),
			edits: [{ action: 'set', path: ['keepLegacy'], value: true }],
		});

		expect(panel.outbound).toEqual([{ command: 'configurationConflict' }]);
		expect(
			(await readConfigurationDocument({ workspaceRoot: root })).exists,
		).toBe(false);
	});

	it('reports non-conflict validation issues from a rejected edit', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-vscode-e-'));
		roots.push(root);
		const panel = createPanel();
		const errors: string[] = [];
		commands.clear();
		registerOpenConfigurationCenterCommand({
			vscode: createVscode({
				panel,
				workspaceFolders: [{ uri: { fsPath: root } }],
				errors,
			}),
			client: createClient(),
		});
		await commands.get(OPEN_CONFIGURATION_CENTER_COMMAND)?.();

		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});
		// `delete` on a path that was never `set` still applies cleanly in
		// this schema-less document, so force a genuine validation failure
		// instead: `keepLegacy` is declared `boolean` by the schema, and
		// the edit's value schema (`z.unknown()`) lets a non-boolean value
		// through to `saveConfigurationDocument`, which is what actually
		// rejects it as a validation issue.
		await panel.fire({
			command: 'saveConfiguration',
			expectedDigest: snapshot.digest,
			edits: [
				{ action: 'set', path: ['keepLegacy'], value: 'not-a-bool' },
			],
		});

		expect(panel.outbound).toHaveLength(1);
		const [message] = panel.outbound;
		expect(message).toEqual(
			expect.objectContaining({ command: 'configurationInvalid' }),
		);
	});

	it('skips the restart prompt when the save was a no-op', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-vscode-f-'));
		roots.push(root);
		const panel = createPanel();
		const errors: string[] = [];
		commands.clear();
		let executed = 0;
		const vscode = createVscode({
			panel,
			workspaceFolders: [{ uri: { fsPath: root } }],
			errors,
		});
		registerOpenConfigurationCenterCommand({
			vscode: {
				...vscode,
				commands: {
					...vscode.commands,
					async executeCommand() {
						executed += 1;
						return undefined;
					},
				},
			},
			client: createClient(),
		});
		await commands.get(OPEN_CONFIGURATION_CENTER_COMMAND)?.();

		const snapshot = await readConfigurationDocument({
			workspaceRoot: root,
		});
		// No edits at all: `saveConfigurationDocument` reports
		// `changed: false`, which must short-circuit before the restart
		// prompt is ever shown.
		await panel.fire({
			command: 'saveConfiguration',
			expectedDigest: snapshot.digest,
			edits: [],
		});

		expect(panel.outbound).toEqual([
			expect.objectContaining({ command: 'configurationSaved' }),
		]);
		expect(executed).toBe(0);
	});
});
