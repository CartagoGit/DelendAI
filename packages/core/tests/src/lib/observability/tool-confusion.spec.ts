#!/usr/bin/env bun
/**
 * tool-confusion.spec.ts — f00199 (Track M / q00006 §48).
 *
 * Synthetic data: the directed confusion matrix, top-N, symmetric
 * rename suggestions, dashboard formatter, persistence round-trip.
 */

import { describe, expect, it } from 'vitest';

import {
	createToolConfusion,
	DEFAULT_RENAME_THRESHOLD,
	hydrateConfusion,
	serializeConfusion,
	type IConfusionPair,
	type IToolConfusion,
} from '../../../../src/lib/observability/tool-confusion';

const buildConfused = (): IToolConfusion => {
	const c = createToolConfusion();
	// plugin_a.tool_x confused with plugin_a.tool_y, 7 times.
	for (let i = 0; i < 7; i += 1) {
		c.recordInvocation('plugin_a.tool_x', 'plugin_a.tool_y');
	}
	// plugin_b.tool_p confused with plugin_c.tool_q, 3 times.
	for (let i = 0; i < 3; i += 1) {
		c.recordInvocation('plugin_b.tool_p', 'plugin_c.tool_q');
	}
	// clean hits
	c.recordInvocation('plugin_a.tool_y');
	c.recordInvocation('plugin_a.tool_y', 'plugin_a.tool_y');
	c.recordInvocation('plugin_d.tool_z');
	return c;
};

describe('tool-confusion (f00199) — recordInvocation', () => {
	it('counts clean hits as non-confused', () => {
		const c = createToolConfusion();
		c.recordInvocation('a');
		c.recordInvocation('a', 'a');
		const snap = c.snapshot();
		expect(snap.total).toBe(2);
		expect(snap.confused).toBe(0);
	});

	it('counts directed edges when intendedTool differs', () => {
		const c = createToolConfusion();
		c.recordInvocation('a', 'b');
		c.recordInvocation('a', 'b');
		c.recordInvocation('a', 'b');
		const snap = c.snapshot();
		expect(snap.total).toBe(3);
		expect(snap.confused).toBe(3);
		expect(snap.directed.a?.b).toBe(3);
	});

	it('is asymmetric: confusion[a][b] ≠ confusion[b][a]', () => {
		const c = createToolConfusion();
		c.recordInvocation('a', 'b');
		c.recordInvocation('b', 'a');
		c.recordInvocation('a', 'b');
		const snap = c.snapshot();
		expect(snap.directed.a?.b).toBe(2);
		expect(snap.directed.b?.a).toBe(1);
	});
});

describe('tool-confusion (f00199) — topPairs', () => {
	it('returns the most-confused pairs first', () => {
		const c = buildConfused();
		const top = c.topPairs(5);
		expect(top[0]).toEqual<IConfusionPair>({
			actual: 'plugin_a.tool_x',
			intended: 'plugin_a.tool_y',
			count: 7,
		});
		expect(top[1]).toEqual<IConfusionPair>({
			actual: 'plugin_b.tool_p',
			intended: 'plugin_c.tool_q',
			count: 3,
		});
	});

	it('returns [] when n ≤ 0', () => {
		const c = buildConfused();
		expect(c.topPairs(0)).toEqual([]);
		expect(c.topPairs(-3)).toEqual([]);
	});

	it('honours n as the slice bound', () => {
		const c = buildConfused();
		expect(c.topPairs(1)).toHaveLength(1);
		expect(c.topPairs(10)).toHaveLength(2);
	});
});

describe('tool-confusion (f00199) — suggestRenames', () => {
	it('surfaces symmetric pairs above the threshold', () => {
		const c = buildConfused();
		const sug = c.suggestRenames(5);
		expect(sug).toHaveLength(1);
		expect(sug[0]).toEqual({
			a: 'plugin_a.tool_x',
			b: 'plugin_a.tool_y',
			symmetricCount: 7,
		});
	});

	it('does not double-count when one direction is missing', () => {
		const c = createToolConfusion();
		for (let i = 0; i < 6; i += 1) {
			c.recordInvocation('a', 'b');
		}
		const sug = c.suggestRenames(5);
		expect(sug).toHaveLength(1);
		expect(sug[0]?.symmetricCount).toBe(6);
	});

	it('default threshold is 5', () => {
		expect(DEFAULT_RENAME_THRESHOLD).toBe(5);
	});

	it('sorts suggestions by symmetric count desc', () => {
		const c = createToolConfusion();
		for (let i = 0; i < 9; i += 1) c.recordInvocation('a', 'b');
		for (let i = 0; i < 6; i += 1) c.recordInvocation('c', 'd');
		const sug = c.suggestRenames(5);
		expect(sug[0]?.symmetricCount).toBe(9);
		expect(sug[1]?.symmetricCount).toBe(6);
	});
});

describe('tool-confusion (f00199) — dashboard formatter', () => {
	it('emits Confusion section with top pairs and suggestions', () => {
		const c = buildConfused();
		const md = c.formatForDashboard({ topN: 3, threshold: 5 });
		expect(md).toContain('## Tool Confusion');
		expect(md).toContain('Confused invocations: 10 / 13');
		expect(md).toContain('### Top 3 pairs');
		expect(md).toContain('### Rename suggestions');
		expect(md).toContain('| plugin_a.tool_x | plugin_a.tool_y | 7 |');
		expect(md).toContain('| plugin_a.tool_x ↔ plugin_a.tool_y | 7 |');
	});

	it('renders empty placeholders when no data', () => {
		const c = createToolConfusion();
		const md = c.formatForDashboard();
		expect(md).toContain('Confused invocations: 0 / 0');
		expect(md).toContain('| — | — | 0 |');
		expect(md).toContain('| — | — |');
	});
});

describe('tool-confusion (f00199) — reset + persistence', () => {
	it('reset clears state', () => {
		const c = buildConfused();
		c.reset();
		expect(c.snapshot().total).toBe(0);
		expect(c.topPairs(5)).toEqual([]);
	});

	it('serialize → hydrate round-trip preserves the matrix', () => {
		const c1 = buildConfused();
		const file = serializeConfusion(c1);
		const c2 = hydrateConfusion(file);
		const a = c1.snapshot();
		const b = c2.snapshot();
		expect(b.total).toBe(a.total);
		expect(b.confused).toBe(a.confused);
		expect(b.directed['plugin_a.tool_x']?.['plugin_a.tool_y']).toBe(7);
		expect(b.directed['plugin_b.tool_p']?.['plugin_c.tool_q']).toBe(3);
	});

	it('hydrate rejects unknown version', () => {
		const c = hydrateConfusion({
			version: 2 as 1,
			directed: { a: { b: 1 } },
			total: 1,
			confused: 1,
		});
		expect(c.snapshot().total).toBe(0);
	});

	it('hydrate skips malformed entries without throwing', () => {
		const c = hydrateConfusion({
			version: 1,
			directed: {
				good: { ok: 2 },
				bad: null as unknown as Record<string, number>,
				badcount: { ok: -1 as unknown as number },
			},
			total: 999, // ignored — rebuilt from matrix
			confused: 999,
		});
		const snap = c.snapshot();
		expect(snap.directed.good?.ok).toBe(2);
		expect(snap.directed.bad).toBeUndefined();
		expect(snap.directed.badcount).toBeUndefined();
	});
});
