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
} from '@mcp-vertex/commit-policy/lib/services/storm-detector';

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
