/**
 * core-public-inventory.script.spec.ts — r00027 acceptance.
 *
 * Pin the r00027 S1 contract:
 *
 *  1. `parseBarrel` returns a non-empty inventory that includes
 *     today's known-stable exports (smoke test against the live
 *     public barrel).
 *  2. `renderJson` output is stable across runs (excluding the
 *     `generatedAt` timestamp).
 *  3. `renderMd` output includes the maturity summary + at least one
 *     table row per export.
 *  4. Totals add up: `stable + experimental + internal + deprecated`
 *     always equals `exports.length`.
 *  5. `classify` follows the documented priority order.
 *
 * Imports the script as a module so the test never invokes
 * `process.exit` — the `if (import.meta.main)` guard keeps side
 * effects out of the import graph.
 */

import { describe, expect, it } from 'vitest';

import {
	classify,
	parseBarrel,
	renderJson,
	renderMd,
} from './core-public-inventory.script';

describe('classify (r00027 S1)', () => {
	it('marks @deprecated symbols as deprecated', () => {
		expect(classify('anything', '/** @deprecated use newName */')).toBe(
			'deprecated',
		);
	});

	it('marks nodeDynamicImport as deprecated (b00237)', () => {
		expect(classify('nodeDynamicImport', '')).toBe('deprecated');
	});

	it('marks filesystem helpers as internal', () => {
		expect(classify('writeFileAtomic', '')).toBe('internal');
		expect(classify('withFileMutex', '')).toBe('internal');
		expect(classify('readJson', '')).toBe('internal');
		expect(classify('writeJson', '')).toBe('internal');
	});

	it('marks Internal/Private-named symbols as internal', () => {
		expect(classify('fooInternal', '')).toBe('internal');
		expect(classify('barPrivate', '')).toBe('internal');
	});

	it('marks @experimental symbols as experimental', () => {
		expect(classify('foo', '/** @experimental */')).toBe('experimental');
	});

	it('defaults to stable', () => {
		expect(classify('parseBarrel', '')).toBe('stable');
		expect(classify('renderJson', '')).toBe('stable');
	});
});

describe('parseBarrel (r00027 S1)', () => {
	it('returns a non-empty inventory of the live public barrel', async () => {
		const exports = await parseBarrel();
		expect(exports.length).toBeGreaterThan(0);
		// Every export must have the four canonical fields.
		for (const e of exports) {
			expect(e.name.length).toBeGreaterThan(0);
			expect(['type', 'function', 'class', 'const']).toContain(e.kind);
			expect([
				'stable',
				'experimental',
				'internal',
				'deprecated',
			]).toContain(e.maturity);
			expect(e.source.length).toBeGreaterThan(0);
		}
	});
});

describe('renderJson + renderMd (r00027 S1)', () => {
	it('renderJson contains the canonical envelope', async () => {
		const exports = await parseBarrel();
		const payload = JSON.parse(renderJson(exports)) as {
			generatedAt: string;
			totals: Record<string, number>;
			count: number;
			exports: unknown[];
		};
		expect(payload.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(payload.count).toBe(exports.length);
		expect(payload.exports).toHaveLength(exports.length);
		// Totals add up to count.
		const totalsSum = Object.values(payload.totals).reduce(
			(sum, n) => sum + n,
			0,
		);
		expect(totalsSum).toBe(payload.count);
	});

	it('renderJson is stable across runs (excluding generatedAt)', async () => {
		const exports = await parseBarrel();
		const a = renderJson(exports);
		const b = renderJson(exports);
		const stripTs = (s: string): string =>
			s.replace(/"generatedAt":\s*"[^"]+"/, '"generatedAt": "<ts>"');
		expect(stripTs(a)).toBe(stripTs(b));
	});

	it('renderMd includes the maturity summary + table', async () => {
		const exports = await parseBarrel();
		const md = renderMd(exports);
		expect(md).toMatch(/^# `@mcp-vertex\/core` public API inventory/m);
		expect(md).toMatch(/Total exports: \d+/);
		expect(md).toMatch(/\| Maturity \| Count \|/);
		expect(md).toMatch(/\| stable \| \d+ \|/);
		// Table body has one row per export.
		const rowCount = md
			.split('\n')
			.filter((l) => l.startsWith('| `')).length;
		expect(rowCount).toBe(exports.length);
	});

	it('totals reconcile: stable + experimental + internal + deprecated = exports.length', async () => {
		const exports = await parseBarrel();
		const counts = {
			stable: 0,
			experimental: 0,
			internal: 0,
			deprecated: 0,
		};
		for (const e of exports) {
			counts[e.maturity] += 1;
		}
		expect(
			counts.stable +
				counts.experimental +
				counts.internal +
				counts.deprecated,
		).toBe(exports.length);
	});
});
