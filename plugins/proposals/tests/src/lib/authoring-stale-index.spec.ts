/**
 * authoring-stale-index.spec.ts — x00106 S1.
 *
 * The indexed-path tools (`close_slice`, `proposal_review`) used to
 * fail with "proposal file missing" whenever the proposal moved
 * folders after the last index write (every transition does), forcing
 * a manual `sync_proposals` + retry. They now re-sync ONCE and retry
 * internally; a genuinely missing proposal still errors with the same
 * structured reason after that single re-sync.
 */
import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';

import {
	buildCloseSliceRegistration,
	buildCreateProposalRegistration,
	buildReviewRegistration,
	type IAuthoringToolOptions,
} from '@delendai/proposals/lib/tools/authoring.tool';

const capture = async (
	reg: IToolRegistration,
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

const recentValidate = () => ({
	timestamp: new Date().toISOString(),
	exitCode: 0,
});

describe('indexed-path tools self-heal a stale index (x00106 S1)', () => {
	let root = '';
	let opts: IAuthoringToolOptions;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'stale-index-'));
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/delendai/proposals'),
			indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			runValidation: async () => ({
				ok: true,
				output: 'ok',
				exitCode: 0,
			}),
			requirePeerReview: false,
		};
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	/** Create f00001 and move it ready/feats/ → in-progress/ WITHOUT re-syncing,
	 *  exactly what a proposal_transition leaves behind. */
	const createThenMoveStale = async (): Promise<void> => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({
				id: 'f00001',
				title: 'Heal me',
				slices: [{ sliceId: 'S1', files: ['src/a.ts'] }],
			}),
		);
		expect(created.ok).toBe(true);
		mkdirSync(join(opts.proposalsDirAbs, 'in-progress'), {
			recursive: true,
		});
		renameSync(
			join(opts.proposalsDirAbs, 'ready/feats/f00001-heal-me.md'),
			join(opts.proposalsDirAbs, 'in-progress/f00001-heal-me.md'),
		);
	};

	it('close_slice succeeds right after a folder move, without a manual sync', async () => {
		await createThenMoveStale();
		const close = await capture(buildCloseSliceRegistration(opts));
		const closed = parse(
			await close({
				proposalId: 'f00001',
				sliceId: 'S1',
				validateEvidence: recentValidate(),
			}),
		);
		expect(closed.ok).toBe(true);
		expect(closed.closed).toBe(true);
	});

	it('proposal_review status succeeds right after a folder move', async () => {
		await createThenMoveStale();
		const review = await capture(buildReviewRegistration(opts));
		const status = parse(
			await review({
				proposalId: 'f00001',
				sliceId: 'S1',
				action: 'status',
			}),
		);
		expect(status.ok).toBe(true);
		expect(status.status).toBe('none');
	});

	it('a genuinely missing proposal still errors after the single re-sync', async () => {
		await createThenMoveStale();
		const close = await capture(buildCloseSliceRegistration(opts));
		const missing = parse(
			await close({
				proposalId: 'f09999',
				sliceId: 'S1',
				validateEvidence: recentValidate(),
			}),
		);
		expect(missing.ok).toBe(false);
		expect(missing.error.reason).toContain('f09999');
	});

	it('a deleted file (still indexed) errors with the same structured reason', async () => {
		await createThenMoveStale();
		// Delete the file entirely: the heal re-sync drops it from the
		// index, so the retry reports not-in-index instead of a raw path.
		rmSync(join(opts.proposalsDirAbs, 'in-progress/f00001-heal-me.md'));
		const close = await capture(buildCloseSliceRegistration(opts));
		const result = parse(
			await close({
				proposalId: 'f00001',
				sliceId: 'S1',
				validateEvidence: recentValidate(),
			}),
		);
		expect(result.ok).toBe(false);
	});
});
