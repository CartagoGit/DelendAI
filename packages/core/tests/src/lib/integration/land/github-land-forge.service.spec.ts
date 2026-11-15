/**
 * github-land-forge.service.spec.ts — the GitHub adapter turns each land
 * call into one REST call and reads the forge's refusals as answers.
 */
import { describe, expect, it } from 'vitest';

import { createGithubLandForge } from '@delendai/core/lib/integration/land/github-land-forge.service';
import type { ILandCommandRunner } from '@delendai/core/lib/integration/land/land.interface';

type IReply = { exitCode: number; stdout?: string; stderr?: string };

const harness = (answer: (call: string) => IReply) => {
	const calls: string[] = [];
	const run: ILandCommandRunner = async (args) => {
		const call = args
			.filter((arg) => arg !== 'api' && arg !== '--method')
			.join(' ');
		calls.push(call);
		const reply = answer(call);
		return { stdout: '', stderr: '', ...reply };
	};
	const forge = createGithubLandForge({
		slug: 'o/r',
		integration: 'develop',
		mergeMethod: 'squash',
		run,
	});
	return { forge, calls };
};

const json = (value: unknown): IReply => ({
	exitCode: 0,
	stdout: JSON.stringify(value),
});

const rawPull = {
	number: 7,
	state: 'open',
	draft: false,
	body: null,
	labels: [{ name: 'a' }],
	head: { ref: 'x/y', sha: 'abc' },
};

