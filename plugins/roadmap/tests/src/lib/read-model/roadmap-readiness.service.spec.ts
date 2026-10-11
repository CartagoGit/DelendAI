import { describe, expect, it } from 'vitest';

import type { IRoadmapGateEvidence } from '../../../../src/lib/contracts/interfaces/gate.interface';
import { horizonReadiness } from '../../../../src/lib/read-model/roadmap-readiness.service';
import { entry, horizon } from './read-model.fixture';

const paths = (existing: readonly string[]): IRoadmapGateEvidence => ({
	pathExists: (path) => existing.includes(path),
});

const pathGate = (target: string) => ({ kind: 'path-exists', target }) as const;

describe('horizonReadiness', () => {
	it('is ready when every promised entry is delivered and its gates pass', () => {
		const readiness = horizonReadiness(
			horizon('1.0.0', [
				entry('a', 'delivered', [pathGate('a.ts')]),
				entry('b', 'dropped', [pathGate('gone.ts')]),
			]),
			paths(['a.ts']),
		);
		expect(readiness.status).toBe('ready');
		expect(readiness.blockers).toEqual([]);
	});

	it('is not ready while a promised entry is open, and names it', () => {
		const readiness = horizonReadiness(
			horizon('1.0.0', [
				entry('a', 'delivered', [pathGate('a.ts')]),
				entry('b', 'in-progress'),
			]),
			paths(['a.ts']),
		);
		expect(readiness.status).toBe('not-ready');
		expect(readiness.blockers.map((each) => each.entryId)).toEqual(['b']);
		expect(readiness.reason).toContain('b');
	});

	it('is not ready when a delivered entry fails a gate', () => {
		const readiness = horizonReadiness(
			horizon('1.0.0', [entry('a', 'delivered', [pathGate('a.ts')])]),
			paths([]),
		);
		expect(readiness.status).toBe('not-ready');
		expect(readiness.blockers[0]?.gates.status).toBe('fail');
	});

	it('is unknown, not failed, when a gate has no evidence', () => {
		const readiness = horizonReadiness(
			horizon('1.0.0', [
				entry('a', 'delivered', [
					{ kind: 'check-green', target: 'build' },
				]),
			]),
			{},
		);
		expect(readiness.status).toBe('unknown');
		expect(readiness.unverified.map((each) => each.entryId)).toEqual(['a']);
		expect(readiness.blockers).toEqual([]);
	});

	it('lets only the declared gate kinds hold a promotion', () => {
		const delivered = entry('a', 'delivered', [
			{ kind: 'check-green', target: 'build' },
		]);
		expect(
			horizonReadiness(
				horizon('1.0.0', [delivered]),
				{},
				{
					blockingGates: ['path-exists'],
				},
			).status,
		).toBe('ready');
		expect(
			horizonReadiness(
				horizon('1.0.0', [delivered]),
				{},
				{
					blockingGates: ['check-green'],
				},
			).status,
		).toBe('unknown');
	});

	it('lets open entries through under the report policy, and lists them', () => {
		const readiness = horizonReadiness(
			horizon('1.0.0', [
				entry('a', 'delivered', [pathGate('a.ts')]),
				entry('b', 'committed'),
				entry('c', 'in-progress'),
			]),
			paths(['a.ts']),
			{ deferralPolicy: 'report' },
		);
		expect(readiness.status).toBe('ready');
		expect(readiness.toDefer).toEqual(['b', 'c']);
		expect(readiness.reason).toContain('b, c');
	});

	it('still fails an open entry whose gate fails under the report policy', () => {
		const readiness = horizonReadiness(
			horizon('1.0.0', [entry('b', 'committed', [pathGate('b.ts')])]),
			paths([]),
			{ deferralPolicy: 'report' },
		);
		expect(readiness.status).toBe('not-ready');
	});

	it('is ready for a horizon that promises nothing', () => {
		expect(horizonReadiness(horizon('1.0.0', []), {}).status).toBe('ready');
	});
});
