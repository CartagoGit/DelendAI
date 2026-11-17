/**
 * A publication becomes a pull request by itself (x00677).
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type { IChangeRequestForge } from '@delendai/core/lib/contracts/interfaces/change-request-forge.interface';
import type { IPullRequestPorts } from '@delendai/core/lib/contracts/interfaces/publication-pull-request.interface';
import { urgentReasonOfBody } from '@delendai/core/lib/work-units/pull-request-urgency.service';
import {
	openPublicationPullRequest,
	openUnitPullRequest,
	pullRequestText,
} from '@delendai/core/lib/work-units/publication-pull-request.service';

const INPUT = {
	remote: 'origin',
	base: 'develop',
	branch: 'delendai/pr/agent-a/review/batch-all-g1/sweep',
	tip: 'tip',
	integrationBase: 'base',
	fallbackTitle: 'review batch',
};

const portsWith = (answers: {
	readonly url?: string;
	readonly gh?: boolean;
	readonly existing?: string;
	readonly created?: string;
	readonly viaApi?: string;
	readonly subjects?: string;
}): IPullRequestPorts & { readonly created: string[][] } => {
	const created: string[][] = [];
	return {
		created,
		git: (args) => {
			if (args[0] === 'remote') return answers.url;
			if (args[0] === 'log') return answers.subjects ?? '';
			return undefined;
		},
		gh: (args) => {
			if (args[0] === '--version')
				return answers.gh === false ? undefined : 'gh 2';
			if (args[1] === 'list') return answers.existing ?? '';
			if (args[1] === 'create') {
				created.push([...args]);
				return answers.created;
			}
			if (args[0] === 'api') {
				created.push([...args]);
				return answers.viaApi;
			}
			return undefined;
		},
	};
};

describe('openPublicationPullRequest', () => {
	it('opens the pull request, titled by the work and not by its bookkeeping', () => {
		const ports = portsWith({
			url: 'git@github.com:owner/repo.git',
			created: 'https://github.com/owner/repo/pull/7',
			subjects: [
				'docs(proposals): x00001 to review',
				'fix(core): the real change',
				'chore(review): claim x00001',
			].join('\n'),
		});
		expect(openPublicationPullRequest({ ...INPUT, ports })).toEqual({
			status: 'opened',
			url: 'https://github.com/owner/repo/pull/7',
		});
		const args = ports.created[0] ?? [];
		expect(args[args.indexOf('--title') + 1]).toBe(
			'fix(core): the real change',
		);
		expect(args[args.indexOf('--base') + 1]).toBe('develop');
		expect(args[args.indexOf('--head') + 1]).toBe(INPUT.branch);
		expect(args).not.toContain('--auto');
	});

	it('reuses the pull request already open', () => {
		const ports = portsWith({
			url: 'https://github.com/owner/repo',
			existing: 'https://github.com/owner/repo/pull/3',
		});
		expect(openPublicationPullRequest({ ...INPUT, ports })).toMatchObject({
			url: 'https://github.com/owner/repo/pull/3',
		});
		expect(ports.created.filter((args) => args[1] === 'create')).toEqual(
			[],
		);
	});

	describe('refreshing an open change request', () => {
		const open = 'https://github.com/owner/repo/pull/3';
		const fakeForge = (
			id: string,
			host: string,
			store: { title: string; body: string },
		): IChangeRequestForge & { readonly writes: string[] } => {
			const writes: string[] = [];
			return {
				id,
				writes,
				handles: (url) => url.includes(host),
				findOpen: () => ({
					url: `https://${host}/o/r/-/mr/4`,
					id: '4',
				}),
				read: () => ({ ...store }),
				update: (_run, _ref, text) => {
					writes.push(text.title);
					store.title = text.title;
					store.body = text.body;
					return true;
				},
			};
		};
		const publish = (
			remote: string,
			subjects: string,
			forges: readonly IChangeRequestForge[],
		) => {
			const ports = portsWith({ url: remote, existing: open, subjects });
			return openPublicationPullRequest({
				...INPUT,
				ports: {
					git: (args) =>
						args[0] === 'diff' ? 'a.ts' : ports.git(args),
					gh: ports.gh,
					run: { text: () => undefined, json: () => undefined },
					forges,
				},
			});
		};

		it('retitles a pull request whose scope shrank between two publishes', () => {
			const store = { title: '', body: '' };
			const github = fakeForge('github', 'github.com', store);
			const remote = 'https://github.com/owner/repo';
			publish(remote, 'feat(x): one x00001 S1\nfeat(x): two x00001 S2', [
				github,
			]);
			const result = publish(remote, 'feat(x): one x00001 S1', [github]);
			expect(result).toEqual({
				status: 'updated',
				url: open,
				title: 'feat(x): one x00001 S1',
			});
			expect(github.writes[0]).toContain('(+1 more)');
			expect(store.body).toContain('Ships: x00001 S1.');
			expect(store.body).not.toContain('S2');
			expect(store.body).toContain('Final diff: 1 file(s)');
			// Nothing to say the third time: nothing is rewritten.
			expect(
				publish(remote, 'feat(x): one x00001 S1', [github]).status,
			).toBe('existing');
		});

		it('refreshes a GitLab merge request through the GitLab adapter', () => {
			const store = { title: 'old', body: 'old' };
			const gitlab = fakeForge('gitlab', 'gitlab.com', store);
			const result = publish(
				'git@gitlab.com:owner/repo.git',
				'fix(x): done x00002 S1',
				[gitlab],
			);
			expect(result).toMatchObject({
				status: 'updated',
				url: 'https://gitlab.com/o/r/-/mr/4',
			});
			expect(store.title).toBe('fix(x): done x00002 S1');
		});

		it('lists a long diff briefly and reports a forge that refuses', () => {
			const refusing: IChangeRequestForge = {
				...fakeForge('github', 'github.com', { title: '', body: '' }),
				update: () => false,
			};
			const ports = portsWith({
				url: 'https://github.com/owner/repo',
				existing: open,
				subjects: 'feat(x): no slice cited',
			});
			const result = openPublicationPullRequest({
				...INPUT,
				ports: {
					git: (args) =>
						args[0] === 'diff'
							? Array.from(
									{ length: 45 },
									(_, i) => `f${String(i)}.ts`,
								).join('\n')
							: ports.git(args),
					gh: ports.gh,
					run: { text: () => undefined, json: () => undefined },
					forges: [refusing],
				},
			});
			expect(result).toMatchObject({
				status: 'unchanged',
				reason: expect.stringContaining('did not accept'),
			});
		});

		it('leaves a pull request whose URL carries no number as it is', () => {
			const ports = portsWith({
				url: 'https://github.com/owner/repo',
				existing: 'https://github.com/owner/repo/pulls',
			});
			expect(openPublicationPullRequest({ ...INPUT, ports })).toEqual({
				status: 'existing',
				url: 'https://github.com/owner/repo/pulls',
			});
		});

		it('skips another forge when no adapter finds a change request there', () => {
			const ports = portsWith({ url: 'git@gitlab.com:o/r.git' });
			const none: IChangeRequestForge = {
				...fakeForge('gitlab', 'gitlab.com', { title: '', body: '' }),
				findOpen: () => undefined,
			};
			expect(
				openPublicationPullRequest({
					...INPUT,
					ports: {
						...ports,
						run: { text: () => undefined, json: () => undefined },
						forges: [none],
					},
				}),
			).toMatchObject({ status: 'skipped' });
		});

		it('says plainly that no forge plugin can rewrite the text', () => {
			expect(
				publish('https://github.com/owner/repo', 'feat(x): a', []),
			).toMatchObject({
				status: 'unchanged',
				reason: expect.stringContaining('no installed forge plugin'),
			});
		});
	});

	it('says what to do on another forge, or without its CLI', () => {
		expect(
			openPublicationPullRequest({
				...INPUT,
				ports: portsWith({ url: '/tmp/bare.git' }),
			}),
		).toMatchObject({
			status: 'skipped',
			reason: expect.stringContaining('/tmp/bare.git'),
		});
		expect(
			openPublicationPullRequest({
				...INPUT,
				ports: portsWith({ url: 'git@github.com:o/r.git', gh: false }),
			}),
		).toMatchObject({
			status: 'skipped',
			reason: expect.stringContaining('holds the forge credential opens'),
		});
		expect(
			JSON.stringify(
				openPublicationPullRequest({
					...INPUT,
					ports: portsWith({
						url: 'git@github.com:o/r.git',
						gh: false,
					}),
				}),
			),
		).not.toContain('gh pr create');
	});

	it("opens it through the REST API when the CLI's own create fails", () => {
		const ports = portsWith({
			url: 'git@github.com:o/r.git',
			created: '',
			viaApi: 'https://github.com/o/r/pull/9',
		});
		const opened = openPublicationPullRequest({ ...INPUT, ports });
		expect(opened).toEqual({
			status: 'opened',
			url: 'https://github.com/o/r/pull/9',
		});
		expect(ports.created.at(-1)).toEqual(
			expect.arrayContaining([
				'api',
				'repos/{owner}/{repo}/pulls',
				`head=${INPUT.branch}`,
				'base=develop',
			]),
		);
	});

	it('reports a create that did not open anything', () => {
		expect(
			openPublicationPullRequest({
				...INPUT,
				ports: portsWith({
					url: 'git@github.com:o/r.git',
					created: '',
				}),
			}).status,
		).toBe('failed');
	});
});

describe('pullRequestText', () => {
	it('falls back to the unit when every commit is bookkeeping', () => {
		expect(
			pullRequestText(
				['chore(review): claim x00001'],
				'b',
				'review batch',
			).title,
		).toBe('review batch');
	});

	it('names a review unit by what it claimed and judged, never implement batch (x01032)', () => {
		const branch = 'delendai/pr/gpt-5.3-codex/review/batch-all-g1/verdicts';
		expect(
			pullRequestText(
				['chore(review): claim d00418', 'chore(review): claim x01016'],
				branch,
				'implement batch',
			).title,
		).toBe('review: claim(s) on x01016, d00418');
		expect(
			pullRequestText(
				[
					'chore(review): claim x01016',
					'chore(delendai): delendai_proposals_proposal_review x01004 S1 submit',
				],
				branch,
				'implement batch',
			).title,
		).toBe('review: 1 verdict(s) on x01004');
	});

	it('titles a pack of verdicts by what it judged, not by its bookkeeping', () => {
		// Newest first, as git lists them: the pack that went out as
		// "chore(review): release r00040" carried approvals of f00643.
		expect(
			pullRequestText(
				[
					'chore(delendai): delendai_proposals_proposal_review f00643 S3 approve',
					'chore(delendai): delendai_proposals_proposal_review f00643 S2 approve',
					'chore(review): claim f00643',
					'chore(delendai): delendai_proposals_proposal_review q00010 S3 request_changes',
					'chore(review): release r00040',
					'chore(review): claim r00040',
				],
				'delendai/pr/gpt-5.4/review/batch-all-g3/review-pack',
				'review batch',
			).title,
		).toBe('review: 3 verdict(s) on q00010, f00643');
	});

	it('titles a pack by its verdicts even when its reviewer touched a document', () => {
		expect(
			pullRequestText(
				[
					'docs(proposals): x00539 S4 names f00534 at its done location',
					'chore(delendai): delendai_proposals_proposal_review x00835 S39 approve',
					'chore(review): claim x00835',
				],
				'delendai/pr/glm-5.3-max/review/batch-all-g3/verdicts',
				'review batch',
			).title,
		).toBe('review: 1 verdict(s) on x00835');
	});

	it('is titled by the oldest commit that delivers, past tool records, regeneration and merges', () => {
		// Newest first, as `git log` lists them.
		const text = pullRequestText(
			[
				'chore(proposals): x00001 goes to review',
				"Merge remote-tracking branch 'origin/develop' into HEAD",
				'chore(generated): recompute the catalog',
				'fix(release): release tooling follows the configured branches',
				'chore(delendai): delendai_proposals_create_proposal',
			],
			'b',
			'unit',
		);
		expect(text.title).toBe(
			'fix(release): release tooling follows the configured branches',
		);
		expect(text.body).not.toContain('Merge ');
	});

	it('is titled by its own slice when it carries another unit merged in', () => {
		// Newest first, as `git log` lists them: S39's commit came in with
		// the publication this unit merged, and is the oldest.
		const { title } = pullRequestText(
			[
				'chore(delendai): delendai_proposals_proposal_review x00875 S23 submit',
				'fix(proposals): the queue offers no reviewer a slice its own unit delivered (x00875 S23)',
				'fix(proposals): the review queue cites the delivery an approval is accepted with (x00835 S39)',
			],
			'delendai/pr/claude-opus-5-5/implement/x00875-S23-g1/the-queue-does-not-offer',
			'fallback',
		);
		expect(title).toBe(
			'fix(proposals): the queue offers no reviewer a slice its own unit delivered (x00875 S23)',
		);
	});

	it('keeps the oldest delivery when none cites the unit', () => {
		const { title } = pullRequestText(
			['fix: second', 'fix: first'],
			'delendai/pr/agent/implement/x00001-S1-g1/topic',
			'fallback',
		);
		expect(title).toBe('fix: first (+1 more)');
	});

	it('takes the oldest meaningful commit when none follows the delivery types', () => {
		expect(
			pullRequestText(
				['chore(deps): bump zod', 'chore(delendai): a tool record'],
				'b',
				'unit',
			).title,
		).toBe('chore(deps): bump zod');
	});
});

describe('the urgent mark on a pull request (x01051)', () => {
	it('puts one Urgent line in the body and reads it back', () => {
		const text = pullRequestText(
			['fix: a thing'],
			'delendai/pr/a/implement/x1-all-g1/t',
			'fallback',
			'integration machinery   loops\nand self-blocks',
		);
		expect(text.body).toContain(
			'Urgent: integration machinery loops and self-blocks',
		);
		expect(urgentReasonOfBody(text.body)).toBe(
			'integration machinery loops and self-blocks',
		);
	});

	it('carries no mark when nobody said it was urgent', () => {
		const text = pullRequestText(['fix: a thing'], 'b', 'fallback');
		expect(text.body).not.toContain('Urgent:');
		expect(urgentReasonOfBody(text.body)).toBeUndefined();
		expect(urgentReasonOfBody(null)).toBeUndefined();
	});
});

describe('openUnitPullRequest (x01051)', () => {
	const policy = resolveDevelopmentPolicy({
		development: { profile: 'shared-checkout-pr' },
	});
	const input = {
		root: '/nonexistent-root-for-spec',
		policy,
		remote: 'origin',
		publicationRef: 'refs/heads/delendai/pr/a/implement/x1-all-g1/t',
		tip: 'tip',
		integrationBase: 'base',
		fallbackTitle: 'fix x1',
	};

	it('opens nothing when the caller asked for none', async () => {
		expect(
			await openUnitPullRequest({
				...input,
				args: ['--no-pull-request'],
			}),
		).toBeUndefined();
	});

	it('reports a remote it does not recognise rather than opening a pull request', async () => {
		const opened = await openUnitPullRequest({
			...input,
			args: [],
			urgent: 'integration is red',
		});
		expect(opened?.status).toBe('skipped');
	});
});
