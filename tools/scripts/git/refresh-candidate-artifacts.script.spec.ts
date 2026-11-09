/**
 * refresh-candidate-artifacts.script.spec.ts — a candidate comes up to
 * the integration branch with its derived files recomputed, and never at
 * the cost of the shared checkout.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	captureWorkingState,
	workingStateChanges,
} from '@delendai/test-kit/public';

import {
	conflictDetail,
	discardScratch,
	GENERATED_REFRESH_COMMANDS,
	identityArgs,
	pushRefusalReason,
	refreshCandidate,
	shouldAskQueueToRun,
	staleCandidates,
	overlappingFiles,
} from './refresh-candidate-artifacts.script';

const roots: string[] = [];
const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A clone with a bare remote and one candidate behind `develop`. */
const repoWithCandidate = (): { readonly root: string } => {
	const base = mkdtempSync(join(tmpdir(), 'candidate-'));
	roots.push(base);
	const remote = join(base, 'origin.git');
	const root = join(base, 'work');
	execFileSync('mkdir', ['-p', remote, root]);
	git(remote, 'init', '-q', '--bare', '--initial-branch', 'develop');
	git(root, 'init', '-q', '--initial-branch', 'develop');
	git(root, 'config', 'user.email', 'c@example.com');
	git(root, 'config', 'user.name', 'C');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'derived.json'), '{"count":1}\n');
	writeFileSync(join(root, 'authored.ts'), 'export const a = 1;\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', 'origin', 'develop');

	// The candidate branches here…
	git(root, 'branch', 'delendai/pr/candidate');
	git(root, 'push', '-q', 'origin', 'delendai/pr/candidate');
	// …and develop moves on without it.
	writeFileSync(join(root, 'authored.ts'), 'export const a = 2;\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'develop moves');
	git(root, 'push', '-q', 'origin', 'develop');
	git(root, 'fetch', '-q', 'origin');
	return { root };
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('staleCandidates (x00565)', () => {
<<<<<<< HEAD
	it('[<5000ms] names the candidates the integration branch has moved past', () => {
=======
	it('[<3000ms] names the candidates the integration branch has moved past', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		expect(staleCandidates(root, policy, 'origin')).toEqual([
			'delendai/pr/candidate',
		]);
	});

<<<<<<< HEAD
	it('[<5000ms] names none once they are level', () => {
=======
	it('[<3000ms] names none once they are level', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		git(root, 'push', '-q', 'origin', 'develop:delendai/pr/candidate');
		git(root, 'fetch', '-q', 'origin', '--prune');
		expect(staleCandidates(root, policy, 'origin')).toEqual([]);
	});
});

describe('refreshCandidate (x00565)', () => {
<<<<<<< HEAD
	it('[<5000ms] merges, regenerates and pushes, without moving the shared checkout', () => {
=======
	it('[<3000ms] merges, regenerates and pushes, without moving the shared checkout', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		const before = git(root, 'rev-parse', 'HEAD');
		const outcome = refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			// Stands in for `catalog:generate` — it rewrites the derived
			// file the way a generator would.
			run: (_command, cwd) => {
				writeFileSync(join(cwd, 'derived.json'), '{"count":2}\n');
				return true;
			},
		});
		expect(outcome).toMatchObject({ state: 'refreshed' });
		// The shared checkout is exactly where it was.
		expect(git(root, 'rev-parse', 'HEAD')).toBe(before);
		expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('develop');

		git(root, 'fetch', '-q', 'origin');
		const pushed = git(
			root,
			'show',
			'origin/delendai/pr/candidate:derived.json',
		);
		expect(pushed).toContain('"count":2');
		// And it carries what develop had moved on with.
		expect(
			git(root, 'show', 'origin/delendai/pr/candidate:authored.ts'),
		).toContain('a = 2');
	});

<<<<<<< HEAD
	it('[<5000ms] leaves a candidate that does not merge trivially to its author', () => {
=======
	it('[<2000ms] leaves no scratch worktree behind when the run throws, and keeps a sibling registered', () => {
		const { root } = repoWithCandidate();
		const sibling = join(mkdtempSync(join(tmpdir(), 'sibling-')), 'wt');
		roots.push(sibling);
		git(root, 'worktree', 'add', '-q', '--detach', sibling, 'HEAD');
		// The sibling's directory vanishes: a stale registration a global
		// `worktree prune` would drop, and only the reclaimer may.
		rmSync(sibling, { recursive: true, force: true });
		expect(() =>
			refreshCandidate({
				root,
				policy,
				remote: 'origin',
				candidate: 'delendai/pr/candidate',
				run: () => {
					throw new Error('generator died');
				},
			}),
		).toThrow('generator died');
		const listed = git(root, 'worktree', 'list', '--porcelain');
		expect(listed).not.toContain('candidate-refresh-');
		expect(listed).toContain(sibling);
	});

	it('[<2000ms] discardScratch removes the worktree and its directory, only that one', () => {
		const { root } = repoWithCandidate();
		const holder = mkdtempSync(join(tmpdir(), 'scratch-'));
		roots.push(holder);
		const dir = join(holder, 'a');
		git(root, 'worktree', 'add', '-q', '--detach', dir, 'HEAD');
		discardScratch(root, dir);
		expect(git(root, 'worktree', 'list', '--porcelain')).not.toContain(dir);
	});

	it('[<3000ms] leaves a candidate that does not merge trivially to its author', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		// The candidate edits the same line develop moved.
		git(
			root,
			'worktree',
			'add',
			'-q',
			join(root, 'wt'),
			'delendai/pr/candidate',
		);
		writeFileSync(join(root, 'wt', 'authored.ts'), 'export const a = 3;\n');
		git(join(root, 'wt'), 'add', '-A');
		git(join(root, 'wt'), 'commit', '-q', '-m', 'candidate edits it too');
		git(join(root, 'wt'), 'push', '-q', 'origin', 'delendai/pr/candidate');
		git(root, 'worktree', 'remove', '--force', join(root, 'wt'));
		git(root, 'fetch', '-q', 'origin');

		const outcome = refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			run: () => true,
		});
		expect(outcome.state).toBe('conflicted');
		expect(outcome.detail).toContain('author decides');
		// Untouched on the remote.
		git(root, 'fetch', '-q', 'origin');
		expect(
			git(root, 'show', 'origin/delendai/pr/candidate:authored.ts'),
		).toContain('a = 3');
	});

	/** The candidate and develop both change the lines of `files`. */
	const conflictOn = (root: string, files: readonly string[]): void => {
		git(
			root,
			'worktree',
			'add',
			'-q',
			join(root, 'wt'),
			'delendai/pr/candidate',
		);
		for (const file of files) {
			writeFileSync(join(root, 'wt', file), `candidate ${file}\n`);
		}
		git(join(root, 'wt'), 'add', '-A');
		git(join(root, 'wt'), 'commit', '-q', '-m', 'candidate edits them');
		git(join(root, 'wt'), 'push', '-q', 'origin', 'delendai/pr/candidate');
		git(root, 'worktree', 'remove', '--force', join(root, 'wt'));
		for (const file of files) {
			writeFileSync(join(root, file), `develop ${file}\n`);
		}
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'develop edits them');
		git(root, 'push', '-q', 'origin', 'develop');
		git(root, 'fetch', '-q', 'origin');
	};

<<<<<<< HEAD
	it('[<5000ms] resolves a conflict confined to regenerated files and regenerates them', () => {
=======
	it('[<3000ms] resolves a conflict confined to regenerated files and regenerates them', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		conflictOn(root, ['derived.json']);

		const outcome = refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			regenerated: new Set(['derived.json']),
			run: (_command, cwd) => {
				writeFileSync(join(cwd, 'derived.json'), '{"count":7}\n');
				return true;
			},
		});

		expect(outcome.state).toBe('refreshed');
		git(root, 'fetch', '-q', 'origin');
		expect(
			git(root, 'show', 'origin/delendai/pr/candidate:derived.json'),
		).toContain('"count":7');
		expect(
			git(
				root,
				'merge-base',
				'--is-ancestor',
				'origin/develop',
				'origin/delendai/pr/candidate',
			),
		).toBe('');
	});

<<<<<<< HEAD
	it('[<5000ms] leaves a conflict that reaches an authored file to its author, even beside a regenerated one', () => {
=======
	it('[<3000ms] leaves a conflict that reaches an authored file to its author, even beside a regenerated one', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		conflictOn(root, ['derived.json', 'authored.ts']);
		const before = git(root, 'rev-parse', 'origin/delendai/pr/candidate');

		const outcome = refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			regenerated: new Set(['derived.json']),
			run: () => true,
		});

		expect(outcome.state).toBe('conflicted');
		git(root, 'fetch', '-q', 'origin');
		expect(git(root, 'rev-parse', 'origin/delendai/pr/candidate')).toBe(
			before,
		);
	});

