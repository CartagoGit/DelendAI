/**
 * land-revert-git.service.spec.ts — a merge is reverted in a throwaway
 * worktree, pushed as the identity, and a conflict pushes nothing. Git is
 * scripted: no process runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
let conflict = false;

vi.mock('node:child_process', () => ({
	execFileSync: (command: string, args: string[]): string => {
		if (command === 'mktemp') return '/scratch\n';
		if (command !== 'git') return '';
		const sub = args.slice(2).join(' ');
		calls.push(sub);
		return '';
	},
}));

const { createRevertGit } = await import(
	'../../../../src/lib/services/land-revert-git.service'
);

const scripted =
	(dirty: boolean) =>
	(_cwd: string, args: readonly string[]): string => {
		const line = args.join(' ');
		calls.push(line);
		if (line.includes('revert -m 1') && conflict)
			throw new Error('conflict');
		if (line.startsWith('status')) return dirty ? ' M f' : '';
		return line.startsWith('rev-parse') ? 'sha-new' : '';
	};

let regenerates = true;
const build = (dirty = false, token = 'tok') =>
	createRevertGit({
		root: '/clone',
		remote: 'origin',
		token,
		regenerate: () => regenerates,
		exec: scripted(dirty),
	}).revertMerge({
		ref: 'p/repair/revert-7',
		tip: 'tip',
		merge: { number: 7, sha: 'm7' },
	});

beforeEach(() => {
	calls.length = 0;
	conflict = false;
	regenerates = true;
});

describe('createRevertGit', () => {
	it('[<50ms] reverts the merge on the first parent and pushes the ref as the identity', () => {
		expect(build()).toEqual({ kind: 'built', sha: 'sha-new' });
		expect(calls.some((c) => c.includes('revert -m 1 --no-edit m7'))).toBe(
			true,
		);
		expect(calls.some((c) => c.startsWith('push'))).toBe(true);
	});

	it('[<50ms] commits a regeneration the revert left behind', () => {
		build(true);
		expect(calls.some((c) => c.includes('commit -q -m'))).toBe(true);
	});

	it('[<50ms] a conflicting revert is aborted and pushes nothing', () => {
		conflict = true;
		expect(build()).toEqual({ kind: 'conflict' });
		expect(calls.some((c) => c.startsWith('push'))).toBe(false);
	});

	it('[<50ms] reports a failed regeneration and a refused push, pushing nothing without a token', () => {
		regenerates = false;
		expect(build().kind).toBe('failed');
		regenerates = true;
		const refused = build(false, '');
		expect(refused.kind).toBe('failed');
	});
});
