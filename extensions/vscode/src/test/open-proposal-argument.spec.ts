/**
 * open-proposal-argument.spec.ts — f00079 S5 (closes a00040 H6).
 *
 * `mcp-vertex.openProposal` is invoked by the proposals TreeDataProvider
 * nodes with `arguments: [proposal.id]`, but the previous handler took no
 * argument and always rendered the global board. This pins the new
 * contract:
 *
 *   - `undefined` id  → legacy: render the whole board.
 *   - valid id        → render ONLY that proposal.
 *   - malformed id    → typed error toast, no panel.
 *   - unknown id      → typed error toast, no panel.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import {
	OPEN_PROPOSAL_COMMAND,
	checkProposalId,
	registerOpenProposalCommand,
} from '../commands/open-proposal';
import type { ICommandVscodeApi } from '../commands/types';

const createVscode = () => {
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	const panels: Array<{ title: string; webview: { html: string } }> = [];
	const errors: string[] = [];
	const vscode: ICommandVscodeApi = {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand(command, callback) {
				commands.set(command, callback);
				return { dispose() {} };
			},
		},
		window: {
			createWebviewPanel(_type, title) {
				const panel = { title, webview: { html: '' } };
				panels.push(panel);
				return panel;
			},
			async showErrorMessage(message) {
				errors.push(message);
				return undefined;
			},
		},
	};
	return { vscode, commands, panels, errors };
};

const board = {
	proposals: [
		{ id: 'f00014', status: 'in-progress', slices: [] },
		{ id: 'a00040', status: 'done', slices: [] },
	],
};

const register = (ctx: ReturnType<typeof createVscode>) =>
	registerOpenProposalCommand({
		vscode: ctx.vscode,
		client: McpStdioClient.fromTransport({
			async callTool() {
				return { structuredContent: board };
			},
		}),
	});

describe('checkProposalId', () => {
	it('treats undefined / empty as absent (legacy board)', () => {
		expect(checkProposalId(undefined).kind).toBe('absent');
		expect(checkProposalId('').kind).toBe('absent');
		expect(checkProposalId(null).kind).toBe('absent');
	});

	it('accepts canonical ids', () => {
		expect(checkProposalId('f00014')).toEqual({
			kind: 'valid',
			proposalId: 'f00014',
		});
		expect(checkProposalId('a00040').kind).toBe('valid');
	});

	it('rejects malformed ids', () => {
		for (const bad of [
			'abc',
			'12345',
			'12345a',
			'F00014',
			'f0001',
			99999,
		]) {
			expect(checkProposalId(bad).kind).toBe('malformed');
		}
	});
});

describe('openProposal honors its argument (f00079 S5)', () => {
	it('renders the whole board when no id is passed', async () => {
		const ctx = createVscode();
		register(ctx);
		await ctx.commands.get(OPEN_PROPOSAL_COMMAND)?.();
		expect(ctx.panels).toHaveLength(1);
		expect(ctx.panels[0]?.webview.html).toContain('f00014');
		expect(ctx.panels[0]?.webview.html).toContain('a00040');
		expect(ctx.errors).toHaveLength(0);
	});

	it('renders only the requested proposal for a valid id', async () => {
		const ctx = createVscode();
		register(ctx);
		await ctx.commands.get(OPEN_PROPOSAL_COMMAND)?.('a00040');
		expect(ctx.panels).toHaveLength(1);
		expect(ctx.panels[0]?.title).toContain('a00040');
		expect(ctx.panels[0]?.webview.html).toContain('a00040');
		expect(ctx.panels[0]?.webview.html).not.toContain('f00014');
		expect(ctx.errors).toHaveLength(0);
	});

	it('rejects a malformed id with an error and no panel', async () => {
		const ctx = createVscode();
		register(ctx);
		await ctx.commands.get(OPEN_PROPOSAL_COMMAND)?.('12345a');
		expect(ctx.panels).toHaveLength(0);
		expect(ctx.errors.some((m) => m.includes('malformed'))).toBe(true);
	});

	it('reports an unknown (well-formed) id without a panel', async () => {
		const ctx = createVscode();
		register(ctx);
		await ctx.commands.get(OPEN_PROPOSAL_COMMAND)?.('z99999');
		expect(ctx.panels).toHaveLength(0);
		expect(ctx.errors.some((m) => m.includes('not found'))).toBe(true);
	});
});
