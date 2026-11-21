#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import { createTokenBudgetRegistry } from '../../../../src/lib/budgets/registry';
import { createDashboardMockSource } from '../../../../src/lib/budgets/sources/dashboard-mock';
import { createStaticBytesSource } from '../../../../src/lib/budgets/sources/static-bytes';
import {
	TokenBudgetBreachError,
	type IBudgetCeiling,
	type IBudgetSource,
} from '../../../../src/lib/budgets/types';

const smallCeiling: IBudgetCeiling = {
	hard: 100,
	warning: 80,
	releaseRelativePercent: 20,
};

describe('TokenBudgetRegistry (f00186)', () => {
	it('throws when constructed with zero sources', () => {
		expect(() => createTokenBudgetRegistry({ sources: [] })).toThrow(
			/at least one source/,
		);
	});

	it('exposes a sorted list of source ids', () => {
		const reg = createTokenBudgetRegistry({
			sources: [
				createDashboardMockSource({ id: 'zzz', values: {} }),
				createStaticBytesSource({ id: 'aaa', payloads: {} }),
			],
		});
		expect(reg.sourceCount).toBe(2);
		expect(reg.sourceIds).toEqual(['aaa', 'zzz']);
	});

	it('sums measurements from every source and stamps a sourceId', () => {
		const reg = createTokenBudgetRegistry({
			sources: [
				createStaticBytesSource({
					id: 'static',
					payloads: { 'proposals.get': { id: 'q00006' } },
				}),
				createDashboardMockSource({
					id: 'mock',
					values: { 'proposals.get#schema': 200 },
				}),
			],
		});
		const m = reg.measure('schema', 'proposals.get');
		expect(m.surface).toBe('schema');
		expect(m.bytes).toBeGreaterThan(0);
		// First source (alphabetically) is `'mock'` (m < s), so its id
		// is the one stamped on the measurement.
		expect(m.sourceId).toBe('mock');
		expect(m.tokens).toBe(m.bytes / 4);
	});

	it('returns zero for unknown tools', () => {
		const reg = createTokenBudgetRegistry({
			sources: [createStaticBytesSource({ payloads: {} })],
		});
		const m = reg.measure('schema', 'unknown.tool');
		expect(m.bytes).toBe(0);
		expect(m.tokens).toBe(0);
	});

	it('validate throws TokenBudgetBreachError on hard breach', () => {
		const reg = createTokenBudgetRegistry({
			sources: [
				createStaticBytesSource({
					payloads: { 'too.big': { x: 'y'.repeat(500) } },
				}),
			],
		});
		expect(() => reg.validate('schema', 'too.big', smallCeiling)).toThrow(
			TokenBudgetBreachError,
		);
	});

	it('validate returns the measurement when under budget', () => {
		const reg = createTokenBudgetRegistry({
			sources: [
				createStaticBytesSource({
					payloads: { 'small.tool': { ok: true } },
				}),
			],
		});
		const m = reg.validate('schema', 'small.tool', smallCeiling);
		expect(m.bytes).toBeLessThanOrEqual(smallCeiling.hard);
	});

	it('report marks warning when bytes > ceiling.warning but <= hard', () => {
		const reg = createTokenBudgetRegistry({
			sources: [
				createStaticBytesSource({
					payloads: { 'mid.tool': { x: 'y'.repeat(90) } },
				}),
			],
		});
		const report = reg.report('mid.tool', {
			surfaces: ['schema'],
			ceiling: smallCeiling,
		});
		expect(report.measurements).toHaveLength(1);
		const row = report.measurements[0]!;
		expect(row.status).toBe('warning');
		expect(row.budget).toBe(smallCeiling.hard);
		expect(report.documentedDeficits).toHaveLength(0);
	});

	it('report lists documented deficits for breaches only', () => {
		const reg = createTokenBudgetRegistry({
			sources: [
				createStaticBytesSource({
					payloads: { 'huge.tool': { x: 'y'.repeat(500) } },
				}),
			],
		});
		const report = reg.report('huge.tool', {
			surfaces: ['schema'],
			ceiling: smallCeiling,
		});
		expect(report.documentedDeficits).toHaveLength(1);
		const deficit = report.documentedDeficits[0]!;
		expect(deficit.surface).toBe('schema');
		expect(deficit.ratio).toBeGreaterThan(1);
		expect(report.measurements[0]!.status).toBe('breach');
	});

	it('report marks status ok when no ceiling is supplied', () => {
		const reg = createTokenBudgetRegistry({
			sources: [
				createStaticBytesSource({
					payloads: { 'any.tool': { x: 'y'.repeat(500) } },
				}),
			],
		});
		const report = reg.report('any.tool', { surfaces: ['schema'] });
		expect(report.measurements[0]!.status).toBe('ok');
		expect(report.measurements[0]!.budget).toBeUndefined();
		expect(report.documentedDeficits).toHaveLength(0);
	});

	it('honors a custom bytesPerEstimatedToken', () => {
		const reg = createTokenBudgetRegistry({
			sources: [
				createStaticBytesSource({ payloads: { 'tok.test': { a: 1 } } }),
			],
			bytesPerEstimatedToken: 8,
		});
		const m = reg.measure('schema', 'tok.test');
		expect(m.tokens).toBe(m.bytes / 8);
	});

	it('accepts a sync measure function on a source', () => {
		const sync: IBudgetSource = {
			id: 'sync',
			measure: (_surface, toolId) => (toolId === 'fixed' ? 42 : 0),
		};
		const reg = createTokenBudgetRegistry({ sources: [sync] });
		expect(reg.measure('schema', 'fixed').bytes).toBe(42);
		expect(reg.measure('schema', 'other').bytes).toBe(0);
	});
});
