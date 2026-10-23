/**
 * config-diff.spec.ts — f00142 S2 acceptance: the pure diff builder
 * groups recommended plugins against the project's currently-loaded
 * plugin ids so the host can preview a consent-gated config change.
 */
import { describe, expect, it } from 'vitest';

import { buildConfigDiff } from '@delendai/auto-plugin-selector/lib/apply/config-diff';
import type { IPluginFit } from '@delendai/auto-plugin-selector/lib/contracts/interfaces/plugin-fit.interface';

const pluginFit = (
	id: string,
	score: number,
	reasons: readonly string[] = [],
): IPluginFit => ({
	plugin: { id, tags: [], summary: `${id} plugin` },
	fitScore: score,
	reasons: [...reasons],
	unmatchedTags: [],
});

describe('buildConfigDiff', () => {
	it('returns empty groups when both lists are empty', () => {
		const diff = buildConfigDiff([], []);
		expect(diff).toEqual({ steps: [], adds: [], removes: [], keeps: [] });
	});

	it('classifies a recommended but-not-current plugin as "add"', () => {
		const diff = buildConfigDiff(
			[],
			[pluginFit('a', 1, ['pack:typescript'])],
		);
		expect(diff.adds).toHaveLength(1);
		expect(diff.adds[0]?.kind).toBe('add');
		expect(diff.adds[0]?.pluginId).toBe('a');
		expect(diff.adds[0]?.rationale).toContain('pack:typescript');
		expect(diff.removes).toHaveLength(0);
		expect(diff.keeps).toHaveLength(0);
	});

	it('classifies a current but-not-recommended plugin as "remove"', () => {
		const diff = buildConfigDiff(['legacy'], []);
		expect(diff.adds).toHaveLength(0);
		expect(diff.removes).toHaveLength(1);
		expect(diff.removes[0]?.pluginId).toBe('legacy');
		expect(diff.removes[0]?.rationale).toContain('no positive fit');
		expect(diff.keeps).toHaveLength(0);
	});

	it('classifies an intersection plugin as "keep"', () => {
		const diff = buildConfigDiff(
			['typescript'],
			[pluginFit('typescript', 1, ['pack:typescript'])],
		);
		expect(diff.adds).toHaveLength(0);
		expect(diff.removes).toHaveLength(0);
		expect(diff.keeps).toHaveLength(1);
		expect(diff.keeps[0]?.kind).toBe('keep');
		expect(diff.keeps[0]?.pluginId).toBe('typescript');
	});

	it('handles add + remove + keep in one call', () => {
		const diff = buildConfigDiff(
			['typescript', 'legacy'],
			[
				pluginFit('typescript', 1, ['pack:typescript']),
				pluginFit('new', 0.5, ['language:python']),
			],
		);
		expect(diff.adds.map((s) => s.pluginId)).toEqual(['new']);
		expect(diff.removes.map((s) => s.pluginId)).toEqual(['legacy']);
		expect(diff.keeps.map((s) => s.pluginId)).toEqual(['typescript']);
	});

	it('orders adds by fitScore desc, then id asc', () => {
		const diff = buildConfigDiff(
			[],
			[
				pluginFit('z', 0.5),
				pluginFit('a', 0.5),
				pluginFit('high', 1.0),
				pluginFit('mid', 0.7),
			],
		);
		expect(diff.adds.map((s) => s.pluginId)).toEqual([
			'high',
			'mid',
			'a',
			'z',
		]);
	});

	it('orders removes by id ascending', () => {
		const diff = buildConfigDiff(['z', 'a', 'm'], []);
		expect(diff.removes.map((s) => s.pluginId)).toEqual(['a', 'm', 'z']);
	});

	it('steps are adds → removes → keeps', () => {
		const diff = buildConfigDiff(
			['legacy', 'typescript'],
			[pluginFit('typescript', 1), pluginFit('new', 0.5)],
		);
		const kinds = diff.steps.map((s) => s.kind);
		expect(kinds.indexOf('add')).toBeLessThan(kinds.indexOf('remove'));
		expect(kinds.indexOf('remove')).toBeLessThan(kinds.indexOf('keep'));
	});

	it('is pure (same input -> same output)', () => {
		const a = buildConfigDiff(['typescript'], [pluginFit('typescript', 1)]);
		const b = buildConfigDiff(['typescript'], [pluginFit('typescript', 1)]);
		expect(a).toEqual(b);
	});

	it('handles duplicate recommendations by taking the last fit (Map semantics)', () => {
		// The pure scorer never emits duplicates, but if a caller does, the
		// diff builder resolves the last-seen fit for the id (Map.set wins).
		const diff = buildConfigDiff(
			[],
			[pluginFit('a', 0.5, ['first']), pluginFit('a', 0.9, ['second'])],
		);
		expect(diff.adds).toHaveLength(1);
		expect(diff.adds[0]?.fit?.fitScore).toBe(0.9);
		expect(diff.adds[0]?.rationale).toContain('second');
	});
});
