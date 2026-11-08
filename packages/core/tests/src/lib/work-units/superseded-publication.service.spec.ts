/**
 * A claim never leaves its old pull request open (x01054 S2).
 *
 * ROOT CAUSE: the claim opened a second publication and nothing looked
 * back at the first. Driven against a real git repository, because
 * "contains the old tip" is a question only git answers.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';
import {
	pullRequestNumberOf,
	retireSupersededPublications,
} from '@delendai/core/lib/work-units/superseded-publication.service';

const policy = fakePartial<IResolvedDevelopmentPolicy>({
	branches: fakePartial<IResolvedDevelopmentPolicy['branches']>({
		integration: 'develop',
		workRefPrefix: 'delendai/wip/',
		publicationRefPrefix: 'delendai/pr/',
	}),
});
const OLD_WORK = 'delendai/wip/gpt-6/implement/x00001-S1-g1/t';
const OLD_PUBLICATION = 'delendai/pr/gpt-6/implement/x00001-S1-g1/t';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const repo = () => {
	const root = mkdtempSync(join(tmpdir(), 'superseded-'));
	roots.push(root);
	const git = (...args: string[]): string =>
		execFileSync(
			'git',
			[
				'-c',
				'user.name=t',
				'-c',
				'user.email=t@t.invalid',
				'-c',
				'core.hooksPath=/dev/null',
				...args,
			],
			{ cwd: root, encoding: 'utf8' },
		).trim();
	git('init', '-q', '-b', 'develop');
	const commit = (name: string): string => {
		writeFileSync(join(root, name), `${name}\n`);
		git('add', '-A');
		git('commit', '-q', '-m', name);
		return git('rev-parse', 'HEAD');
	};
	commit('base');
	return { git, commit };
};

const ports = (git: (...args: string[]) => string) => {
	const retired: Array<{ publication: string; reason: string }> = [];
	return {
		retired,
		ports: {
			git: (args: readonly string[]) => {
				try {
					return git(...args);
				} catch {
					return undefined;
				}
			},
			retire: async (publication: string, reason: string) => {
				retired.push({ publication, reason });
				return undefined;
			},
		},
	};
};

describe('retireSupersededPublications', () => {
	it('[<500ms] retires the old publication, "superseded by #N", once the new one contains its tip', async () => {
		const { git, commit } = repo();
		git('switch', '-q', '-c', OLD_PUBLICATION);
		commit('old-work');
		// The claimant's unit starts at the old tip and adds to it.
		git('switch', '-q', '-c', 'new');
		const newTip = commit('more-work');
		const { ports: wired, retired } = ports(git);
		const outcome = await retireSupersededPublications({
			handedFrom: [{ agent: 'gpt-6', ref: OLD_WORK, at: 1 }],
			policy,
			remote: 'origin',
			newPublication: 'delendai/pr/me/implement/x00001-S1-g2/t',
			newTip,
			number: 1860,
			ports: wired,
		});
		expect(retired).toEqual([
			{ publication: OLD_PUBLICATION, reason: 'superseded by #1860' },
		]);
		expect(outcome).toEqual([
			{
				publication: OLD_PUBLICATION,
				retired: true,
				reason: 'superseded by #1860',
			},
		]);
	});

	it('[<500ms] keeps the old publication and says why when the new one lacks its tip', async () => {
		const { git, commit } = repo();
		git('switch', '-q', '-c', OLD_PUBLICATION);
		commit('old-work');
		// The new unit started over from the integration branch.
		git('switch', '-q', 'develop');
		git('switch', '-q', '-c', 'new');
		const newTip = commit('other-work');
		const { ports: wired, retired } = ports(git);
		const [outcome] = await retireSupersededPublications({
			handedFrom: [{ agent: 'gpt-6', ref: OLD_WORK, at: 1 }],
			policy,
			remote: 'origin',
			newPublication: 'delendai/pr/me/implement/x00001-S1-g2/t',
			newTip,
			number: 1860,
			ports: wired,
		});
		expect(retired).toEqual([]);
		expect(outcome?.retired).toBe(false);
		expect(outcome?.reason).toContain('#1860 does not contain its tip');
	});

	it('[<10ms] reads the number from a pull request URL', () => {
		expect(pullRequestNumberOf('https://github.com/o/r/pull/1860')).toBe(
			1860,
		);
		expect(pullRequestNumberOf('not a url')).toBeUndefined();
	});
});
