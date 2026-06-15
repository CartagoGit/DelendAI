import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';

import {
	buildCloseSliceRegistration,
	buildCreateProposalRegistration,
	buildProposalBoardRegistration,
	type IAuthoringToolOptions,
} from '@cartago-git/mcp-proposals/lib/tools/authoring.tool';

const capture = async (
	reg: IToolRegistration
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};
const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

describe('proposal authoring (create → board → close)', () => {
	let root = '';
	let opts: IAuthoringToolOptions;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'authoring-'));
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/proposals'),
			indexPathAbs: join(root, 'docs/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
		};
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('creates a proposal with disjoint slices, lists it on the board, and closes a slice', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({
				id: 'p1',
				title: 'Add login',
				goal: 'Login flow',
				slices: [
					{ sliceId: 's1', files: ['src/a.ts'], acceptance: ['bun test'] },
					{ sliceId: 's2', files: ['src/b.ts'] },
				],
			})
		);
		expect(created.ok).toBe(true);
		expect(created.file).toBe('p1-add-login.md');

		const board = await capture(buildProposalBoardRegistration(opts));
		const view = parse(await board({}));
		const p1 = view.proposals.find((p: { id: string }) => p.id === 'p1');
		expect(p1.slices.map((s: { sliceId: string }) => s.sliceId)).toEqual([
			's1',
			's2',
		]);
		expect(p1.claimableSliceIds).toContain('s1');

		const close = await capture(buildCloseSliceRegistration(opts));
		const closed = parse(
			await close({ proposalId: 'p1', sliceId: 's1', releaseLock: false })
		);
		expect(closed.closed).toBe(true);
		const doc = readFileSync(join(opts.proposalsDirAbs, 'p1-add-login.md'), 'utf8');
		expect(doc).toMatch(/### s1[\s\S]*?- status: done/);
	});

	it('rejects overlapping slices', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const out = parse(
			await create({
				id: 'p2',
				title: 'Bad',
				slices: [
					{ sliceId: 's1', files: ['x.ts'] },
					{ sliceId: 's2', files: ['x.ts'] },
				],
			})
		);
		expect(out.ok).toBe(false);
		expect(out.error.reason).toMatch(/share files/);
	});
});
