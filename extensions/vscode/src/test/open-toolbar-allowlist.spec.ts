/**
 * open-toolbar-allowlist.spec.ts — f00079 S2 (closes a00040 H3).
 *
 * The toolbar webview posts `{ command: 'mvAction', action, commandId }`
 * messages that the host turns into `vscode.commands.executeCommand(...)`
 * calls. Before the allow-list, any command id the message named was
 * dispatched verbatim — a crafted message (XSS / confused-deputy) could
 * run an arbitrary built-in command. This pins:
 *
 *   1. every command id the canonical toolbar emits is a member of the
 *      allow-list (so legitimate clicks still dispatch), and
 *   2. a crafted command id outside the allow-list is rejected with a
 *      typed error toast and is NEVER executed.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';
import { defaultQuickActions } from '@mcp-vertex/ui-extension/public';

import {
	ALLOWED_TOOLBAR_COMMANDS,
	registerOpenToolbarCommand,
	resolveToolbarCommandId,
} from '../commands/open-toolbar';
import type { ICommandDeps } from '../commands/types';

type Listener = (msg: unknown) => void | Promise<void>;

const createDeps = () => {
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	const executed: string[] = [];
	const errors: string[] = [];
	let listener: Listener | undefined;

	const vscode = {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand(
				command: string,
				callback: (...args: readonly unknown[]) => unknown,
			) {
				commands.set(command, callback);
				return { dispose() {} };
			},
			async executeCommand(command: string) {
				executed.push(command);
				return undefined;
			},
		},
		window: {
			createWebviewPanel() {
				return {
					webview: {
						html: '',
						onDidReceiveMessage(cb: Listener) {
							listener = cb;
							return { dispose() {} };
						},
					},
				};
			},
			async showErrorMessage(message: string) {
				errors.push(message);
				return undefined;
			},
		},
	} as unknown as ICommandDeps['vscode'];

	const deps: ICommandDeps = {
		vscode,
		client: McpStdioClient.fromTransport({
			async callTool() {
				return { structuredContent: {} };
			},
		}),
	};

	return {
		deps,
		commands,
		executed,
		errors,
		invoke: async (msg: unknown) => {
			await listener?.(msg);
		},
	};
};

const openToolbar = async (ctx: ReturnType<typeof createDeps>) => {
	registerOpenToolbarCommand(ctx.deps);
	const cmd = ctx.commands.get('mcp-vertex.openToolbar');
	await cmd?.();
};

describe('toolbar action allow-list (f00079 S2)', () => {
	it('every canonical toolbar command is a member of the allow-list', () => {
		for (const action of defaultQuickActions()) {
			expect(ALLOWED_TOOLBAR_COMMANDS.has(action.command)).toBe(true);
		}
	});

	it('dispatches an allow-listed commandId', async () => {
		const ctx = createDeps();
		await openToolbar(ctx);

		await ctx.invoke({
			command: 'mvAction',
			commandId: 'mcp-vertex.openProposal',
		});

		expect(ctx.executed).toEqual(['mcp-vertex.openProposal']);
		expect(ctx.errors).toHaveLength(0);
	});

	it('rejects a crafted command id with unknownAction semantics', async () => {
		const ctx = createDeps();
		await openToolbar(ctx);

		await ctx.invoke({
			command: 'mvAction',
			commandId: 'workbench.action.openSettings',
		});

		expect(ctx.executed).toHaveLength(0);
		expect(ctx.errors.some((m) => m.includes('not allowed'))).toBe(true);
	});

	it('rejects a derived command id that escapes the allow-list', async () => {
		const ctx = createDeps();
		await openToolbar(ctx);

		// No commandId → derived from the raw action → still gated.
		await ctx.invoke({ command: 'mvAction', action: 'evilAction' });

		expect(ctx.executed).toHaveLength(0);
		expect(ctx.errors.some((m) => m.includes('not allowed'))).toBe(true);
	});

	it('resolveToolbarCommandId prefers commandId, then derives, else undefined', () => {
		expect(resolveToolbarCommandId('mcp-vertex.openDocs', 'x')).toBe(
			'mcp-vertex.openDocs',
		);
		expect(resolveToolbarCommandId(undefined, 'open.docs')).toBe(
			'mcp-vertex.open_docs',
		);
		expect(resolveToolbarCommandId(undefined, undefined)).toBeUndefined();
		expect(resolveToolbarCommandId('', '')).toBeUndefined();
	});
});
