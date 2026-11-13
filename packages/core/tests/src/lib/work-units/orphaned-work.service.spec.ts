/**
 * orphaned-work.service.spec.ts — a publication delivered a moment ago is
 * waiting for its pull request, not orphaned (x01051). What git says is
 * answered from a table, so no process runs; the same reading against a
 * real repository is the e2e spec beside it.
 */
import { describe, expect, it } from 'vitest';

import { createInMemoryGit, gitReadCacheOf } from '@delendai/test-kit';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { withGitReadCache } from '@delendai/core/lib/shared/git-read.helper';
import { publicationPresence } from '@delendai/core/lib/work-units/orphaned-work.service';
import { readOrphans } from '@delendai/core/lib/work-units/publication-standings.service';

const ROOT = '/clone';
const policy = resolveDevelopmentPolicy({
	development: { profile: 'shared-checkout-pr' },
});
const publication = `${policy.branches.publicationRefPrefix.replace(/^refs\/heads\//u, '').replace(/\/$/u, '')}/claude-opus-5-5/implement/x1-all-g1/guard`;
const BASE = 'a'.repeat(40);
const TIP = 'b'.repeat(40);

/** A clone whose unit ended: no work ref, and the delivered tip a minute old. */
const delivered = (): ReturnType<typeof createInMemoryGit> => {
	const justNow = String(Math.floor(Date.now() / 1000) - 60);
	return createInMemoryGit({
		'rev-parse --path-format=absolute --git-common-dir':
			'/nonexistent/.git',
		'for-each-ref --format=%(refname)%09%(objectname) refs/heads/wip/** refs/remotes/**/wip/**':
			'',
		'config --get branch.develop.remote': 'origin',
		'rev-parse -q --verify develop^{commit}': BASE,
		'rev-parse -q --verify refs/remotes/origin/develop^{commit}': '',
		[`log -1 --no-merges --format=%ct ${BASE}..${TIP}`]: justNow,
	});
};
/** The machine has no other process: nothing says the unit's author is alive. */
const readMachine = async (): Promise<{
	readonly cwds: string[];
	readonly sessions: Set<string>;
}> => ({ cwds: [], sessions: new Set() });
const read = <T>(git: ReturnType<typeof createInMemoryGit>, body: () => T): T =>
	withGitReadCache(gitReadCacheOf(git), body);

describe('publicationPresence on a just-delivered publication (x01051)', () => {
	it('[<35ms] reads its owner as alive, and as gone when it dates from long ago and carries no tip', async () => {
		const git = delivered();
		const withTips = await read(git, () =>
			publicationPresence({
				root: ROOT,
				policy,
				publications: [publication],
				tips: new Map([[publication, TIP]]),
				readMachine,
			}),
		);
		expect(withTips.get(publication)?.orphaned).toBe(false);
		const without = await read(git, () =>
			publicationPresence({
				root: ROOT,
				policy,
				publications: [publication],
				readMachine,
			}),
		);
		expect(without.get(publication)?.orphaned).toBe(true);
		const orphans = await read(git, () =>
			readOrphans({
				root: ROOT,
				policy,
				published: [
					{
						ref: publication,
						agent: 'claude-opus-5-5',
						subject: 'guard',
						tip: TIP,
						ahead: 1,
						behind: 0,
						paths: ['b.txt'],
					},
				],
				standings: [],
				readMachine,
			}),
		);
		expect(orphans.orphans).toEqual([]);
		expect(orphans.presence.get(publication)?.orphaned).toBe(false);
	});
});
