import { describe, expect, it } from 'vitest';

import { diagnoseDevelopRed } from '@delendai/core/lib/integration/land/develop-red.helper';
import type { IChangeFootprint } from '@delendai/core/lib/integration/decisions/overlap.interface';
import type { IDevelopMerge } from '@delendai/core/lib/integration/land/land.interface';

const fp = (
	files: string[],
	zones: string[] | 'everything' = [],
	readers: string[] = [],
): IChangeFootprint => ({
	files: new Set(files),
	zones: zones === 'everything' ? zones : new Set(zones),
	readers: new Set(readers),
});

const fakeForge = (merges: Record<number, IChangeFootprint>) => {
	const recorded = new Map<string, readonly string[]>();
	const list: IDevelopMerge[] = Object.keys(merges).map((n) => ({
		number: Number(n),
		sha: `sha${n}`,
	}));
	return {
		recorded,
		ports: {
			mergesBetween: (green: string, red: string) =>
				Promise.resolve(green === 'g' && red === 'r' ? list : []),
			footprintOf: (merge: IDevelopMerge) =>
				Promise.resolve(merges[merge.number] as IChangeFootprint),
			recordKnownFailing: (commit: string, specs: readonly string[]) => {
				recorded.set(commit, specs);
				return Promise.resolve();
			},
		},
	};
};

const red = (specs: string[], zones: string[] = []) => ({
	commit: 'r',
	failingSpecs: new Set(specs),
	failingZones: new Set(zones),
});

describe('diagnoseDevelopRed', () => {
	it('[<50ms] names the one merge whose files reach the failing spec', async () => {
		const { ports } = fakeForge({
			1: fp(['a.ts']),
			2: fp(['b.spec.ts']),
		});
		const out = await diagnoseDevelopRed(ports, {
			green: 'g',
			red: red(['b.spec.ts']),
		});
		expect(out.culprit).toEqual({ number: 2, sha: 'sha2' });
		expect(out.revertFirst).toEqual({ number: 2, sha: 'sha2' });
	});

	it('[<50ms] reaches a spec through a declared reader', async () => {
		const { ports } = fakeForge({
			1: fp(['docs/x.md'], [], ['p.spec.ts']),
			2: fp(['c.ts']),
		});
		const out = await diagnoseDevelopRed(ports, {
			green: 'g',
			red: red(['p.spec.ts']),
		});
		expect(out.culprit?.number).toBe(1);
	});

	it('[<50ms] lists suspects earliest first when no single merge owns it', async () => {
		const { ports } = fakeForge({
			1: fp([], ['core']),
			2: fp([], ['core']),
			3: fp(['z.ts']),
		});
		const out = await diagnoseDevelopRed(ports, {
			green: 'g',
			red: red([], ['core']),
		});
		expect(out.culprit).toBeUndefined();
		expect(out.suspects.map((m) => m.number)).toEqual([1, 2]);
		expect(out.revertFirst?.number).toBe(1);
	});

	it('[<50ms] has no revert target when no merge reaches the failure', async () => {
		const { ports } = fakeForge({ 1: fp(['a.ts']) });
		const out = await diagnoseDevelopRed(ports, {
			green: 'g',
			red: red(['q.spec.ts']),
		});
		expect(out.suspects).toEqual([]);
		expect(out.revertFirst).toBeUndefined();
	});

	it('[<50ms] records the failing spec ids as the known-failing set of the red commit', async () => {
		const { ports, recorded } = fakeForge({ 1: fp(['a.ts']) });
		await diagnoseDevelopRed(ports, {
			green: 'g',
			red: red(['a.spec.ts', 'b.spec.ts']),
		});
		expect(recorded.get('r')).toEqual(['a.spec.ts', 'b.spec.ts']);
	});
});
