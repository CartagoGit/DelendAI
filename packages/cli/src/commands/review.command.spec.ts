/**
 * A review is four commands (x00727), on a real repository: the unit is
 * entered once and reused, the next proposal is claimed with the commit
 * `review_queue` reads, a verdict is recorded in the unit, and the queue
 * and verdict tools are the ones every other surface calls.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { reviewRoundCommand } from './review.command';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'review-cmd-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'review@example.com');
	git(root, 'config', 'user.name', 'Review');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, '.gitignore'), '.cache/\n');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

interface IQueueEntry {
	readonly id: string;
	readonly claimedBy?: readonly string[];
	readonly verdicts?: readonly string[];
}

/** A context whose tools answer from `queue`, recording every call. */
const contextFor = (
	root: string,
	queue: readonly IQueueEntry[],
	pack?: { readonly full: boolean; readonly size: number },
) => {
	const calls: { tool: string; args: Record<string, unknown> }[] = [];
	const ctx = fakePartial<ICliCommandContext, 'cwd' | 'globals' | 'request'>({
		cwd: root,
		globals: fakePartial<
			ICliCommandContext['globals'],
			'workspace' | 'json'
		>({ workspace: root, json: true }),
		request: async <T>(tool: string, args: object): Promise<T> => {
			calls.push({ tool, args: args as Record<string, unknown> });
			if (tool.endsWith('_review_queue')) {
				return {
					...(pack === undefined ? {} : { pack }),
					proposals: queue.map((entry) => ({
						id: entry.id,
						file: `docs/delendai/proposals/review/${entry.id}-a.md`,
						...(entry.claimedBy === undefined
							? {}
							: { claimedBy: entry.claimedBy }),
						slices: (entry.verdicts ?? ['needs-verdict']).map(
							(verdict, index) => ({
								sliceId: `S${String(index + 1)}`,
								title: 'the slice',
								verdict,
								implementer: 'claude-opus-5-5',
								gate: 'npx vitest run a.spec.ts',
								candidates: [{ commit: 'abc1234' }],
							}),
						),
					})),
				} as T;
			}
			if (tool.endsWith('_review_claim')) {
				// The plugin's review_claim, as its own spec pins it: a
				// claim commit in the checkout the call names.
				const { proposalId, checkout } = args as {
					proposalId: string;
					checkout: string;
				};
				git(
					checkout,
					'commit',
					'--allow-empty',
					'-q',
					'-m',
					`chore(review): claim ${proposalId}`,
					'--trailer',
					`Claims: ${proposalId}`,
				);
				return { ok: true, proposalId, claimed: true } as T;
			}
			return { ok: true, status: 'done' } as T;
		},
	});
	return { ctx, calls };
};

const run = (ctx: ICliCommandContext, ...args: string[]) =>
	reviewRoundCommand.run(args, ctx);

const claimsIn = (worktree: string): string =>
	git(
		worktree,
		'log',
		'--format=%(trailers:key=Claims,valueonly)',
		'develop..HEAD',
	)
		.split('\n')
		.filter((line) => line.trim().length > 0)
		.join('\n');

