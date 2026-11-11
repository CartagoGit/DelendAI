/**
 * proposal-board-stage.spec.ts — the board shows each slice's stage, read
 * from its recorded fields, instead of `pending`, and counts per stage.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildProposalBoardRegistration } from '@delendai/proposals/lib/tools/proposal-board.tool';
import { createFakeToolServer } from '@delendai/test-kit/public';

interface IBoardSlice {
	readonly sliceId: string;
	readonly status: string;
	readonly written?: string;
	readonly acceptance?: number;
}

interface IBoardProposal {
	readonly id: string;
	readonly title?: string;
	readonly slices?: readonly IBoardSlice[];
	readonly stages?: string;
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
	'### S1 — handed in',
	'- **Status**: review',
	'- review-state: in_review',
	'- review-implementer: agent-a',
	'',
	'### S2 — sent back',
	'- **Status**: pending',
	'- shipped-in: `abc1234`',
	'- review-state: changes_requested',
	'- review-log: requested_changes by agent-b — fix it',
	'',
	'### S3 — delivered, not handed in',
	'- **Status**: pending',
	'- shipped-in: `abc1234`',
	'',
	'### S4 — not started',
	'- **Status**: pending',
	'',
].join('\n');

describe('proposal_board stages', () => {
	let root = '';
	let board: (args: object) => Promise<readonly IBoardProposal[]>;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), 'board-stage-'));
		const proposalsDirAbs = join(root, 'docs/delendai/proposals');
		for (const [folder, id, status] of [
			['in-progress', 'f00001', 'in-progress'],
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
			// No repository here: no commit is found on any branch.
			run: async () => ({ ok: false, output: '', reason: 'no git' }),
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

	it('shows the stage of each slice instead of pending, and counts them', async () => {
		const [proposal] = await board({ proposalId: 'f00001' });
		expect(
			proposal?.slices?.map((slice) => [slice.sliceId, slice.status]),
		).toEqual([
			['S1', 'in_review'],
			['S2', 'changes_requested'],
			['S3', 'implemented'],
			['S4', 'pending'],
		]);
		expect(proposal?.stages).toBe(
			'in_review 1, changes_requested 1, implemented 1, pending 1',
		);
	});

	it('leaves the brief board without stages', async () => {
		const [brief] = await board({});
		expect(brief).not.toHaveProperty('stages');
	});
});
