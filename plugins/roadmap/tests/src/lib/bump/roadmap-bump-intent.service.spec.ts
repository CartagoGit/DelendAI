import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IBumpInference } from '@delendai/changelog/public';

import type {
	IRoadmapEntry,
	IRoadmapHorizon,
} from '../../../../src/lib/contracts/interfaces/roadmap.interface';

const inferBumpSpy = vi.hoisted(() => vi.fn());

vi.mock('@delendai/changelog/public', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('@delendai/changelog/public')>();
	return {
		...original,
		inferBump: inferBumpSpy.mockImplementation(
			(commits: Parameters<typeof original.inferBump>[0]) =>
				original.inferBump(commits),
		),
	};
});

const { buildBumpIntent, deriveBumpFromKinds } = await import(
	'../../../../src/lib/bump/roadmap-bump-intent.service'
);
const { ROADMAP_BUMP_AUTHORITY } = await import(
	'../../../../src/lib/contracts/constants/bump-intent.constant'
);

const entry = (
	kind: IRoadmapEntry['kind'],
	state: IRoadmapEntry['state'] = 'committed',
): IRoadmapEntry => ({ id: kind, title: kind, kind, state, gates: [] });

const horizon = (
	entries: readonly IRoadmapEntry[],
	bumpHint?: IRoadmapHorizon['bumpHint'],
): IRoadmapHorizon => ({ version: '0.5.0', bumpHint, entries });

describe('bump intent', () => {
	beforeEach(() => {
		inferBumpSpy.mockClear();
	});

	it('asks the changelog plugin instead of ranking kinds itself', () => {
		const sentinel: IBumpInference = {
			kind: 'patch',
			reason: 'decided by the changelog plugin',
			considered: 99,
		};
		inferBumpSpy.mockReturnValueOnce(sentinel);
		const intent = buildBumpIntent(horizon([entry('breaking')]));
		expect(inferBumpSpy).toHaveBeenCalledTimes(1);
		expect(intent.kind).toBe('patch');
		expect(intent.reason).toBe(sentinel.reason);
		expect(intent.considered).toBe(99);
	});

	it('maps a breaking entry to major, a feature to minor, a fix to patch', () => {
		expect(deriveBumpFromKinds(['breaking', 'feature'])).toBe('major');
		expect(deriveBumpFromKinds(['feature', 'fix'])).toBe('minor');
		expect(deriveBumpFromKinds(['fix', 'chore'])).toBe('patch');
		expect(deriveBumpFromKinds(['chore'])).toBe('none');
		expect(deriveBumpFromKinds([])).toBe('none');
	});

	it('always names its authority', () => {
		const intent = buildBumpIntent(horizon([entry('feature')]));
		expect(intent.authority).toBe('@delendai/changelog::inferBump');
		expect(intent.authority).toBe(ROADMAP_BUMP_AUTHORITY);
	});

	it('leaves out entries the horizon no longer promises', () => {
		const intent = buildBumpIntent(
			horizon([entry('breaking', 'dropped'), entry('fix')]),
		);
		expect(intent.kind).toBe('patch');
		expect(intent.considered).toBe(1);
	});

	it('reports a declared hint that disagrees as data, not as an error', () => {
		const intent = buildBumpIntent(horizon([entry('feature')], 'patch'));
		expect(intent.declared).toBe('patch');
		expect(intent.coherent).toBe(false);
		expect(
			buildBumpIntent(horizon([entry('feature')], 'minor')).coherent,
		).toBe(true);
		expect(buildBumpIntent(horizon([entry('feature')])).coherent).toBe(
			true,
		);
	});
});
