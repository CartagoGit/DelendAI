/**
 * proposal-board-progress.spec.ts — the board answers whoever watches the
 * work: every open proposal, with what each slice's document says.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildProposalBoardRegistration } from '@delendai/proposals/lib/tools/proposal-board.tool';
import { createFakeToolServer } from '@delendai/test-kit/public';

interface IBoardSlice {
	readonly sliceId: string;
	readonly written?: string;
	readonly acceptance?: number;
}

interface IBoardProposal {
	readonly id: string;
	readonly title?: string;
	readonly slices?: readonly IBoardSlice[];
}

/** The text a tool answered with, whatever else its result carries. */
const asToolText = (
	result: unknown,
): { readonly content: readonly { readonly text?: string }[] } => {
	const content =
		typeof result === 'object' && result !== null && 'content' in result
			? result.content
			: [];
	return { content: Array.isArray(content) ? content : [] };
};

const proposal = (id: string, status: string, slices: string): string =>
	`---\nid: ${id}\ntitle: "Title of ${id}"\nkind: feat\nstatus: ${status}\n---\n\n# ${id}\n\n## Slices\n\n${slices}`;

const SLICES = [
	'### S1 — first',
	'- **Status**: review',
	'- acceptance:',
	'  - "one"',
	'  - "two"',
	'',
	'### S2 — second',
	'- **Status**: pending',
	'',
].join('\n');

describe('proposal_board { progress: true }', () => {
	let root = '';
	let board: (args: object) => Promise<readonly IBoardProposal[]>;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), 'board-progress-'));
		const proposalsDirAbs = join(root, 'docs/delendai/proposals');
		for (const [folder, id, status] of [
			['in-progress', 'f00001', 'in-progress'],
			['review', 'f00002', 'review'],
			['blocked', 'f00003', 'blocked'],
			['done/feats', 'f00004', 'done'],
		] as const) {
			mkdirSync(join(proposalsDirAbs, folder), { recursive: true });
			writeFileSync(
				join(proposalsDirAbs, folder, `${id}-fixture.md`),
				proposal(id, status, SLICES),
			);
		}
		mkdirSync(join(root, '.cache/delendai/proposals'), { recursive: true });
		let handler: ((args: object) => Promise<unknown>) | undefined;
		await buildProposalBoardRegistration({
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs,
			indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
		}).register(
			createFakeToolServer({
				onRegisterTool: (call) => {
					handler = (args) => Promise.resolve(call.handler(args));
				},
			}),
		);
		board = async (args) => {
			if (handler === undefined)
				throw new Error('the board never registered');
			const result = asToolText(await handler(args));
			const parsed = JSON.parse(result.content[0]?.text ?? '{}') as {
				readonly proposals?: readonly IBoardProposal[];
			};
			return parsed.proposals ?? [];
		};
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('lists every open proposal, the ones in review or blocked included', async () => {
		expect(
			(await board({ progress: true })).map((p) => p.id).sort(),
		).toEqual(['f00001', 'f00002', 'f00003']);
		// What can be claimed is still only what the plain board lists.
		expect((await board({})).map((p) => p.id)).toEqual(['f00001']);
	});

	it('gives the title and, per slice, the written status and the acceptance count', async () => {
		const [first] = (await board({ progress: true })).filter(
			(p) => p.id === 'f00001',
		);
		expect(first?.title).toBe('Title of f00001');
		expect(first?.slices).toMatchObject([
			{ sliceId: 'S1', written: 'review', acceptance: 2 },
			{ sliceId: 'S2', written: 'pending', acceptance: 0 },
		]);
	});

	it('adds none of it to the board an orchestrator asks for', async () => {
		const [detailed] = await board({ detail: true });
		expect(detailed?.title).toBeUndefined();
		expect(detailed?.slices?.[0]).not.toHaveProperty('written');
		expect(detailed?.slices?.[0]).not.toHaveProperty('acceptance');
	});
});