<<<<<<< HEAD
	it('[<5000ms] reports a generator that failed and pushes nothing', () => {
=======
	it('[<3000ms] reports a generator that failed and pushes nothing', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		const before = git(root, 'rev-parse', 'origin/delendai/pr/candidate');
		const outcome = refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			run: () => false,
		});
		expect(outcome.state).toBe('failed');
		expect(outcome.detail).toContain('generators failed');
		git(root, 'fetch', '-q', 'origin');
		expect(git(root, 'rev-parse', 'origin/delendai/pr/candidate')).toBe(
			before,
		);
	});

<<<<<<< HEAD
	it('[<5000ms] leaves no worktree behind, whatever happened', () => {
=======
	it('[<3000ms] leaves no worktree behind, whatever happened', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			run: () => false,
		});
		expect(
			git(root, 'worktree', 'list').split('\n').filter(Boolean),
		).toHaveLength(1);
	});

<<<<<<< HEAD
	it('[<5000ms] does not read the derived file from the merge, but from the generator', () => {
=======
	it('[<3000ms] does not read the derived file from the merge, but from the generator', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			run: (_command, cwd) => {
				// Whatever the merge produced, the generator's answer wins.
				writeFileSync(join(cwd, 'derived.json'), '{"count":99}\n');
				return true;
			},
		});
		git(root, 'fetch', '-q', 'origin');
		expect(
			git(root, 'show', 'origin/delendai/pr/candidate:derived.json'),
		).toContain('"count":99');
		expect(readFileSync(join(root, 'derived.json'), 'utf8')).toContain(
			'"count":1',
		);
	});
});

