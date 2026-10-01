/**
 * proposals-board.spec.ts — f00097 S6 (lightweight e2e).
 *
 * Wires the real board provider + open-proposal + copy-error commands through
 * ONE canned stub client (proposal_board + compact_status + state_health +
 * proposal_stale_list + proposal_diagnose + logs_tail), and asserts the S6
 * acceptance as a flow — without the @vscode/test-electron download/runtime
 * (the unit specs already cover the pieces; this pins them end-to-end):
 *
 *   (a) the board renders every status group exactly once when the snapshot
 *       has one proposal per family;
 *   (b) clicking a row dispatches `openProposal` with the correct id, opening
 *       the detail webview for that id;
 *   (c) refresh produces a fresh snapshot but a filter change does NOT refetch;
 *   (d) an `outputSchema` violation surfaces a recoverable banner (no crash),
 *       and Copy-error places VALID JSON on the clipboard.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@delendai/client';

import { registerOpenProposalCommand } from '../commands/open-proposal';
import {
	PROPOSALS_COPY_ERROR_COMMAND,
	registerProposalsCopyErrorCommand,
} from '../commands/proposals-commands';
import type { ICommandVscodeApi } from '../commands/types';
import { ProposalsSnapshotSource } from '../lib/proposals-snapshot';
import {
	ProposalBoardProvider,
	type IProposalNode,
} from '../providers/proposal-board-provider';

const onePerFamily = {
	proposals: [
		{ id: 'f00001', status: 'ready', slices: [] },
		{
			id: 'f00002',
			status: 'in-progress',
			slices: [],
			claimableSliceIds: ['S2'],
		},
		{ id: 'f00003', status: 'review', slices: [] },
		{ id: 'f00004', status: 'paused', slices: [] },
		{ id: 'f00005', status: 'blocked', slices: [] },
		{ id: 'f00006', status: 'done', slices: [] },
		{ id: 'f00007', status: 'retired', slices: [] },
	],
};

interface IStubOptions {
	readonly board?: unknown;
	readonly onCall?: (name: string) => void;
}

const stubClient = (options: IStubOptions = {}) =>
	McpStdioClient.fromTransport({
		async callTool(input) {
			options.onCall?.(input.name);
			const suffix = input.name.replace(/^delendai_/, '');
			if (suffix === 'proposals_proposal_board') {
				return { structuredContent: options.board ?? onePerFamily };
			}
			if (suffix === 'proposals_state_health') {
				return {
					structuredContent: {
						locks: { active: 1 },
						queue: { waiterOrphans: 0 },
						registry: { orphans: 0 },
						healthy: true,
					},
				};
			}
			if (suffix === 'proposals_compact_status') {
				return { structuredContent: { locks: { active: 1 } } };
			}
			if (suffix === 'proposals_proposal_stale_list') {
				return { structuredContent: { ok: true, count: 0 } };
			}
			if (suffix === 'proposals_proposal_diagnose') {
				const id = (input.arguments as { id?: string }).id;
				return { structuredContent: { ok: true, id, folder: 'ready' } };
			}
			if (suffix === 'logs_tail') {
				return { structuredContent: { events: [] } };
			}
			return { structuredContent: {} };
		},
	});

const groupNodes = (nodes: readonly IProposalNode[]) =>
	nodes.filter((n) => n.nodeType === 'group');

describe('proposals board e2e (f00097 S6)', () => {
	it('(a) renders every status group exactly once, one per family', async () => {
		const provider = new ProposalBoardProvider(stubClient());
		const roots = await provider.getChildren();
		const labels = groupNodes(roots).map((n) => n.label);
		expect(labels).toEqual([
			'Ready',
			'In progress',
			'Review',
			'Paused',
			'Blocked',
			'Done',
			'Retired',
		]);
		// Each group holds exactly its one proposal.
		for (const group of groupNodes(roots)) {
			expect(await provider.getChildren(group)).toHaveLength(1);
		}
	});

	it('(b) clicking a row opens the detail webview for that id', async () => {
		const source = new ProposalsSnapshotSource({ client: stubClient() });
		const provider = new ProposalBoardProvider(stubClient(), {
			snapshotSource: source,
		});

		const roots = await provider.getChildren();
		const inProgress = groupNodes(roots).find(
			(n) => n.label === 'In progress',
		);
		const [leaf] = await provider.getChildren(inProgress);
		expect(leaf?.command?.command).toBe('delendai.openProposal');
		const clickedId = leaf?.command?.arguments?.[0];
		expect(clickedId).toBe('f00002');

		// Dispatching that command opens a detail panel for the clicked id.
		const panels: Array<{ title: string; webview: { html: string } }> = [];
		const commands = new Map<
			string,
			(...args: readonly unknown[]) => unknown
		>();
		const vscode: ICommandVscodeApi = {
			ViewColumn: { One: 1 },
			commands: {
				registerCommand: (c, cb) => {
					commands.set(c, cb);
					return { dispose() {} };
				},
			},
			window: {
				createWebviewPanel: (_t, title) => {
					const panel = { title, webview: { html: '' } };
					panels.push(panel);
					return panel;
				},
				async showErrorMessage() {
					return undefined;
				},
			},
		};
		registerOpenProposalCommand({
			vscode,
			client: stubClient(),
			proposalsSource: source,
		});
		await commands.get('delendai.openProposal')?.(clickedId);
		expect(panels).toHaveLength(1);
		expect(panels[0]?.title).toContain('f00002');
		expect(panels[0]?.webview.html).toContain('f00002');
	});

	it('(c) refresh refetches; a filter change does not', async () => {
		let boardCalls = 0;
		const provider = new ProposalBoardProvider(
			stubClient({
				onCall: (name) => {
					if (name.endsWith('proposal_board')) boardCalls += 1;
				},
			}),
		);
		await provider.getChildren();
		provider.setFilters({ status: 'ready' }); // filter → no refetch
		await provider.getChildren();
		expect(boardCalls).toBe(1);
		provider.refresh(); // explicit refresh → refetch
		await provider.getChildren();
		expect(boardCalls).toBe(2);
	});

	it('(d) malformed board → banner; copyError copies valid JSON', async () => {
		const provider = new ProposalBoardProvider(
			stubClient({ board: { unexpected: 'shape' } }),
		);
		const roots = await provider.getChildren();
		const banner = roots.find((n) => n.nodeType === 'banner');
		expect(banner).toBeDefined();
		const raw = banner?.command?.arguments?.[0];
		expect(typeof raw).toBe('string');

		const clipboard: string[] = [];
		const commands = new Map<
			string,
			(...args: readonly unknown[]) => unknown
		>();
		const vscode = {
			ViewColumn: { One: 1 },
			commands: {
				registerCommand: (
					c: string,
					cb: (...a: readonly unknown[]) => unknown,
				) => {
					commands.set(c, cb);
					return { dispose() {} };
				},
			},
			window: {
				createWebviewPanel: () => ({ webview: { html: '' } }),
				async showInformationMessage() {
					return undefined;
				},
			},
			env: {
				clipboard: {
					async writeText(v: string) {
						clipboard.push(v);
					},
				},
			},
		} as unknown as ICommandVscodeApi;

		registerProposalsCopyErrorCommand({ vscode, client: stubClient() });
		await commands.get(PROPOSALS_COPY_ERROR_COMMAND)?.(raw);
		expect(clipboard).toHaveLength(1);
		// The copied payload is valid JSON (the offending board shape).
		expect(() => JSON.parse(clipboard[0] ?? '')).not.toThrow();
		expect(JSON.parse(clipboard[0] ?? '')).toEqual({ unexpected: 'shape' });
	});
});
