import { describe, expect, it } from 'vitest';

import {
	applyReconciliationPlan,
	detectDrift,
	type IDriftDetection,
} from '../../../src/lib/reconciliation';

function isAncestorFactory(
	relations: Readonly<Record<string, readonly string[]>>,
): (child: string, parent: string) => boolean {
	return (child, parent) => relations[child]?.includes(parent) ?? false;
}

describe('reconciliation (c00524 S1)', () => {
	it('detectDrift returns equal when both SHAs and fingerprints match', () => {
		const detection = detectDrift({
			baseSha: 'a1',
			headSha: 'a1',
			baseFingerprint: 'fp-1',
			headFingerprint: 'fp-1',
			isAncestor: isAncestorFactory({}),
		});

		expect(detection.direction).toBe('equal');
		expect(detection.baseIsAncestor).toBe(true);
		expect(detection.headIsAncestor).toBe(true);
	});

	it('detectDrift returns behind when the base SHA is ancestor of the head SHA', () => {
		const detection = detectDrift({
			baseSha: 'a1',
			headSha: 'b2',
			baseFingerprint: 'fp-1',
			headFingerprint: 'fp-2',
			isAncestor: isAncestorFactory({ b2: ['a1'] }),
		});

		expect(detection.direction).toBe('behind');
		expect(detection.baseIsAncestor).toBe(true);
		expect(detection.headIsAncestor).toBe(false);
	});

	it('detectDrift returns ahead when the head SHA is ancestor of the base SHA', () => {
		const detection = detectDrift({
			baseSha: 'b2',
			headSha: 'a1',
			baseFingerprint: 'fp-2',
			headFingerprint: 'fp-1',
			isAncestor: isAncestorFactory({ b2: ['a1'] }),
		});

		expect(detection.direction).toBe('ahead');
		expect(detection.baseIsAncestor).toBe(false);
		expect(detection.headIsAncestor).toBe(true);
	});

	it('detectDrift returns diverged when neither SHA is ancestor of the other', () => {
		const detection = detectDrift({
			baseSha: 'a1',
			headSha: 'b2',
			baseFingerprint: 'fp-1',
			headFingerprint: 'fp-2',
			isAncestor: isAncestorFactory({}),
		});

		expect(detection.direction).toBe('diverged');
		expect(detection.baseIsAncestor).toBe(false);
		expect(detection.headIsAncestor).toBe(false);
	});

	it('applyReconciliationPlan returns a no-op step for equal drift', () => {
		const plan = applyReconciliationPlan(equalDetection());
		expect(plan.steps).toEqual([{ kind: 'no-op' }]);
	});

	it('applyReconciliationPlan returns an incremental step for behind drift', () => {
		const plan = applyReconciliationPlan({
			...equalDetection(),
			direction: 'behind',
			baseSha: 'a1',
			headSha: 'b2',
			baseIsAncestor: true,
			headIsAncestor: false,
		});

		expect(plan.steps).toEqual([
			{ kind: 'incremental-apply', baseSha: 'a1', headSha: 'b2' },
		]);
	});

	it('applyReconciliationPlan returns a full rebuild for ahead drift', () => {
		const plan = applyReconciliationPlan({
			...equalDetection(),
			direction: 'ahead',
			baseSha: 'b2',
			headSha: 'a1',
			baseIsAncestor: false,
			headIsAncestor: true,
		});

		expect(plan.steps).toHaveLength(1);
		expect(plan.steps[0]?.kind).toBe('full-rebuild');
	});

	it('applyReconciliationPlan returns a full rebuild for diverged drift', () => {
		const plan = applyReconciliationPlan({
			...equalDetection(),
			direction: 'diverged',
			baseSha: 'a1',
			headSha: 'b2',
			baseIsAncestor: false,
			headIsAncestor: false,
		});

		expect(plan.steps).toHaveLength(1);
		expect(plan.steps[0]?.kind).toBe('full-rebuild');
	});
});

function equalDetection(): IDriftDetection {
	return {
		direction: 'equal',
		baseSha: 'a1',
		headSha: 'a1',
		baseIsAncestor: true,
		headIsAncestor: true,
		baseFingerprint: 'fp-1',
		headFingerprint: 'fp-1',
	};
}