describe('who the queue commits as', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

<<<<<<< HEAD
	it('[<5000ms] leaves a configured identity alone, and names itself where there is none', () => {
=======
	it('[<50ms] leaves a configured identity alone, and names itself where there is none', () => {
>>>>>>> origin/develop
		expect(identityArgs({ name: 'C', email: 'c@example.com' })).toEqual([]);
		expect(identityArgs({ name: 'C' })).toContain(
			'user.email=queue@delendai.invalid',
		);
		expect(identityArgs({})).toContain('user.name=delendai queue');
	});

<<<<<<< HEAD
	it('[<5000ms] refreshes a candidate on a machine whose git names nobody', () => {
=======
	it('[<3000ms] refreshes a candidate on a machine whose git names nobody', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		git(root, 'config', '--unset', 'user.name');
		git(root, 'config', '--unset', 'user.email');
		git(root, 'config', 'user.useConfigOnly', 'true');
		vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
		vi.stubEnv('GIT_CONFIG_SYSTEM', '/dev/null');

		const outcome = refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			run: (_command, cwd) => {
				writeFileSync(join(cwd, 'derived.json'), '{"count":2}\n');
				return true;
			},
		});

		expect(outcome).toMatchObject({ state: 'refreshed' });
		git(root, 'fetch', '-q', 'origin');
		expect(
			git(
				root,
				'log',
				'-1',
				'--format=%an',
				'origin/delendai/pr/candidate',
			),
		).toBe('delendai queue');
	});
});

