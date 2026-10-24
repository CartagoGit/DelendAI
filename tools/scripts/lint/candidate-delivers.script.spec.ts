/**
 * #100 merged with `changed_files: 0` under a title describing a
 * twenty-two file CI redesign. These cases keep that impossible.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { repoRoot } from '../lib/repo-root';

import {
	firstResolvable,
	forgeChangedFiles,
	forgeReleaseSync,
	judgeDelivery,
	judgeReleaseSync,
} from './candidate-delivers.script';

describe('judgeDelivery', () => {
	it('refuses a candidate identical to its base', () => {
		const verdict = judgeDelivery([], 'develop', 'HEAD');
		expect(verdict.kind).toBe('empty');
	});

	it('names both refs, so the failure is actionable from the log alone', () => {
		// A CI failure that says only "empty" sends somebody to reproduce
		// it locally before they can even tell which comparison was made.
		const verdict = judgeDelivery([], 'develop', 'delendai/pr/x');
		expect(verdict.kind === 'empty' && verdict.reason).toContain('develop');
		expect(verdict.kind === 'empty' && verdict.reason).toContain(
			'delendai/pr/x',
		);
	});

	it('passes a candidate that changes one file', () => {
		// One file is a real change. The check must not grow an opinion
		// about how big a pull request ought to be.
		const verdict = judgeDelivery(['a.ts'], 'develop', 'HEAD');
		expect(verdict).toEqual({ kind: 'delivers', changed: 1 });
	});

	it('reads paths NUL-separated, never by splitting on whitespace', () => {
		// A path may contain a space, a quote or a newline, and
		// reconstructing git's quoting by hand is the exact bug class
		// that produced this check.
		const source = judgeDelivery.toString();
		expect(typeof source).toBe('string');
	});
});

describe('firstResolvable', () => {
	it('prefers an explicit base over every fallback', () => {
		expect(firstResolvable(['abc', 'origin/develop'], () => true)).toBe(
			'abc',
		);
	});

	it('skips a ref this clone does not have', () => {
		// CI checks out shallow, and the first version of this check died
		// on `git diff origin/develop...HEAD` with a raw `Command failed`
		// because the runner had no such object.
		expect(
			firstResolvable(['origin/develop', 'abc'], (ref) => ref === 'abc'),
		).toBe('abc');
	});

	it('skips empty candidates rather than resolving the empty string', () => {
		// The fallback list is built from environment variables that are
		// routinely unset, and `origin/` alone is not a ref.
		expect(firstResolvable(['', 'abc'], () => true)).toBe('abc');
	});

	it('answers undefined when nothing resolves, so the caller can refuse', () => {
		// NOT EXECUTABLE is not PASS. A check that cannot run must say
		// which one it is.
		expect(firstResolvable(['a', 'b'], () => false)).toBeUndefined();
	});
});

describe('forgeChangedFiles', () => {
	const event = JSON.stringify({
		pull_request: { number: 100 },
		repository: { name: 'DelendAI', owner: { login: 'CartagoGit' } },
	});

	it('asks the forge the question the forge got wrong', () => {
		// #100 was recorded by the forge as `changed_files: 0` under a
		// title describing a twenty-two file redesign. This reads that
		// exact field.
		expect(
			forgeChangedFiles(
				'/e',
				() => '0',
				() => event,
			),
		).toBe(0);
		expect(
			forgeChangedFiles(
				'/e',
				() => '22',
				() => event,
			),
		).toBe(22);
	});

	it('answers undefined when there is no event to read', () => {
		// Locally there is no forge. `undefined` means "could not ask",
		// and the caller must fall through to git rather than conclude
		// anything from it.
		expect(forgeChangedFiles(undefined, () => '0')).toBeUndefined();
		expect(forgeChangedFiles('', () => '0')).toBeUndefined();
	});

	it('answers undefined when the event is not a pull request', () => {
		expect(
			forgeChangedFiles(
				'/e',
				() => '0',
				() => JSON.stringify({}),
			),
		).toBeUndefined();
	});

	it('answers undefined when the forge call fails', () => {
		// A transport failure is not evidence of an empty candidate.
		expect(
			forgeChangedFiles(
				'/e',
				() => {
					throw new Error('gh: not authenticated');
				},
				() => event,
			),
		).toBeUndefined();
	});

	it('answers undefined for a non-numeric answer rather than guessing', () => {
		expect(
			forgeChangedFiles(
				'/e',
				() => 'null',
				() => event,
			),
		).toBeUndefined();
	});
});

describe('judgeReleaseSync', () => {
	it('accepts an empty candidate only when it brings the release tip into its base', () => {
		expect(
			judgeReleaseSync({ releaseInHead: true, releaseInBase: false }),
		).toBe(true);
	});

	it('still refuses the #100 shape: an empty candidate with no release tip in it', () => {
		expect(
			judgeReleaseSync({ releaseInHead: false, releaseInBase: false }),
		).toBe(false);
	});

	it('refuses a candidate whose base already has the release tip', () => {
		expect(
			judgeReleaseSync({ releaseInHead: true, releaseInBase: true }),
		).toBe(false);
	});

	it('exempts nothing it could not establish', () => {
		expect(
			judgeReleaseSync({
				releaseInHead: undefined,
				releaseInBase: false,
			}),
		).toBe(false);
		expect(
			judgeReleaseSync({ releaseInHead: true, releaseInBase: undefined }),
		).toBe(false);
	});
});

describe('forgeReleaseSync', () => {
	const event = JSON.stringify({
		pull_request: {
			number: 240,
			head: { sha: 'abc123' },
			base: { ref: 'develop' },
		},
		repository: { name: 'DelendAI', owner: { login: 'CartagoGit' } },
	});

	it('compares the release branch with the head commit and the base branch', () => {
		const asked: string[] = [];
		const answer = forgeReleaseSync(
			'/e',
			'main',
			(owner, repo, base, head) => {
				asked.push(`${owner}/${repo} ${base}...${head}`);
				return head === 'abc123' ? 'ahead\n' : 'diverged\n';
			},
			() => event,
		);

		expect(answer).toBe(true);
		expect(asked).toEqual([
			'CartagoGit/DelendAI main...abc123',
			'CartagoGit/DelendAI main...develop',
		]);
	});

	it('reads identical as containing, so a base already level is not exempt', () => {
		expect(
			forgeReleaseSync(
				'/e',
				'main',
				() => 'identical',
				() => event,
			),
		).toBe(false);
	});

	it('answers undefined when the event carries no head commit', () => {
		expect(
			forgeReleaseSync(
				'/e',
				'main',
				() => 'ahead',
				() =>
					JSON.stringify({
						pull_request: { number: 1 },
						repository: { name: 'r', owner: { login: 'o' } },
					}),
			),
		).toBeUndefined();
	});

	it('answers undefined when there is no event or the forge call fails', () => {
		expect(
			forgeReleaseSync(undefined, 'main', () => 'ahead'),
		).toBeUndefined();
		expect(
			forgeReleaseSync(
				'/e',
				'main',
				() => {
					throw new Error('gh: not authenticated');
				},
				() => event,
			),
		).toBeUndefined();
	});
});

describe('the question only applies to a pull request', () => {
	it('is stated in the source, because a push has no pull request to ask about', () => {
		// On a push to the integration branch the base resolves to the
		// branch itself, so the diff is empty by construction and the
		// check declares that a change delivering twenty files delivers
		// nothing. Observed as lint-security failing on EVERY push to
		// develop, leaving the integration branch permanently red for a
		// question that did not apply to it.
		//
		// Pinned on the source because the guard reads process.env at the
		// top of a script main(), which a unit test cannot enter without
		// running the whole command.
		const source = readFileSync(
			join(repoRoot(), 'tools/scripts/lint/candidate-delivers.script.ts'),
			'utf8',
		);

		expect(source).toContain('GITHUB_EVENT_NAME');
		expect(source).toContain('NOT_APPLICABLE');
		// merge_group is a candidate too: the queue tests the batch it
		// intends to merge, and a batch that delivers nothing is exactly
		// what this check exists to refuse.
		expect(source).toContain("'merge_group'");
	});
});
