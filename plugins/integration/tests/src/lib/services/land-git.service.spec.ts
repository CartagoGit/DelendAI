import { describe, expect, it } from 'vitest';

import type { IChangeFootprint, ILandPullRequest } from '@delendai/core/cli';
import { fakePartial } from '@delendai/test-kit';

import type {
	IGitExec,
	ILandProjectPorts,
} from '../../../../src/lib/contracts/interfaces/integration-pass.interface';
import { createLandGit } from '../../../../src/lib/services/land-git.service';

const FOOTPRINT = fakePartial<IChangeFootprint>({});

const recorder = (
	answer: (args: readonly string[]) => string,
): { readonly exec: IGitExec; readonly calls: string[] } => {
	const calls: string[] = [];
	return {
		calls,
		exec: (_cwd, args) => {
			calls.push(args.join(' '));
			return answer(args);
		},
	};
};

const landGit = (exec: IGitExec) =>
	createLandGit({
		root: '/clone',
		remote: 'origin',
		exec,
		ports: fakePartial<ILandProjectPorts>({
			derivedPaths: new Set(),
			footprintOf: () => FOOTPRINT,
		}),
	});

const pr = (testedBase: string, headSha: string) =>
	fakePartial<ILandPullRequest>({
		number: 7,
		headRef: 'topic',
		testedBase,
		headSha,
	});

describe('land git', () => {
	it('[<200ms] reads a footprint from commits it already has, without fetching', () => {
		const git = recorder(() => '');
		expect(landGit(git.exec).footprint(pr('base1', 'head1'))).toBe(
			FOOTPRINT,
		);
		expect(git.calls.every((line) => line.startsWith('cat-file'))).toBe(
			true,
		);
	});

	it('[<200ms] fetches a commit the clone lacks before reading it', () => {
		const git = recorder((args) => {
			if (args[0] === 'cat-file') throw new Error('missing');
			return '';
		});
		landGit(git.exec).landedSince('base1', 'tip1');
		expect(git.calls).toContain('fetch -q -- origin base1');
		expect(git.calls).toContain('fetch -q -- origin tip1');
	});

	it('[<200ms] names the tree of a commit', () => {
		const git = recorder((args) =>
			args[0] === 'rev-parse' ? 'tree123' : '',
		);
		expect(landGit(git.exec).treeOf('sha1')).toBe('tree123');
	});

	it('[<200ms] calls a pull request that shares no file with the tip conflict-free', () => {
		const git = recorder((args) =>
			args[0] === 'diff' && args[2]?.endsWith('...head1')
				? 'mine.ts\n'
				: args[0] === 'diff'
					? 'theirs.ts\n'
					: '',
		);
		expect(landGit(git.exec).conflictOf(pr('base1', 'head1'), 'tip1')).toBe(
			'none',
		);
	});
});
