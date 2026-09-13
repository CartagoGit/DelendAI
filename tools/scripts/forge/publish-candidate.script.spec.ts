/**
 * The publication primitive, pinned at the decisions that make it safe
 * to hand to fifteen agents at once.
 *
 * Every case here is a property the shared-checkout model depends on,
 * and each one is cheap to break by accident later.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	isPublicationRef,
	runPreflight,
	splitContent,
} from './publish-candidate.script';
import { repoRoot } from '../lib/monorepo-paths';

describe('isPublicationRef', () => {
	it('accepts a ref inside the publication namespace', () => {
		expect(isPublicationRef('delendai/pr/a-slice', 'delendai/pr/')).toBe(
			true,
		);
	});

	it('refuses the integration branch itself', () => {
		// The whole point of the namespace: nothing publishes onto
		// `develop`, in this model or any of the others.
		expect(isPublicationRef('develop', 'delendai/pr/')).toBe(false);
	});

	it('refuses everything when the policy has no publication namespace', () => {
		// Under direct-merge the prefix is empty, and an empty prefix
		// would otherwise match every ref in the repository.
		expect(isPublicationRef('anything', '')).toBe(false);
	});
});

describe('splitContent', () => {
	it('carries a deletion as a deletion rather than dropping it', () => {
		// A candidate that deletes a file must say so. Publishing only
		// the paths that still exist would silently resurrect it from
		// the integration branch on the next refresh.
		const content = splitContent(
			['kept.ts', 'gone.ts'],
			(p) => p === 'kept.ts',
		);
		expect(content.written).toEqual(['kept.ts']);
		expect(content.removed).toEqual(['gone.ts']);
	});

	it('does not call a file that never existed a deletion', () => {
		// Observed: the runtime wrote a mutex file while the pre-flight
		// ran, `git status` listed it, it was gone by the time the tree
		// was built, and the publication reported "1 removed" having
		// deleted nothing. Asking the forge to delete a path the branch
		// never had is the kind of instruction that reads as sabotage.
		const content = splitContent(
			['real.ts', '.cache/x.mutex'],
			() => false,
			(p) => p === 'real.ts',
		);
		expect(content.removed).toEqual(['real.ts']);
		expect(content.vanished).toEqual(['.cache/x.mutex']);
	});
});

describe('runPreflight', () => {
	it('reports every failing check, not just the first', () => {
		const failed = runPreflight(
			(script) => (script === 'a' || script === 'c' ? 1 : 0),
			[
				{ script: 'a', because: 'x' },
				{ script: 'b', because: 'y' },
				{ script: 'c', because: 'z' },
			],
		);
		expect(failed).toEqual(['a', 'c']);
	});

	it('is empty when everything passes', () => {
		expect(runPreflight(() => 0, [{ script: 'a', because: 'x' }])).toEqual(
			[],
		);
	});
});

describe('the publication path itself', () => {
	const source = readFileSync(
		join(repoRoot(), 'tools/scripts/forge/publish-candidate.script.ts'),
		'utf8',
	);
	const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '');

	it('never moves the shared checkout', () => {
		// `checkout`, `switch` and a plain `commit` all move HEAD or the
		// working tree, and with fifteen agents sharing one clone that is
		// how a publication eats somebody else's uncommitted edit. The
		// tree is built in a throwaway index instead.
		for (const forbidden of [
			"'checkout'",
			"'switch'",
			"'commit'",
			"'stash'",
		]) {
			expect(code).not.toContain(forbidden);
		}
		expect(code).toContain('GIT_INDEX_FILE');
		expect(code).toContain("'commit-tree'");
	});

	it('never force-pushes', () => {
		// A candidate is somebody's work. Losing a push race must fail
		// loudly, not overwrite whatever arrived first.
		// `--force-remove` is an `update-index` flag about a path, not a
		// push flag about a ref, so the pattern has to tell them apart.
		expect(code).not.toMatch(/--force(?!-remove)/u);
		expect(code).not.toContain('+refs/');
		expect(code).toContain(
			"git(['push', 'origin', `${commit}:refs/heads/${ref}`])",
		);
	});

	it('seeds the tree from the integration branch, not from the ref tip', () => {
		// This is what makes a re-publish a refresh: the candidate is
		// always "the integration branch, plus these paths", so it can
		// never carry a stale copy of a file somebody else has changed.
		expect(code).toContain("git(['read-tree', integration], env)");
	});
});