describe('delendai review', () => {
	it('enters the unit, claims the first free proposal, and says how to answer', async () => {
		const root = repo();
		const { ctx } = contextFor(root, [
			{ id: 'x00001', claimedBy: ['glm-5'] },
			{ id: 'x00002' },
		]);

		const result = await run(ctx, 'next', '--agent=minimax-m3');

		const answer = result.data as {
			worktree: string;
			session: string;
			proposal: string;
			slices: { slice: string; approve: string; changes: string }[];
		};
		expect(result.code).toBe(0);
		expect(answer.proposal).toBe('x00002');
		expect(claimsIn(answer.worktree)).toBe('x00002');
		expect(git(answer.worktree, 'branch', '--show-current')).toMatch(
			/^delendai\/wip\/minimax-m3\/review\/batch-all-g1\//u,
		);
		expect(answer.slices[0]?.approve).toContain(
			`delendai review approve x00002 S1 --agent=minimax-m3 --session=${answer.session} --commit=abc1234`,
		);
		expect(answer.slices[0]?.changes).toContain('review changes x00002 S1');
	});

	it('finishes the proposal it claimed before taking another', async () => {
		const root = repo();
		const first = contextFor(root, [{ id: 'x00002' }, { id: 'x00003' }]);
		const started = (await run(first.ctx, 'next', '--agent=minimax-m3'))
			.data as { session: string; worktree: string };

		const again = contextFor(root, [{ id: 'x00002' }, { id: 'x00003' }]);
		const resumed = (
			await run(
				again.ctx,
				'next',
				'--agent=minimax-m3',
				`--session=${started.session}`,
			)
		).data as { proposal: string; worktree: string };

		expect(resumed.proposal).toBe('x00002');
		expect(resumed.worktree).toBe(started.worktree);
		expect(claimsIn(started.worktree)).toBe('x00002');
	});

	it('takes the next one once its own claim has no slice left to judge', async () => {
		const root = repo();
		const first = contextFor(root, [{ id: 'x00002' }, { id: 'x00003' }]);
		const started = (await run(first.ctx, 'next', '--agent=minimax-m3'))
			.data as { session: string; worktree: string };

		const judged = contextFor(root, [
			{ id: 'x00002', verdicts: ['approved'] },
			{ id: 'x00003' },
		]);
		const moved = (
			await run(
				judged.ctx,
				'next',
				'--agent=minimax-m3',
				`--session=${started.session}`,
			)
		).data as { proposal: string };

		expect(moved.proposal).toBe('x00003');
		expect(claimsIn(started.worktree).split('\n').sort()).toEqual([
			'x00002',
			'x00003',
		]);
	});

	it('records a verdict in the unit, with its evidence', async () => {
		const root = repo();
		const { ctx, calls } = contextFor(root, [{ id: 'x00002' }]);
		const started = (await run(ctx, 'next', '--agent=minimax-m3')).data as {
			session: string;
			worktree: string;
		};

		const approved = await run(
			ctx,
			'approve',
			'x00002',
			'S1',
			'--agent=minimax-m3',
			`--session=${started.session}`,
			'--note=gate green, acceptance met',
			'--commit=abc1234',
			'--validate-exit=0',
			'--tests-passing=12',
			'--tests-total=12',
		);
		const changes = await run(
			ctx,
			'changes',
			'x00002',
			'S1',
			'--agent=minimax-m3',
			`--session=${started.session}`,
			'--note=the acceptance names a flag nothing reads',
		);

		const verdicts = calls.filter((call) =>
			call.tool.endsWith('_proposal_review'),
		);
		expect(approved.code).toBe(0);
		expect(changes.code).toBe(0);
		expect(verdicts.map((call) => call.args)).toEqual([
			{
				proposalId: 'x00002',
				sliceId: 'S1',
				action: 'approve',
				agent: 'minimax-m3',
				note: 'gate green, acceptance met',
				evidence: {
					commitHash: 'abc1234',
					validateExitCode: 0,
					testsPassing: 12,
					testsTotal: 12,
				},
				commitHash: 'abc1234',
				checkout: started.worktree,
			},
			{
				proposalId: 'x00002',
				sliceId: 'S1',
				action: 'request_changes',
				agent: 'minimax-m3',
				note: 'the acceptance names a flag nothing reads',
				checkout: started.worktree,
			},
		]);
	});

	it('says when nothing waits for a verdict, and how to publish', async () => {
		const root = repo();
		const { ctx } = contextFor(root, [
			{ id: 'x00001', claimedBy: ['glm-5'] },
		]);

		const result = await run(ctx, 'next', '--agent=minimax-m3');

		expect(result.code).toBe(0);
		expect((result.data as { next: string }).next).toContain(
			'Nothing is waiting',
		);
		expect(JSON.stringify(result.data)).not.toContain('published');
	});

	it('publishes a full pack and goes on in a new unit', async () => {
		const root = repo();
		const remote = mkdtempSync(join(tmpdir(), 'review-remote-'));
		roots.push(remote);
		git(remote, 'init', '-q', '--bare', '-b', 'develop');
		git(root, 'remote', 'add', 'origin', remote);
		git(root, 'push', '-q', 'origin', 'develop');
		const first = contextFor(root, [{ id: 'x00002' }]);
		const started = (await run(first.ctx, 'next', '--agent=minimax-m3'))
			.data as { session: string; unit: string };
		const full = contextFor(root, [{ id: 'x00003' }], {
			full: true,
			size: 5,
		});

		const next = await run(
			full.ctx,
			'next',
			'--agent=minimax-m3',
			`--session=${started.session}`,
		);

		expect(next.code).toBe(0);
		const unit = started.unit.replace(/^refs\/heads\//u, '');
		expect(git(root, 'branch', '--list', unit)).toBe('');
		expect((next.data as { proposal?: string }).proposal).toBe('x00003');
	});

	it('publishes the unit through work publish', async () => {
		const root = repo();
		const { ctx } = contextFor(root, [{ id: 'x00002' }]);
		const started = (await run(ctx, 'next', '--agent=minimax-m3')).data as {
			session: string;
			unit: string;
		};

		const finished = await run(
			ctx,
			'finish',
			'--agent=minimax-m3',
			`--session=${started.session}`,
		);

		expect(JSON.stringify(finished)).toContain(
			started.unit.replace(/^refs\/heads\//u, ''),
		);
	});

	it('asks for what it needs before doing anything', async () => {
		const root = repo();
		const { ctx, calls } = contextFor(root, []);
		const previous = process.env.DELENDAI_AGENT_ID;
		delete process.env.DELENDAI_AGENT_ID;
		try {
			for (const args of [
				['next'],
				['approve', 'x00002', 'S1', '--agent=a'],
				['changes', 'x00002', '--agent=a', '--note=n'],
				['finish'],
				['bogus'],
				[],
			]) {
				expect((await run(ctx, ...args)).code, args.join(' ')).toBe(2);
			}
		} finally {
			if (previous !== undefined)
				process.env.DELENDAI_AGENT_ID = previous;
		}
		expect(calls).toEqual([]);
	});
});