describe('the GitHub land forge', () => {
	it('[<12ms] reads a pull request with its tested base and labels', async () => {
		const { forge } = harness((call) =>
			call.includes('compare/')
				? json({ merge_base_commit: { sha: 'base1' } })
				: json(rawPull),
		);
		expect(await forge.pullRequest(7)).toEqual({
			number: 7,
			headRef: 'x/y',
			headSha: 'abc',
			draft: false,
			state: 'open',
			merged: false,
			labels: ['a'],
			body: '',
			testedBase: 'base1',
		});
	});

	it('[<12ms] lists open pull requests but not batches, and batches by prefix', async () => {
		const { forge } = harness((call) => {
			if (call.includes('compare/')) {
				return json({ merge_base_commit: { sha: 'b' } });
			}
			return json([
				rawPull,
				{
					...rawPull,
					number: 8,
					head: { ref: 'ns/queue/batch-1+2', sha: 'z' },
				},
			]);
		});
		expect((await forge.openPullRequests()).map((p) => p.number)).toEqual([
			7,
		]);
		expect(
			(await forge.batchPullRequests('ns/queue/')).map((p) => p.number),
		).toEqual([8]);
	});

	it('[<12ms] reads every page of pull requests and check runs', async () => {
		const pullsOn = (page: number) =>
			Array.from({ length: page === 1 ? 100 : 1 }, (_, i) => ({
				...rawPull,
				number: page * 1000 + i,
			}));
		const { forge, calls } = harness((call) => {
			if (call.includes('compare/'))
				return json({ merge_base_commit: { sha: 'b' } });
			const page = Number(/[?&]page=(\d+)/u.exec(call)?.[1]);
			if (call.includes('check-runs'))
				return json({
					check_runs: Array.from(
						{ length: page === 1 ? 100 : 2 },
						(_, i) => ({
							name: `c${String(page)}-${String(i)}`,
							conclusion: 'success',
						}),
					),
				});
			return json(pullsOn(page));
		});
		expect(await forge.openPullRequests()).toHaveLength(101);
		expect(await forge.checks('abc')).toHaveLength(102);
		expect(calls.some((call) => call.includes('page=2'))).toBe(true);
		expect(calls.some((call) => call.includes('page=3'))).toBe(false);
	});

	it('[<12ms] reads the tip, the required checks and a head’s check runs', async () => {
		const { forge } = harness((call) => {
			if (call.includes('repos/o/r/branches/develop')) {
				return json({ commit: { sha: 'tip1' } });
			}
			if (call.includes('/rules/branches/')) {
				return json([
					{
						type: 'required_status_checks',
						parameters: {
							required_status_checks: [{ context: 'ci' }],
						},
					},
					{ type: 'deletion' },
				]);
			}
			return json({
				check_runs: [
					{ name: 'ci', conclusion: 'success', html_url: 'u' },
				],
			});
		});
		expect(await forge.integrationTip()).toBe('tip1');
		expect(await forge.requiredChecks()).toEqual(['ci']);
		expect(await forge.checks('abc')).toEqual([
			{ name: 'ci', conclusion: 'success', url: 'u' },
		]);
	});

	it('[<12ms] merges pinned to the head with the policy’s merge method', async () => {
		const { forge, calls } = harness(() => json({}));
		expect(await forge.merge(7, 'abc')).toBe('merged');
		expect(calls[0]).toContain('PUT repos/o/r/pulls/7/merge');
		expect(calls[0]).toContain('sha=abc');
		expect(calls[0]).toContain('merge_method=squash');
	});

	it('[<12ms] starts a workflow on a branch, and says when the forge refused', async () => {
		const { forge, calls } = harness(() => ({ exitCode: 0, stdout: '' }));
		expect(await forge.dispatchWorkflow('codeql.yml', 'develop')).toBe(
			true,
		);
		expect(calls[0]).toContain(
			'POST repos/o/r/actions/workflows/codeql.yml/dispatches',
		);
		expect(calls[0]).toContain('ref=develop');
		const refused = harness(() => ({
			exitCode: 1,
			stderr: 'gh: HTTP 422',
		}));
		expect(
			await refused.forge.dispatchWorkflow('surface.yml', 'develop'),
		).toBe(false);
	});

	it('[<12ms] reads 409 as a moved head and any other refusal as refused', async () => {
		const status = (code: number) =>
			harness(() => ({
				exitCode: 1,
				stderr: `gh: HTTP ${String(code)}`,
			}));
		expect(await status(409).forge.merge(7, 'abc')).toBe('head-moved');
		expect(await status(405).forge.merge(7, 'abc')).toBe('refused');
	});

	it('[<12ms] reads who pushed a head, and offers no forge-side update', async () => {
		const { forge } = harness((call) => {
			if (call.includes('compare/'))
				return json({ merge_base_commit: { sha: 'b' } });
			if (call.includes('commits/abc'))
				return json({ author: { login: 'github-actions[bot]' } });
			return json(rawPull);
		});
		expect((await forge.pullRequest(7)).headAuthor).toBe(
			'github-actions[bot]',
		);
		expect('updateBranch' in forge).toBe(false);
	});

	it('[<12ms] labels, unlabels, comments, opens, edits and closes', async () => {
		const { forge, calls } = harness((call) =>
			call.startsWith('POST repos/o/r/pulls')
				? json({ number: 9 })
				: json({}),
		);
		await forge.addLabel(7, 'delendai:culprit');
		await forge.removeLabel(7, 'delendai:culprit');
		await forge.comment(7, 'hi');
		expect(
			await forge.openPullRequest({ head: 'h', title: 't', body: 'b' }),
		).toBe(9);
		await forge.updatePullRequest(9, 'new');
		await forge.closePullRequest(9);
		expect(calls).toEqual([
			expect.stringContaining('POST repos/o/r/issues/7/labels'),
			expect.stringContaining(
				'DELETE repos/o/r/issues/7/labels/delendai%3Aculprit',
			),
			expect.stringContaining('POST repos/o/r/issues/7/comments'),
			expect.stringContaining('POST repos/o/r/pulls'),
			expect.stringContaining('PATCH repos/o/r/pulls/9 -f body=new'),
			expect.stringContaining('PATCH repos/o/r/pulls/9 -f state=closed'),
		]);
	});

	it('[<12ms] reads the text of every comment on a pull request', async () => {
		const { forge, calls } = harness(() =>
			json([{ body: 'one' }, { body: null }, { body: 'two' }]),
		);
		expect(await forge.comments(7)).toEqual(['one', '', 'two']);
		expect(calls[0]).toContain('GET repos/o/r/issues/7/comments');
	});

	it('[<12ms] throws on a failure the contract does not name, so the pass ends', async () => {
		const { forge } = harness(() => ({
			exitCode: 1,
			stderr: 'network down',
		}));
		await expect(forge.integrationTip()).rejects.toThrow('network down');
	});

	it('[<12ms] closes and reopens a pull request once per head, reading the forge', async () => {
		const events =
			(reopenedAt?: string) =>
			(call: string): IReply =>
				call.includes('/events')
					? json(
							reopenedAt === undefined
								? [{ event: 'labeled' }]
								: [
										{
											event: 'reopened',
											created_at: reopenedAt,
										},
									],
						)
					: call.includes('commits/')
						? json({
								commit: {
									committer: { date: '2026-11-14T10:00:00Z' },
								},
							})
						: json({});
		const fresh = harness(events());
		expect(await fresh.forge.reopenPullRequest(7, 'abc')).toBe(true);
		expect(fresh.calls.slice(-2)).toEqual([
			expect.stringContaining('PATCH repos/o/r/pulls/7 -f state=closed'),
			expect.stringContaining('PATCH repos/o/r/pulls/7 -f state=open'),
		]);
		const stale = harness(events('2026-11-14T09:00:00Z'));
		expect(await stale.forge.reopenPullRequest(7, 'abc')).toBe(true);
		const done = harness(events('2026-11-14T11:00:00Z'));
		expect(await done.forge.reopenPullRequest(7, 'abc')).toBe(false);
		expect(done.calls.some((call) => call.includes('PATCH'))).toBe(false);
	});
});
