/**
 * A publication becomes a pull request by itself (x00677).
 */
import { describe, expect, it } from 'vitest';

import type { IPullRequestPorts } from '@delendai/core/lib/contracts/interfaces/publication-pull-request.interface';
import {
	openPublicationPullRequest,
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
		expect(openPublicationPullRequest({ ...INPUT, ports })).toEqual({
			status: 'existing',
			url: 'https://github.com/owner/repo/pull/3',
		});
		expect(ports.created).toEqual([]);
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
});
