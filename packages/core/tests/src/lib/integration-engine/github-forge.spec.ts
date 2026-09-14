/**
 * github-forge.spec.ts — the adapter that actually opens and merges the
 * pull requests this whole model depends on, driven by a fake `gh`.
 *
 * It was at 7.6% statement coverage, which for the component that lands
 * work on the integration branch is not a number, it is a warning. The
 * properties below are the ones where being wrong costs something real:
 * writing when asked not to, merging onto a base that moved, and
 * counting a reviewer twice.
 */
import { describe, expect, it } from 'vitest';

import type { IExternalToolRun } from '@delendai/core/lib/contracts/interfaces/external-tool.interface';
import { createGithubIntegrationForge } from '@delendai/core/lib/integration-engine/github-forge';

const TARGET = {
	forge: 'github',
	owner: 'CartagoGit',
	repository: 'DelendAI',
	remote: 'origin',
} as const;

const ran = (stdout: string, ok = true): IExternalToolRun => ({
	ok,
	code: ok ? 0 : 1,
	stdout,
	stderr: '',
	timedOut: false,
	unavailable: false,
});

/**
 * A `gh` that answers from a table keyed by a substring of the path, and
 * records every invocation. Anything unlisted answers as a failed run —
 * so a spec that forgets to stub something sees a refusal rather than a
 * silent success.
 *
 * The LONGEST matching key wins, which is not a detail: the reviews path
 * is `…/pulls/1/reviews`, so a first-match fake answers it with the pull
 * request list and the approval count silently reads zero. That fake
 * would have made a spec about counting votes pass for the wrong reason.
 */
const fakeGh = (routes: Readonly<Record<string, IExternalToolRun>>) => {
	const calls: string[][] = [];
	const exec = async (input: {
		readonly args?: readonly string[] | undefined;
	}): Promise<IExternalToolRun> => {
		const args = [...(input.args ?? [])];
		calls.push(args);
		const path = args.at(-1) ?? '';
		const key = Object.keys(routes)
			.filter((route) => path.includes(route))
			.sort((a, b) => b.length - a.length)[0];
		return key === undefined ? ran('', false) : routes[key]!;
	};
	return { exec, calls };
};

