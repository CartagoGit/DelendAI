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

	it('[<12ms] throws on a failure the contract does not name, so the pass ends', async () => {
		const { forge } = harness(() => ({
			exitCode: 1,
			stderr: 'network down',
		}));
		await expect(forge.integrationTip()).rejects.toThrow('network down');
	});
});
