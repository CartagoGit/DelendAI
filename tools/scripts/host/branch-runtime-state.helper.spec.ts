import { describe, expect, it } from 'vitest';

import { runtimeState } from './branch-runtime.helper';

describe('runtimeState [<50ms]', () => {
	const fake =
		(answers: Record<string, string | undefined>) =>
		(_c: string, args: readonly string[]): string | undefined =>
			answers[args.join(' ')];

	it('is the tag when HEAD is exactly a release', () => {
		const run = fake({
			'rev-parse HEAD': 'a'.repeat(40),
			'describe --exact-match --tags HEAD': 'v0.3.0',
		});
		expect(runtimeState('/t', undefined, run)).toEqual({
			kind: 'tag',
			tag: 'v0.3.0',
			ahead: 0,
			behind: 0,
			dirty: false,
		});
	});

	it('is the branch at 12 characters with its distance and dirt', () => {
		const run = fake({
			'rev-parse HEAD': 'b'.repeat(40),
			'symbolic-ref -q --short HEAD': 'develop',
			'rev-list --left-right --count HEAD...origin/develop': '2\t3',
			'status --porcelain': ' M a.ts',
		});
		expect(runtimeState('/t', undefined, run)).toEqual({
			kind: 'branch',
			branch: 'develop',
			sha12: 'b'.repeat(12),
			ahead: 2,
			behind: 3,
			dirty: true,
		});
	});

	it('names the pinned branch for a detached tree and keeps the follow note', () => {
		const run = fake({
			'rev-parse HEAD': 'c'.repeat(40),
			'rev-list --left-right --count HEAD...origin/main': '0\t0',
			'status --porcelain': '',
		});
		const state = runtimeState('/t', 'main', run, 'fetch failed');
		expect(state?.branch).toBe('main');
		expect(state?.follow).toBe('fetch failed');
	});

	it('is nothing when git cannot read the tree', () => {
		expect(runtimeState('/t', undefined, fake({}))).toBe(undefined);
	});
});
