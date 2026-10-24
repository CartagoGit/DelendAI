/**
 * storm-detector.spec.ts — coverage for the x00419 S2 service.
 *
 * The detector is pure logic: events in, snapshot out, no I/O. We
 * test the sliding-window aggregation, threshold firing, memory
 * cap, eviction, and the inferSuggestedFix mapper.
 */

import { describe, expect, it } from 'vitest';

import {
	StormDetector,
	inferSuggestedFix,
} from '@delendai/commit-policy/lib/services/storm-detector';

const NOW = 1_700_000_000_000;

describe('StormDetector (x00419)', () => {
	it('returns an empty snapshot when no events have been observed', () => {
		const detector = new StormDetector();
		const snap = detector.snapshot(NOW);
		expect(snap.storms).toEqual([]);
		expect(snap.totalEventsInWindow).toBe(0);
		expect(snap.windowSeconds).toBe(30);
		expect(snap.threshold).toBe(5);
	});

	it('counts repeats per (trigger, code) tuple and emits a storm when the threshold is crossed', () => {
		const detector = new StormDetector({
			windowSeconds: 30,
			threshold: 3,
		});

		for (let i = 0; i < 5; i += 1) {
			detector.observe({
				timestamp: NOW + i * 1000,
				code: 'WORKSPACE_HAS_NO_FILES',
				trigger: 'slice',
				proposalId: `x00${170 + i}`,
			});
		}

		const snap = detector.snapshot(NOW + 5_000);
		expect(snap.storms).toHaveLength(1);
		const storm = snap.storms[0];
		expect(storm).toBeDefined();
		expect(storm?.code).toBe('WORKSPACE_HAS_NO_FILES');
		expect(storm?.trigger).toBe('slice');
		expect(storm?.count).toBe(5);
		expect(storm?.exceedsThreshold).toBe(true);
		expect(storm?.sampleProposalIds).toEqual([
			'x00170',
			'x00171',
			'x00172',
			'x00173',
			'x00174',
		]);
		expect(storm?.windowSeconds).toBe(30);
	});

	it('keeps distinct storms per (trigger, code) pair', () => {
		const detector = new StormDetector({ threshold: 1 });

		detector.observe({
			timestamp: NOW,
			code: 'WORKSPACE_HAS_NO_FILES',
			trigger: 'slice',
			proposalId: 'x1',
		});
		detector.observe({
			timestamp: NOW + 100,
			code: 'CAUSALITY_VIOLATION',
			trigger: 'slice',
			proposalId: 'x1',
		});
		detector.observe({
			timestamp: NOW + 200,
			code: 'WORKSPACE_HAS_NO_FILES',
			trigger: 'manual',
			proposalId: 'x2',
		});

		const snap = detector.snapshot(NOW + 500);
		expect(snap.storms).toHaveLength(3);
		const codes = snap.storms.map((s) => `${s.trigger}/${s.code}`).sort();
		expect(codes).toEqual([
			'manual/WORKSPACE_HAS_NO_FILES',
			'slice/CAUSALITY_VIOLATION',
			'slice/WORKSPACE_HAS_NO_FILES',
		]);
	});

	it('evicts timestamps older than the sliding window', () => {
		const detector = new StormDetector({
			windowSeconds: 10,
			threshold: 3,
		});

		// Three old events, all outside the 10s window at NOW+15s.
		detector.observe({
			timestamp: NOW,
			code: 'X',
			trigger: 'slice',
			proposalId: 'old-1',
		});
		detector.observe({
			timestamp: NOW + 1000,
			code: 'X',
			trigger: 'slice',
			proposalId: 'old-2',
		});
		detector.observe({
			timestamp: NOW + 2000,
			code: 'X',
			trigger: 'slice',
			proposalId: 'old-3',
		});

		// 15s later: window is [5s, 15s]. None of the old events survive.
		const snap = detector.snapshot(NOW + 15_000);
		expect(snap.storms).toHaveLength(0);
	});

	it('flags exceedsThreshold based on count, not just observation', () => {
		const detector = new StormDetector({ threshold: 5 });

		for (let i = 0; i < 3; i += 1) {
			detector.observe({
				timestamp: NOW + i,
				code: 'X',
				trigger: 'slice',
			});
		}
		const snap1 = detector.snapshot(NOW + 10);
		expect(snap1.storms[0]?.exceedsThreshold).toBe(false);
		expect(snap1.storms[0]?.count).toBe(3);

		detector.observe({ timestamp: NOW + 100, code: 'X', trigger: 'slice' });
		detector.observe({ timestamp: NOW + 200, code: 'X', trigger: 'slice' });
		const snap2 = detector.snapshot(NOW + 300);
		expect(snap2.storms[0]?.exceedsThreshold).toBe(true);
		expect(snap2.storms[0]?.count).toBe(5);
	});

	it('caps sampleProposalIds at maxSamplesPerStorm', () => {
		const detector = new StormDetector({
			threshold: 1,
			maxSamplesPerStorm: 3,
		});
		for (let i = 0; i < 10; i += 1) {
			detector.observe({
				timestamp: NOW + i,
				code: 'X',
				trigger: 'slice',
				proposalId: `p-${i}`,
			});
		}
		const snap = detector.snapshot(NOW + 100);
		expect(snap.storms[0]?.sampleProposalIds).toEqual([
			'p-7',
			'p-8',
			'p-9',
		]);
	});

	it('deduplicates consecutive duplicate proposalIds', () => {
		const detector = new StormDetector({ threshold: 1 });
		detector.observe({
			timestamp: NOW,
			code: 'X',
			trigger: 'slice',
			proposalId: 'dup',
		});
		detector.observe({
			timestamp: NOW + 1,
			code: 'X',
			trigger: 'slice',
			proposalId: 'dup',
		});
		detector.observe({
			timestamp: NOW + 2,
			code: 'X',
			trigger: 'slice',
			proposalId: 'new',
		});
		const snap = detector.snapshot(NOW + 100);
		expect(snap.storms[0]?.sampleProposalIds).toEqual(['dup', 'new']);
	});

	it('evicts the oldest bucket when the key cap is exceeded', () => {
		const detector = new StormDetector({
			threshold: 1,
			maxTrackedKeys: 2,
		});
		detector.observe({ timestamp: NOW, code: 'A', trigger: 'slice' });
		detector.observe({
			timestamp: NOW + 1000,
			code: 'B',
			trigger: 'slice',
		});
		detector.observe({
			timestamp: NOW + 2000,
			code: 'C',
			trigger: 'slice',
		});
		// 'A' had the oldest firstSeenAt; it should be evicted to make
		// room for 'C' at the maxTrackedKeys=2 cap.
		expect(detector.trackedKeyCount).toBe(2);
		const snap = detector.snapshot(NOW + 3000);
		const codes = snap.storms.map((s) => s.code).sort();
		expect(codes).toEqual(['B', 'C']);
	});

	it('sorts storms by count desc, then lastSeenAt desc', () => {
		const detector = new StormDetector({ threshold: 1 });
		detector.observe({
			timestamp: NOW,
			code: 'SMALL',
			trigger: 'slice',
			proposalId: 's1',
		});
		detector.observe({
			timestamp: NOW + 1000,
			code: 'BIG',
			trigger: 'slice',
			proposalId: 'b1',
		});
		detector.observe({
			timestamp: NOW + 1100,
			code: 'BIG',
			trigger: 'slice',
			proposalId: 'b2',
		});
		detector.observe({
			timestamp: NOW + 1200,
			code: 'BIG',
			trigger: 'slice',
			proposalId: 'b3',
		});
		const snap = detector.snapshot(NOW + 1500);
		expect(snap.storms.map((s) => s.code)).toEqual(['BIG', 'SMALL']);
		expect(snap.totalEventsInWindow).toBe(4);
	});

	it('preserves the suggestedFix from the first observed event with one', () => {
		const detector = new StormDetector({ threshold: 1 });
		detector.observe({
			timestamp: NOW,
			code: 'X',
			trigger: 'slice',
			suggestedFix: 'look at foo.ts',
		});
		detector.observe({
			timestamp: NOW + 100,
			code: 'X',
			trigger: 'slice',
			suggestedFix: 'ignored — already set',
		});
		const snap = detector.snapshot(NOW + 200);
		expect(snap.storms[0]?.suggestedFix).toBe('look at foo.ts');
	});

	it('infers suggestedFix in snapshot when the observed event does not provide one', () => {
		const detector = new StormDetector({ threshold: 1 });
		detector.observe({
			timestamp: NOW,
			code: 'WORKSPACE_HAS_NO_FILES',
			trigger: 'slice',
		});
		const snap = detector.snapshot(NOW + 100);
		expect(snap.storms[0]?.suggestedFix).toBe(
			inferSuggestedFix('WORKSPACE_HAS_NO_FILES'),
		);
	});

	it('reset() drops all in-memory state', () => {
		const detector = new StormDetector({ threshold: 1 });
		detector.observe({
			timestamp: NOW,
			code: 'X',
			trigger: 'slice',
		});
		detector.reset();
		expect(detector.trackedKeyCount).toBe(0);
		expect(detector.snapshot(NOW + 100).storms).toEqual([]);
	});

	it('hydrates a storm with historical firstSeenAt older than the retained window', () => {
		const detector = new StormDetector({
			threshold: 2,
			maxSamplesPerStorm: 3,
		});

		detector.hydrate({
			trigger: 'slice',
			code: 'X',
			firstSeenAt: NOW - 60_000,
			timestamps: [NOW - 10_000, NOW - 5_000, NOW - 5_000],
			sampleProposalIds: ['p-1', 'p-2', 'p-1', 'p-3', 'p-4'],
			suggestedFix: 'check x.ts',
		});

		const storm = detector.snapshot(NOW).storms[0];

		expect(storm?.firstSeenAt).toBe(NOW - 60_000);
		expect(storm?.windowStartedAt).toBe(NOW - 10_000);
		expect(storm?.count).toBe(2);
		expect(storm?.sampleProposalIds).toEqual(['p-2', 'p-3', 'p-4']);
		expect(storm?.suggestedFix).toBe('check x.ts');
	});

	it('hydrate is idempotent per bucket and does not inflate count on repeated replay', () => {
		const detector = new StormDetector({ threshold: 2 });
		const bucket = {
			trigger: 'slice',
			code: 'X',
			firstSeenAt: NOW - 45_000,
			timestamps: [NOW - 20_000, NOW - 10_000, NOW - 1_000],
			sampleProposalIds: ['a', 'b', 'c'],
		};

		detector.hydrate(bucket);
		detector.hydrate(bucket);

		const storm = detector.snapshot(NOW).storms[0];

		expect(storm?.count).toBe(3);
		expect(storm?.sampleProposalIds).toEqual(['a', 'b', 'c']);
	});
});

