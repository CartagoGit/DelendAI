import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@delendai/client';

import {
	OPEN_AGENT_CATALOG_COMMAND,
	registerOpenAgentCatalogCommand,
} from '../commands/open-agent-catalog';
import type { ICommandVscodeApi } from '../commands/types';

// x00188 (F21): the webview used to dispatch on duck-typed
// `message.command`/`message.id` with zero contract check. This suite
// proves the new AGENT_CATALOG_MESSAGE_SCHEMA gate actually rejects a
// malformed/unknown message instead of silently probing host commands.

interface IArtifactShape {
	readonly generatedAt: string;
	readonly tools: ReadonlyArray<{
		readonly name: string;
		readonly plugin: string;
	}>;
	readonly skills: readonly unknown[];
	readonly proposals: { readonly actionable: readonly unknown[] };
}

const loadSnapshot = async () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const repoRoot = resolve(here, '../../../..');
	const raw = await readFile(
		resolve(repoRoot, 'docs/mcp-vertex/agent-catalog.generated.json'),
		'utf8',
	);
	const artifact = JSON.parse(raw) as IArtifactShape;
	return {
		server: {
			name: 'mcp-vertex',
			version: '0.1.0',
			namespacePrefix: 'mcp-vertex',
		},
		generatedAt: artifact.generatedAt,
		mode: 'full' as const,
		counts: {
			tools: artifact.tools.length,
			skills: artifact.skills.length,
			proposals: artifact.proposals.actionable.length,
		},
		proposalStatusCounts: {
			ready: 0,
			'in-progress': 0,
			review: 0,
			paused: 0,
			done: 0,
			blocked: 0,
			retired: 0,
			unspecified: 0,
		},
		tools: artifact.tools,
		skills: artifact.skills,
		proposals: artifact.proposals.actionable,
	};
};

describe('mcp-vertex.openAgentCatalog — message schema (a00083 F21)', () => {
	it('drops an unknown command and never invalidates the catalog cache', async () => {
		const snapshot = await loadSnapshot();
		let toolCalls = 0;
		let receive: ((message: unknown) => void | Promise<void>) | undefined;
		let html = '';
		const infoMessages: string[] = [];
		const warnings: unknown[][] = [];
		const originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			warnings.push(args);
		};

		const panel = {
			webview: {
				get html() {
					return html;
				},
				set html(value: string) {
					html = value;
				},
				onDidReceiveMessage(callback: typeof receive) {
					receive = callback;
					return { dispose() {} };
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
				async executeCommand() {},
			},
			window: {
				createWebviewPanel() {
					return panel;
				},
				async showInformationMessage(message: string) {
					infoMessages.push(message);
					return undefined;
				},
			},
			workspace: { workspaceFolders: [] },
		};
		const commands = new Map<
			string,
			(...args: readonly unknown[]) => unknown
		>();

		try {
			registerOpenAgentCatalogCommand({
				vscode,
				client: McpStdioClient.fromTransport({
					async callTool() {
						toolCalls += 1;
						return { structuredContent: snapshot };
					},
				}),
				globalState: {
					get<T>() {
						return undefined as T;
					},
					async update() {},
				},
			});

			await commands.get(OPEN_AGENT_CATALOG_COMMAND)?.();
			const callsAfterOpen = toolCalls;
			expect(callsAfterOpen).toBeGreaterThan(0);

			// A message shape nothing in the schema recognises.
			await receive?.({ command: 'evilProbe', payload: 'rm -rf /' });
			expect(warnings).toHaveLength(1);
			expect(String(warnings[0]?.[0])).toContain(
				'dropped invalid webview message',
			);
			expect(toolCalls).toBe(callsAfterOpen); // no refresh, no tool call
			expect(infoMessages).toEqual([]);

			// callTool with a missing/empty id is also rejected by the schema.
			await receive?.({ command: 'callTool', id: '' });
			expect(warnings).toHaveLength(2);
			expect(toolCalls).toBe(callsAfterOpen);

			// A valid, known command still works after invalid ones were dropped.
			await receive?.({ command: 'copied' });
			expect(infoMessages).toEqual([
				'mcp-vertex: bootstrap prompt copied',
			]);
		} finally {
			console.warn = originalWarn;
		}
	});
});
