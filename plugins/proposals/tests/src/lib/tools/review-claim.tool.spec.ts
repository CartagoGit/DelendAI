/**
 * review-claim.tool.spec.ts — a reviewer takes a proposal in its own unit,
 * through a tool any host can call (x00737), on a real repository.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bindWriteRoot } from '@delendai/core/lib/shared/bind-write-root';
import { createFakeToolServer } from '@delendai/test-kit';

import { buildReviewClaimRegistration } from '@delendai/proposals/lib/tools/review-claim.tool';

import { createReviewRepo, type IReviewRepo } from './review-repo';

let repo: IReviewRepo;
const dirs: string[] = [];

beforeEach(() => {
	repo = createReviewRepo();
});

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
	repo.cleanup();
});

/** A reviewer's unit: its own worktree on a review work ref. */
const unit = (agent: string, generation = 1): string => {
	const parent = realpathSync(mkdtempSync(join(tmpdir(), 'claim-unit-')));
	dirs.push(parent);
	const path = join(parent, 'wt');
	repo.git(
		'worktree',
		'add',
		'-q',
		'-b',
		`delendai/wip/${agent}/review/batch-all-g${String(generation)}/backlog`,
		path,
		'develop',
	);
	return path;
};

const claimTool = async () => {
	let handler: ((args: unknown) => Promise<unknown>) | undefined;
	await bindWriteRoot(
		buildReviewClaimRegistration(repo.options()),
		repo.root,
	).register(
		createFakeToolServer({
			onRegisterTool: (registered) => {
				handler = registered.handler as typeof handler;
			},
		}),
	);
	if (handler === undefined) throw new Error('review_claim did not register');
	const call = handler;
	return async (args: Record<string, unknown>) =>
		(await call(args)) as {
			readonly isError?: boolean;
			readonly structuredContent: Record<string, unknown>;
		};
};

const claimsIn = (worktree: string): readonly string[] =>
	execFileSync(
		'git',
		['log', '--format=%(trailers:key=Claims,valueonly)', 'develop..HEAD'],
		{ cwd: worktree, encoding: 'utf8' },
	)
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

describe('review_claim', () => {
	it('claims a proposal in the unit the call names, once', async () => {
		const mine = unit('glm-5');
		const claim = await claimTool();

		const first = await claim({
			proposalId: 'x00001',
			agent: 'glm-5',
			checkout: mine,
		});
		const again = await claim({
			proposalId: 'x00001',
			agent: 'glm-5',
			checkout: mine,
		});

		expect(first.structuredContent).toMatchObject({
			proposalId: 'x00001',
			claimed: true,
		});
		expect(again.structuredContent).toMatchObject({ claimed: false });
		expect(claimsIn(mine)).toEqual(['x00001']);
		expect(
			execFileSync('git', ['log', '-1', '--format=%s'], {
				cwd: mine,
				encoding: 'utf8',
			}).trim(),
		).toBe('chore(review): claim x00001');
	});

	it('commits the claim alone, leaving what was staged staged', async () => {
		const mine = unit('glm-5');
		writeFileSync(join(mine, 'notes.md'), 'draft\n');
		execFileSync('git', ['add', 'notes.md'], { cwd: mine });
		const claim = await claimTool();

		const taken = await claim({
			proposalId: 'x00001',
			agent: 'glm-5',
			checkout: mine,
		});

		expect(taken.structuredContent).toMatchObject({ claimed: true });
		expect(
			execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], {
				cwd: mine,
				encoding: 'utf8',
			}).trim(),
		).toBe('');
		expect(
			execFileSync('git', ['status', '--porcelain'], {
				cwd: mine,
				encoding: 'utf8',
			}).trim(),
		).toBe('A  notes.md');
	});

	it('refuses a sixth proposal until the pack is published', async () => {
		const mine = unit('glm-5');
		const claim = await claimTool();
		for (const id of ['x00001', 'x00002', 'x00003', 'x00004', 'x00005']) {
			const taken = await claim({
				proposalId: id,
				agent: 'glm-5',
				checkout: mine,
			});
			expect(taken.isError).not.toBe(true);
		}

		const sixth = await claim({
			proposalId: 'x00006',
			agent: 'glm-5',
			checkout: mine,
		});
		const again = await claim({
			proposalId: 'x00005',
			agent: 'glm-5',
			checkout: mine,
		});

		expect(sixth.isError).toBe(true);
		expect(JSON.stringify(sixth.structuredContent)).toContain('full pack');
		expect(JSON.stringify(sixth.structuredContent)).toContain(
			'Publish the pack',
		);
		expect(again.structuredContent).toMatchObject({ claimed: false });
		expect(claimsIn(mine)).toHaveLength(5);
	});

	it('refuses a proposal another reviewer holds', async () => {
		const theirs = unit('qwen');
		execFileSync(
			'git',
			[
				'commit',
				'--allow-empty',
				'-q',
				'-m',
				'chore(review): claim x00002',
				'--trailer',
				'Claims: x00002',
			],
			{ cwd: theirs },
		);
		const mine = unit('glm-5');
		const claim = await claimTool();

		const refused = await claim({
			proposalId: 'x00002',
			agent: 'glm-5',
			checkout: mine,
		});

		expect(refused.isError).toBe(true);
		expect(JSON.stringify(refused.structuredContent)).toContain('qwen');
		expect(claimsIn(mine)).toEqual([]);
	});

	it('refuses a proposal another instance of the same model holds (x00739)', async () => {
		const first = unit('minimax-m3', 1);
		const second = unit('minimax-m3', 2);
		const claim = await claimTool();

		const taken = await claim({
			proposalId: 'x00001',
			agent: 'minimax-m3',
			checkout: first,
		});
		const refused = await claim({
			proposalId: 'x00001',
			agent: 'minimax-m3',
			checkout: second,
		});

		expect(taken.structuredContent).toMatchObject({ claimed: true });
		expect(refused.isError).toBe(true);
		expect(claimsIn(second)).toEqual([]);
	});
});