describe('inferSuggestedFix', () => {
	it('returns a hint for WORKSPACE_HAS_NO_FILES', () => {
		const hint = inferSuggestedFix('WORKSPACE_HAS_NO_FILES');
		expect(hint).toBeDefined();
		expect(hint).toMatch(/resolve-scope\.ts/);
	});

	it('returns a hint for CAUSALITY_VIOLATION', () => {
		const hint = inferSuggestedFix('CAUSALITY_VIOLATION');
		expect(hint).toBeDefined();
		expect(hint).toMatch(/engine\.ts/);
	});

	it('returns undefined for unknown codes', () => {
		expect(inferSuggestedFix('UNKNOWN_CODE')).toBeUndefined();
	});
});

describe('StormDetector — window bounds vs lifetime (x00419 review fix)', () => {
	const observe = (detector: StormDetector, timestamp: number): void => {
		detector.observe({
			code: 'WORKSPACE_HAS_NO_FILES',
			trigger: 'slice',
			timestamp,
		});
	};

	it('reports a window start bounded by the events actually counted', () => {
		// The bug this pins: `firstSeenAt` was stamped when the bucket
		// was created and never moved, so a storm that had been running
		// for an hour reported `count` over the last 30s alongside a
		// `firstSeenAt` an hour old. Every other number on the record is
		// window-scoped, so reading that as the start of the burst
		// overstated its age by the whole lifetime of the storm.
		const detector = new StormDetector({
			windowSeconds: 30,
			threshold: 2,
		});
		const start = NOW - 3_600_000; // an hour ago

		observe(detector, start);
		observe(detector, NOW - 20_000);
		observe(detector, NOW - 10_000);

		const storm = detector.snapshot(NOW).storms[0];

		expect(storm?.count).toBe(2);
		expect(storm?.windowStartedAt).toBe(NOW - 20_000);
		expect(storm?.lastSeenAt).toBe(NOW - 10_000);
	});

	it('keeps firstSeenAt stable across the lifetime, so repair ids do not churn', () => {
		// `repair-proposer` derives a repair id from `firstSeenAt`. If it
		// slid forward with the window, one ongoing storm would file a
		// fresh repair proposal every few minutes.
		const detector = new StormDetector({
			windowSeconds: 30,
			threshold: 2,
		});
		const start = NOW - 3_600_000;

		observe(detector, start);
		observe(detector, NOW - 20_000);

		expect(detector.snapshot(NOW).storms[0]?.firstSeenAt).toBe(start);

		observe(detector, NOW - 5_000);

		expect(detector.snapshot(NOW).storms[0]?.firstSeenAt).toBe(start);
	});

	it('makes the two agree while the whole storm still fits in the window', () => {
		const detector = new StormDetector({
			windowSeconds: 30,
			threshold: 2,
		});

		observe(detector, NOW - 10_000);
		observe(detector, NOW - 5_000);

		const storm = detector.snapshot(NOW).storms[0];

		expect(storm?.firstSeenAt).toBe(NOW - 10_000);
		expect(storm?.windowStartedAt).toBe(NOW - 10_000);
	});

	it('bounds the counted events between windowStartedAt and lastSeenAt', () => {
		const detector = new StormDetector({
			windowSeconds: 30,
			threshold: 2,
		});
		for (const offset of [3_600_000, 25_000, 15_000, 5_000]) {
			observe(detector, NOW - offset);
		}

		const storm = detector.snapshot(NOW).storms[0];

		expect(storm?.windowStartedAt).toBeLessThanOrEqual(
			storm?.lastSeenAt ?? 0,
		);
		expect(storm?.windowStartedAt).toBeGreaterThanOrEqual(
			NOW - (storm?.windowSeconds ?? 0) * 1000,
		);
	});
});