describe('the GitHub integration forge', () => {
	it('refuses to write before it calls anything, when mutations are off', async () => {
		// Read-only must mean "no request left this process", not "the
		// request was made and the answer discarded".
		const gh = fakeGh({});
		const forge = createGithubIntegrationForge({ exec: gh.exec });

		expect(forge.mutationsEnabled).toBe(false);
		expect(
			await forge.openPullRequest({
				target: TARGET,
				headBranch: 'delendai/pr/x',
				baseBranch: 'develop',
				title: 't',
				body: 'b',
			}),
		).toBeUndefined();
		expect(gh.calls).toEqual([]);
	});

	it('reads a branch tip, and reports nothing rather than an empty sha', async () => {
		const found = createGithubIntegrationForge({
			exec: fakeGh({
				'git/ref/heads/develop': ran(
					JSON.stringify({ object: { sha: 'a'.repeat(40) } }),
				),
			}).exec,
		});
		expect(
			await found.readIntegrationHead({
				target: TARGET,
				branch: 'develop',
			}),
		).toEqual({ branch: 'develop', sha: 'a'.repeat(40) });

		// A ref whose body carries no sha is absent, not a head with ''.
		const empty = createGithubIntegrationForge({
			exec: fakeGh({ 'git/ref/heads/develop': ran('{}') }).exec,
		});
		expect(
			await empty.readIntegrationHead({
				target: TARGET,
				branch: 'develop',
			}),
		).toBeUndefined();
	});

	it('survives output that is not JSON at all', async () => {
		// `gh` printing a warning, a proxy returning HTML: neither should
		// reach a caller as an exception.
		const forge = createGithubIntegrationForge({
			exec: fakeGh({ 'git/ref/heads/develop': ran('<html>nope') }).exec,
		});
		expect(
			await forge.readIntegrationHead({
				target: TARGET,
				branch: 'develop',
			}),
		).toBeUndefined();
	});

	it('prefers the open pull request when the branch has several', async () => {
		const forge = createGithubIntegrationForge({
			exec: fakeGh({
				pulls: ran(
					JSON.stringify([
						{
							number: 70,
							state: 'closed',
							head: { ref: 'x', sha: 'b'.repeat(40) },
							base: { ref: 'develop' },
						},
						{
							number: 72,
							state: 'open',
							head: { ref: 'x', sha: 'c'.repeat(40) },
							base: { ref: 'develop' },
						},
					]),
				),
				reviews: ran('[]'),
			}).exec,
		});

		const found = await forge.findPullRequest({
			target: TARGET,
			headBranch: 'x',
			baseBranch: 'develop',
		});
		expect(found?.number).toBe(72);
		expect(found?.state).toBe('open');
	});

	it('counts one vote per reviewer, and the latest one', async () => {
		// A reviewer who approved and then asked for changes has not
		// approved. Counting rows instead of reviewers would merge work
		// somebody explicitly objected to.
		const forge = createGithubIntegrationForge({
			exec: fakeGh({
				pulls: ran(
					JSON.stringify([
						{
							number: 1,
							state: 'open',
							head: { ref: 'x', sha: 'd'.repeat(40) },
							base: { ref: 'develop' },
						},
					]),
				),
				reviews: ran(
					JSON.stringify([
						{ user: { login: 'ana' }, state: 'APPROVED' },
						{ user: { login: 'ana' }, state: 'CHANGES_REQUESTED' },
						{ user: { login: 'bea' }, state: 'approved' },
					]),
				),
			}).exec,
		});

		const found = await forge.findPullRequest({
			target: TARGET,
			headBranch: 'x',
			baseBranch: 'develop',
		});
		expect(found?.approvals).toBe(1);
	});

	it('refuses the merge when the base moved under it', async () => {
		const gh = fakeGh({
			'git/ref/heads/develop': ran(
				JSON.stringify({ object: { sha: 'f'.repeat(40) } }),
			),
		});
		const forge = createGithubIntegrationForge({
			exec: gh.exec,
			mutationsEnabled: true,
		});

		const result = await forge.mergePullRequest({
			target: TARGET,
			number: 1,
			baseBranch: 'develop',
			expectedBaseSha: 'e'.repeat(40),
			expectedHeadSha: 'c'.repeat(40),
			method: 'squash',
		});

		expect(result.status).toBe('stale-base');
		expect(result.integrationSha).toBe('f'.repeat(40));
		// And it never attempted the merge itself.
		expect(gh.calls.some((args) => args.includes('PUT'))).toBe(false);
	});

	it('tells "the base could not be read" apart from "the base moved"', async () => {
		// Both refuse the merge; only one of them means somebody else
		// landed work first, and a caller that retries the wrong one is
		// either hammering a broken forge or silently losing a race.
		const forge = createGithubIntegrationForge({
			exec: fakeGh({}).exec,
			mutationsEnabled: true,
		});

		const result = await forge.mergePullRequest({
			target: TARGET,
			number: 1,
			baseBranch: 'develop',
			expectedBaseSha: 'e'.repeat(40),
			expectedHeadSha: 'c'.repeat(40),
			method: 'squash',
		});

		expect(result.status).toBe('failed');
		expect(result.reason).toContain('could not be read');
	});

	it('reports each check and the aggregate the forge computed', async () => {
		const forge = createGithubIntegrationForge({
			exec: fakeGh({
				'check-runs': ran(
					JSON.stringify({
						check_runs: [
							{
								name: 'delendai-validate',
								status: 'completed',
								conclusion: 'success',
							},
							{
								name: 'tests',
								status: 'in_progress',
								conclusion: null,
							},
						],
					}),
				),
				status: ran(JSON.stringify({ state: 'pending' })),
			}).exec,
		});

		const report = await forge.readChecks({
			target: TARGET,
			sha: 'a'.repeat(40),
		});
		expect(report.checks.map((check) => check.name)).toEqual([
			'delendai-validate',
			'tests',
		]);
		// `pending` is neither green nor red, and must not be forced into
		// one: an unfinished run is not a verdict.
		expect(report.aggregate).toBeUndefined();
	});

	it('calls a failed combined status red, and a successful one green', async () => {
		const forgeFor = (state: string) =>
			createGithubIntegrationForge({
				exec: fakeGh({
					'check-runs': ran(JSON.stringify({ check_runs: [] })),
					status: ran(JSON.stringify({ state })),
				}).exec,
			});

		const sha = 'a'.repeat(40);
		expect(
			(await forgeFor('success').readChecks({ target: TARGET, sha }))
				.aggregate,
		).toBe('green');
		expect(
			(await forgeFor('failure').readChecks({ target: TARGET, sha }))
				.aggregate,
		).toBe('red');
		expect(
			(await forgeFor('error').readChecks({ target: TARGET, sha }))
				.aggregate,
		).toBe('red');
	});
});
