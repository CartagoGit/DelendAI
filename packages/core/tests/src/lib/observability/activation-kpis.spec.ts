#!/usr/bin/env bun
/**
 * activation-kpis.spec.ts — f00198 (Track M / q00006 §48).
 *
 * Synthetic data: precision/recall/jaccard math + the accumulator
 * (sessions, aggregate, dashboard formatter, round-trip serialize).
 * No I/O — the persistence layer is a pure transform.
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	createActivationKpis,
	hydrateKpis,
	intersectSize,
	jaccardDistance,
	precision,
	recall,
	serializeKpis,
	type IActivationKpis,
} from '../../../../src/lib/observability/activation-kpis';
import { createActivationKpiSessionStore } from '../../../../src/lib/observability/activation-kpis-session';

describe('activation-kpis (f00198) — pure math', () => {
	describe('intersectSize', () => {
		it('counts ids in both', () => {
			expect(intersectSize(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(2);
		});
		it('returns 0 on disjoint sets', () => {
			expect(intersectSize(['a', 'b'], ['c', 'd'])).toBe(0);
		});
		it('returns 0 on empty inputs', () => {
			expect(intersectSize([], ['a'])).toBe(0);
			expect(intersectSize(['a'], [])).toBe(0);
		});
		it('handles duplicates in A (idempotent count)', () => {
			expect(intersectSize(['a', 'a', 'b'], ['a', 'b'])).toBe(3);
		});
	});

	describe('precision', () => {
		it('undefined when invoked is empty', () => {
			expect(precision([], ['x', 'y'])).toBeUndefined();
		});
		it('1.0 when invoked ⊆ expected', () => {
			expect(precision(['a', 'b'], ['a', 'b', 'c'])).toBe(1);
		});
		it('0.5 when half invoked are expected', () => {
			expect(precision(['a', 'b'], ['a'])).toBe(0.5);
		});
		it('0.0 when no overlap', () => {
			expect(precision(['x', 'y'], ['a', 'b'])).toBe(0);
		});
	});

	describe('recall', () => {
		it('undefined when expected is empty', () => {
			expect(recall(['a', 'b'], [])).toBeUndefined();
		});
		it('1.0 when expected ⊆ invoked', () => {
			expect(recall(['a', 'b', 'c'], ['a', 'b'])).toBe(1);
		});
		it('0.5 when half expected were invoked', () => {
			expect(recall(['a'], ['a', 'b'])).toBe(0.5);
		});
	});

	describe('jaccardDistance', () => {
		it('0 on identical sets', () => {
			expect(jaccardDistance(['a', 'b'], ['a', 'b'])).toBe(0);
		});
		it('1 on disjoint sets', () => {
			expect(jaccardDistance(['a'], ['b'])).toBe(1);
		});
		it('0 on two empty sets', () => {
			expect(jaccardDistance([], [])).toBe(0);
		});
		it('1 when one side is empty (Jaccard = 0 / |B|)', () => {
			expect(jaccardDistance(['a'], [])).toBe(1);
			expect(jaccardDistance([], ['a'])).toBe(1);
		});
		it('half-overlap = 2/3 distance', () => {
			// {a,b} ∩ {b,c} = {b} (1); {a,b} ∪ {b,c} = {a,b,c} (3)
			expect(jaccardDistance(['a', 'b'], ['b', 'c'])).toBeCloseTo(
				1 - 1 / 3,
				10,
			);
		});
	});
});

describe('activation-kpis (f00198) — accumulator', () => {
	it('records a session and returns a snapshot', () => {
		const k = createActivationKpis();
		const s = k.recordSession({
			taskId: 't1',
			invoked: ['delendai_overview', 'delendai_git_status'],
			expected: ['delendai_overview'],
		});
		expect(s.precision).toBe(0.5);
		expect(s.recall).toBe(1);
		expect(s.diagnostics).toHaveLength(0);
		expect(k.sessions()).toHaveLength(1);
	});

	it('emits KPI-NO-EXPECTATIONS when invoked but no expected', () => {
		const k = createActivationKpis();
		const s = k.recordSession({
			taskId: 't1',
			invoked: ['a'],
			expected: [],
		});
		// invoked ∩ expected = ∅ → precision is 0 (well-defined);
		// recall is undefined (empty expected).
		expect(s.precision).toBe(0);
		expect(s.recall).toBeUndefined();
		expect(s.diagnostics.map((d) => d.code)).toContain(
			'KPI-NO-EXPECTATIONS',
		);
	});

	it('emits KPI-NO-INVOCATIONS when expected but no invoked', () => {
		const k = createActivationKpis();
		const s = k.recordSession({
			taskId: 't1',
			invoked: [],
			expected: ['a', 'b'],
		});
		// precision undefined (empty invoked); recall is 0.
		expect(s.precision).toBeUndefined();
		expect(s.recall).toBe(0);
		expect(s.diagnostics.map((d) => d.code)).toContain(
			'KPI-NO-INVOCATIONS',
		);
	});

	it('aggregate mean across multiple sessions', () => {
		const k = createActivationKpis();
		k.recordSession({
			taskId: 't1',
			invoked: ['a', 'b'],
			expected: ['a', 'b'],
		});
		k.recordSession({
			taskId: 't1',
			invoked: ['a', 'c'],
			expected: ['a', 'b'],
		});
		const agg = k.aggregate();
		expect(agg.sessionCount).toBe(2);
		expect(agg.meanPrecision).toBeCloseTo(0.75, 10); // (1 + 0.5) / 2
		expect(agg.meanRecall).toBeCloseTo(0.75, 10); // (1 + 0.5) / 2
	});

	it('churn measures Jaccard distance across consecutive sessions per task', () => {
		const k = createActivationKpis();
		// t1 first session — no churn contribution.
		k.recordSession({
			taskId: 't1',
			invoked: ['a', 'b'],
			expected: ['a', 'b'],
		});
		// t1 second session — same as first → distance 0.
		k.recordSession({
			taskId: 't1',
			invoked: ['a', 'b'],
			expected: ['a', 'b'],
		});
		// t1 third session — disjoint → distance 1.
		k.recordSession({
			taskId: 't1',
			invoked: ['c', 'd'],
			expected: ['c', 'd'],
		});
		// t2 session — own first, no churn contribution.
		k.recordSession({
			taskId: 't2',
			invoked: ['x'],
			expected: ['x'],
		});
		const agg = k.aggregate();
		// mean of [0, 1] = 0.5
		expect(agg.meanChurn).toBeCloseTo(0.5, 10);
	});

	it('first session of each task does not contribute to churn', () => {
		const k = createActivationKpis();
		k.recordSession({
			taskId: 't1',
			invoked: ['a'],
			expected: ['a'],
		});
		const agg = k.aggregate();
		expect(agg.meanChurn).toBeUndefined();
	});

	it('reset clears state', () => {
		const k = createActivationKpis();
		k.recordSession({
			taskId: 't1',
			invoked: ['a'],
			expected: ['a'],
		});
		k.reset();
		expect(k.sessions()).toHaveLength(0);
		expect(k.aggregate().sessionCount).toBe(0);
	});
});

describe('activation-kpis (f00198) — dashboard formatter', () => {
	const buildKpis = (): IActivationKpis => {
		const k = createActivationKpis();
		k.recordSession({
			taskId: 'audit',
			invoked: ['delendai_overview'],
			expected: ['delendai_overview'],
		});
		k.recordSession({
			taskId: 'audit',
			invoked: ['delendai_overview', 'delendai_tool_search'],
			expected: ['delendai_overview'],
		});
		return k;
	};

	it('emits aggregate and per-session sections', () => {
		const md = buildKpis().formatForDashboard();
		expect(md).toContain('## Activation KPIs');
		expect(md).toContain('### Aggregate');
		expect(md).toContain('### Per session');
		expect(md).toContain('| mean precision |');
		expect(md).toContain('| mean recall    |');
		expect(md).toContain('| mean churn     |');
		expect(md).toContain('| audit |');
	});
});

describe('activation-kpis (f00198) — persistence round-trip', () => {
	it('serializeKpis → hydrateKpis reproduces aggregate', () => {
		const k1 = createActivationKpis();
		k1.recordSession({
			taskId: 't1',
			invoked: ['a'],
			expected: ['a'],
		});
		k1.recordSession({
			taskId: 't1',
			invoked: ['a', 'b'],
			expected: ['a'],
		});
		const file = serializeKpis(k1);

		const k2 = hydrateKpis(file);
		const a1 = k1.aggregate();
		const a2 = k2.aggregate();
		expect(a2.sessionCount).toBe(a1.sessionCount);
		expect(a2.meanPrecision).toBeCloseTo(a1.meanPrecision ?? -1, 10);
		expect(a2.meanRecall).toBeCloseTo(a1.meanRecall ?? -1, 10);
	});

	it('hydrateKpis skips malformed sessions without throwing', () => {
		const k = hydrateKpis({
			version: 1,
			sessions: [
				{
					taskId: 'good',
					invoked: ['a'],
					expected: ['a'],
					precision: 1,
					recall: 1,
					diagnostics: [],
				},
				// Wrong shapes — must be skipped.
				{
					taskId: 42 as unknown as string,
					invoked: 'nope' as unknown as string[],
					expected: [],
					precision: 0,
					recall: 0,
					diagnostics: [],
				},
				{
					taskId: 'no-invoked',
					invoked: 'nope' as unknown as string[],
					expected: [],
					precision: 0,
					recall: 0,
					diagnostics: [],
				},
			],
		});
		expect(k.sessions()).toHaveLength(1);
		expect(k.sessions()[0]?.taskId).toBe('good');
	});

	it('hydrateKpis returns an empty store for malformed top-level input', () => {
		const fromWrongVersion = hydrateKpis({ version: 2, sessions: [] });
		expect(fromWrongVersion.sessions()).toHaveLength(0);

		const fromGarbage = hydrateKpis('not-json-shape');
		expect(fromGarbage.sessions()).toHaveLength(0);
	});

	it('hydrateKpis skips sessions with non-string invoked or expected ids', () => {
		const k = hydrateKpis({
			version: 1,
			sessions: [
				{
					taskId: 'good',
					invoked: ['a'],
					expected: ['a'],
					precision: 1,
					recall: 1,
					diagnostics: [],
				},
				{
					taskId: 'bad-invoked',
					invoked: ['a', 1] as unknown as string[],
					expected: ['a'],
					precision: 0.5,
					recall: 1,
					diagnostics: [],
				},
				{
					taskId: 'bad-expected',
					invoked: ['a'],
					expected: ['a', 1] as unknown as string[],
					precision: 1,
					recall: 0.5,
					diagnostics: [],
				},
			],
		});
		expect(k.sessions()).toHaveLength(1);
		expect(k.sessions()[0]?.taskId).toBe('good');
	});

	it('session store records runtime tool ids and persists completed sessions', async () => {
		let persisted = '';
		const workspaceRootAbs = await mkdtemp(
			join(tmpdir(), 'activation-kpis-'),
		);
		const store = createActivationKpiSessionStore({
			workspaceRootAbs,
			readFile: async () => persisted,
			writeFile: async (_path: string, content: string) => {
				persisted = content;
			},
		});

		await store.load();
		store.beginSession({
			taskId: 'audit',
			expected: ['overview'],
		});
		store.recordInvocation('overview');
		store.recordInvocation('unrelated');

		const session = await store.finishSession();

		expect(store.path).toBe(
			join(workspaceRootAbs, '.vscode/delendai/kpis.json'),
		);
		expect(session?.precision).toBe(0.5);
		expect(hydrateKpis(JSON.parse(persisted)).aggregate()).toMatchObject({
			sessionCount: 1,
			meanPrecision: 0.5,
			meanRecall: 1,
		});
	});
});
