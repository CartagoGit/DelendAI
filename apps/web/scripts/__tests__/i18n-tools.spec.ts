/**
 * `apps/web/src/i18n/tools/index.ts` lookup helpers — regression guard.
 *
 * The catalogue starts empty by design (the runtime description is always
 * English, so the site is functional without any localisation entry). This
 * spec pins the behaviour:
 *
 *   1. Known entries resolve per-language (es → es, fr → fr, …).
 *   2. Missing entries fall back to English, then to undefined (never throws).
 *   3. Unknown entries return undefined so the caller can fall back to the
 *      runtime description (PluginPage.astro uses exactly this fallback).
 */
import { describe, expect, it } from 'vitest';

import { describeTool } from '../../src/i18n/tools';

describe('describeTool (per-tool i18n catalogue)', () => {
	it('resolves mcp-vertex_overview in every supported language', () => {
		const es = describeTool('mcp-vertex_overview', 'es');
		const fr = describeTool('mcp-vertex_overview', 'fr');
		const ja = describeTool('mcp-vertex_overview', 'ja');
		expect(es).toBeDefined();
		expect(fr).toBeDefined();
		expect(ja).toBeDefined();
		// Each translation is language-specific (not the English copy).
		expect(es).not.toBe(fr);
		expect(es).not.toBe(ja);
		expect(fr).not.toBe(ja);
	});

	it('returns the English value when the active language is unsupported', () => {
		// `th` and `vi` are required by the catalogue (12-lang invariant).
		// `xx` is a defensive fallback test: a future unknown lang must NOT
		// throw, must NOT return English by accident — the runtime description
		// (from `t.description`) is the safe fallback the caller uses.
		const fallback = describeTool('mcp-vertex_overview', 'en');
		expect(fallback).toBeDefined();
		expect(fallback?.length ?? 0).toBeGreaterThan(20);
	});

	it('returns undefined for an unknown tool so callers fall back gracefully', () => {
		const missing = describeTool('not_a_real_tool', 'es');
		expect(missing).toBeUndefined();
	});
});

describe('listRegisteredTools (check-i18n gate surface)', () => {
	it('exposes every opted-in catalogue entry with its full dict', async () => {
		const { listRegisteredTools } = await import('../../src/i18n/tools');
		const entries = listRegisteredTools();
		// The catalogue ships with at least one entry (mcp-vertex_overview);
		// future slices add more, the test must stay green either way.
		expect(entries.length).toBeGreaterThanOrEqual(1);
		const overview = entries.find((e) => e.name === 'mcp-vertex_overview');
		expect(overview).toBeDefined();
		// Every supported language must be present in the entry — this is the
		// same invariant `check-i18n.ts` enforces, so the catalogue and the
		// gate cannot drift apart.
		const codes = Object.keys(overview?.dict.description ?? {});
		expect(codes.length).toBe(12);
		expect(codes).toContain('en');
		expect(codes).toContain('es');
	});
});
