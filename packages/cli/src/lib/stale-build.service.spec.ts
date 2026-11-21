import { describe, expect, it } from 'vitest';

import { runEntry } from '../index';
import {
	answeredWhenStale,
	describeStaleBuild,
	staleBuildOf,
} from './stale-build.service';

const BUILT = '/repo/packages/cli/dist/index.js';
const probe = (over: {
	readonly missing?: readonly string[];
	readonly builtAt?: number | undefined;
	readonly sourcesAt?: number | undefined;
}) => ({
	exists: (path: string) => !(over.missing ?? []).includes(path),
	modifiedMs: () => ('builtAt' in over ? over.builtAt : 1_000),
	newestSourceCommitMs: () => ('sourcesAt' in over ? over.sourcesAt : 2_000),
});

describe('staleBuildOf', () => {
	it('finds a build older than the sources beside it', () => {
		expect(staleBuildOf(BUILT, probe({}))).toEqual({
			root: '/repo',
			sourceEntry: '/repo/packages/cli/src/index.ts',
			builtAt: 1_000,
			sourcesAt: 2_000,
		});
	});

	it('does not judge a build as new as its sources', () => {
		expect(
			staleBuildOf(BUILT, probe({ builtAt: 3_000, sourcesAt: 2_000 })),
		).toBeUndefined();
	});

	it('does not judge an installed package, the source entry, or a build it cannot date', () => {
		expect(
			staleBuildOf(
				BUILT,
				probe({ missing: ['/repo/packages/cli/src/index.ts'] }),
			),
		).toBeUndefined();
		expect(
			staleBuildOf(BUILT, probe({ missing: ['/repo/.git'] })),
		).toBeUndefined();
		expect(
			staleBuildOf('/repo/packages/cli/src/index.ts', probe({})),
		).toBeUndefined();
		expect(
			staleBuildOf(BUILT, probe({ builtAt: undefined })),
		).toBeUndefined();
		expect(
			staleBuildOf(BUILT, probe({ sourcesAt: undefined })),
		).toBeUndefined();
	});

	it('reads the real disk when given no probe, and finds the sources not stale', () => {
		expect(
			staleBuildOf(`${process.cwd()}/packages/cli/src/index.ts`),
		).toBeUndefined();
	});
});

describe('what a stale build still answers', () => {
	it('answers the hooks and what only reads, and nothing that writes', () => {
		for (const command of [
			'guard',
			'doctor',
			'status',
			'--help',
			undefined,
		]) {
			expect(answeredWhenStale(command)).toBe(true);
		}
		for (const command of ['review', 'work', '__serve', 'init']) {
			expect(answeredWhenStale(command)).toBe(false);
		}
	});

	it('names the command that runs the current rules', () => {
		const said = describeStaleBuild(
			{
				root: '/repo',
				sourceEntry: '/repo/packages/cli/src/index.ts',
				builtAt: 1_000,
				sourcesAt: 2_000,
			},
			['review', 'next'],
		);
		expect(said).toContain(
			'bun /repo/packages/cli/src/index.ts review next',
		);
		expect(said).toContain('bun run build');
	});
});

describe('runEntry from a stale build', () => {
	const stale = () => ({
		root: '/repo',
		sourceEntry: '/repo/packages/cli/src/index.ts',
		builtAt: 1_000,
		sourcesAt: 2_000,
	});

	it('refuses a writing command and says why', async () => {
		const said: string[] = [];
		const code = await runEntry(['review', 'next'], '/repo', {
			staleBuild: stale,
			report: (line) => said.push(line),
		});
		expect(code).not.toBe(0);
		expect(said.join('\n')).toContain('older rules');
	});

	it('answers the handshake with the refusal instead of serving', async () => {
		const refused: string[] = [];
		let served = false;
		await runEntry(['__serve'], '/repo', {
			staleBuild: stale,
			report: () => undefined,
			refuse: async (refusal) => {
				refused.push(refusal);
			},
			serve: () => {
				served = true;
			},
		});
		expect(served).toBe(false);
		expect(refused[0]).toContain('older rules');
	});
});