describe('what a refreshed candidate regenerates', () => {
<<<<<<< HEAD
	it('[<5000ms] installs from the merged lockfile, keeps one copy of each proposal, then runs gen:all, the one list of generators', () => {
=======
	it('[<50ms] installs from the merged lockfile, then runs gen:all, the one list of generators', () => {
>>>>>>> origin/develop
		expect(GENERATED_REFRESH_COMMANDS).toEqual([
			'install --frozen-lockfile --ignore-scripts',
			'tools/scripts/proposals/reconcile-duplicate-ids.script.ts --root .',
			'run gen:all',
		]);
	});
});

describe('the checkout a hydration runs from (x00635)', () => {
<<<<<<< HEAD
	it('[<5000ms] keeps its uncommitted work exactly as found', () => {
=======
	it('[<3000ms] keeps its uncommitted work exactly as found', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		writeFileSync(join(root, 'authored.ts'), 'export const a = 42;\n');
		writeFileSync(join(root, 'scratch.txt'), 'untracked\n');
		const before = captureWorkingState(root);
		refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: 'delendai/pr/candidate',
			run: (_command, cwd) => {
				writeFileSync(join(cwd, 'derived.json'), '{"count":3}\n');
				return true;
			},
		});
		expect(workingStateChanges(before)).toEqual([]);
	});
});

describe('shouldAskQueueToRun', () => {
	const base = {
		apply: true,
		head: 'delendai/pr/candidate',
		refreshed: false,
		headArmed: false,
	} as const;

<<<<<<< HEAD
	it('[<5000ms] asks when the head is level but nothing armed it', () => {
		expect(shouldAskQueueToRun(base)).toBe(true);
	});

	it('[<5000ms] asks after bringing the head forward, armed or not', () => {
=======
	it('[<50ms] asks when the head is level but nothing armed it', () => {
		expect(shouldAskQueueToRun(base)).toBe(true);
	});

	it('[<50ms] asks after bringing the head forward, armed or not', () => {
>>>>>>> origin/develop
		expect(
			shouldAskQueueToRun({ ...base, refreshed: true, headArmed: true }),
		).toBe(true);
	});

<<<<<<< HEAD
	it('[<5000ms] does not ask when the head is already armed and nothing moved', () => {
		expect(shouldAskQueueToRun({ ...base, headArmed: true })).toBe(false);
	});

	it('[<5000ms] does not ask with no head, or in a read-only pass', () => {
=======
	it('[<50ms] does not ask when the head is already armed and nothing moved', () => {
		expect(shouldAskQueueToRun({ ...base, headArmed: true })).toBe(false);
	});

	it('[<50ms] does not ask with no head, or in a read-only pass', () => {
>>>>>>> origin/develop
		expect(shouldAskQueueToRun({ ...base, head: undefined })).toBe(false);
		expect(shouldAskQueueToRun({ ...base, apply: false })).toBe(false);
	});
});

describe('pushRefusalReason', () => {
<<<<<<< HEAD
	it('[<5000ms] keeps the lines a hook marks as failing', () => {
=======
	it('[<50ms] keeps the lines a hook marks as failing', () => {
>>>>>>> origin/develop
		expect(
			pushRefusalReason(
				'┃  drift-check ❯\n✓ fine\n✖ biome-baseline: 1 new finding\nerror: failed to push some refs',
			),
		).toBe(
			'✖ biome-baseline: 1 new finding | error: failed to push some refs',
		);
	});

<<<<<<< HEAD
	it('[<5000ms] keeps every failing line in full, however many and however long', () => {
=======
	it('[<50ms] keeps every failing line in full, however many and however long', () => {
>>>>>>> origin/develop
		const cause = `✖ preset-metadata: ${'a reason '.repeat(80)}`;
		const output = [
			'$ bun one',
			'✖ typecheck: first',
			'$ bun two',
			'✖ lint: second',
			'✖ lint: third',
			cause,
			'error: failed to push some refs',
		].join('\n');
		expect(pushRefusalReason(output)).toBe(
			[
				'✖ typecheck: first',
				'✖ lint: second',
				'✖ lint: third',
				cause.trim(),
				'error: failed to push some refs',
			].join(' | '),
		);
	});

<<<<<<< HEAD
	it('[<5000ms] falls back to the last lines, and says so when there is nothing', () => {
=======
	it('[<50ms] falls back to the last lines, and says so when there is nothing', () => {
>>>>>>> origin/develop
		expect(pushRefusalReason('one\ntwo\nthree\nfour')).toBe(
			'two | three | four',
		);
		expect(pushRefusalReason('\n\n')).toBe('no output');
	});

<<<<<<< HEAD
	it('[<5000ms] skips informational banner lines and reports the refusal itself', () => {
=======
	it('[<50ms] skips informational banner lines and reports the refusal itself', () => {
>>>>>>> origin/develop
		expect(
			pushRefusalReason(
				'[delendai] error-reporting is ON: bugs are reported.\n[delendai] Only delendai-internal errors.\nremote: ! [remote rejected] x -> x (hook declined)',
			),
		).toBe('remote: ! [remote rejected] x -> x (hook declined)');
	});
});

describe('overlappingFiles', () => {
	const onCandidate = (root: string, file: string, text: string): void => {
		git(root, 'checkout', '-q', 'delendai/pr/candidate');
		writeFileSync(join(root, file), text);
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', `candidate edits ${file}`);
		git(root, 'push', '-q', 'origin', 'delendai/pr/candidate');
		git(root, 'checkout', '-q', 'develop');
		git(root, 'fetch', '-q', 'origin');
	};

<<<<<<< HEAD
	it('[<5000ms] names a file both the candidate and the integration branch changed since they met', () => {
=======
	it('[<3000ms] names a file both the candidate and the integration branch changed since they met', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		onCandidate(root, 'authored.ts', 'export const a = 3;\n');
		expect(
			overlappingFiles(
				root,
				'origin',
				'develop',
				'delendai/pr/candidate',
			),
		).toEqual(['authored.ts']);
	});

<<<<<<< HEAD
	it('[<5000ms] is empty when the candidate changed only files the integration branch did not', () => {
=======
	it('[<3000ms] is empty when the candidate changed only files the integration branch did not', () => {
>>>>>>> origin/develop
		const { root } = repoWithCandidate();
		onCandidate(root, 'other.ts', 'export const b = 1;\n');
		expect(
			overlappingFiles(
				root,
				'origin',
				'develop',
				'delendai/pr/candidate',
			),
		).toEqual([]);
	});
});

describe('conflictDetail', () => {
	const HOUR = 3600;
	const pack = 'delendai/pr/minimax-3/review/batch-all-g2/verdicts';

<<<<<<< HEAD
	it('[<5000ms] leaves the conflict to an author who is still around', () => {
=======
	it('[<50ms] leaves the conflict to an author who is still around', () => {
>>>>>>> origin/develop
		for (const input of [
			{ silentSeconds: 30 * HOUR, unitOnForge: true },
			{ silentSeconds: 2 * HOUR, unitOnForge: false },
		]) {
			expect(
				conflictDetail({
					candidate: pack,
					abandonedAfter: 4 * HOUR,
					...input,
				}),
			).toBe('does not merge trivially; its author decides');
		}
	});

<<<<<<< HEAD
	it('[<5000ms] says how an orphaned conflict ends once its author is gone', () => {
=======
	it('[<50ms] says how an orphaned conflict ends once its author is gone', () => {
>>>>>>> origin/develop
		const detail = conflictDetail({
			candidate: pack,
			silentSeconds: 30 * HOUR,
			abandonedAfter: 4 * HOUR,
			unitOnForge: false,
		});
		expect(detail).toContain('its author has been gone 30 h');
		expect(detail).toContain(`work retire --ref=${pack} --unowned`);
	});
});
