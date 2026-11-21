import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { admitWhileRed } from '@delendai/core/lib/integration/land/land-batch-assembly.helper';
import type {
	ILandCheck,
	ILandDeps,
	ILandForge,
	ILandPullRequest,
} from '@delendai/core/lib/integration/land/land.interface';

const pr = (number: number, labels: string[] = []): ILandPullRequest => ({
	number,
	headRef: `h${String(number)}`,
	headSha: `s${String(number)}`,
	draft: false,
	state: 'open',
	merged: false,
	labels,
	body: '',
	testedBase: 't',
});

const setup = (
	known: string[] | undefined,
	failing: Record<string, string[]>,
) => {
	const reasons: string[] = [];
	const deps = fakePartial<ILandDeps>({
		forge: fakePartial<ILandForge>({
			checks: (sha: string): Promise<readonly ILandCheck[]> =>
				Promise.resolve([
					{
						name: 'validate',
						conclusion: 'failure',
						failingSpecs: failing[sha] ?? [],
					},
				]),
		}),
		knownFailing: () =>
			Promise.resolve(known === undefined ? undefined : new Set(known)),
	});
	const report = {
		why: (_n: number, r: string) => void reasons.push(r),
		note: () => undefined,
		needsUpdate: () => undefined,
	};
	return { deps, report, reasons };
};

const numbers = (list: readonly ILandPullRequest[]) =>
	list.map((p) => p.number);

describe('admitWhileRed', () => {
	it('[<50ms] admits everyone while the integration branch is green', async () => {
		const { deps, report } = setup(undefined, { s1: ['x.spec.ts'] });
		expect(numbers(await admitWhileRed(deps, [pr(1)], report))).toEqual([
			1,
		]);
	});

	it('[<50ms] admits a repair and a pull request that shrinks the known failures', async () => {
		const { deps, report } = setup(['a.spec.ts', 'b.spec.ts'], {
			s2: ['a.spec.ts'],
			s3: [],
		});
		const out = await admitWhileRed(
			deps,
			[pr(1, ['delendai:repair']), pr(2), pr(3)],
			report,
		);
		expect(numbers(out)).toEqual([1, 2, 3]);
	});

	it('[<50ms] never admits a pull request that adds a failure', async () => {
		const { deps, report, reasons } = setup(['a.spec.ts'], {
			s1: ['a.spec.ts', 'new.spec.ts'],
			s2: ['new.spec.ts'],
		});
		expect(await admitWhileRed(deps, [pr(1), pr(2)], report)).toEqual([]);
		expect(reasons).toHaveLength(2);
	});

	it('[<50ms] does not admit a pull request that leaves the known failures unchanged', async () => {
		const { deps, report } = setup(['a.spec.ts'], { s1: ['a.spec.ts'] });
		expect(await admitWhileRed(deps, [pr(1)], report)).toEqual([]);
	});
});
