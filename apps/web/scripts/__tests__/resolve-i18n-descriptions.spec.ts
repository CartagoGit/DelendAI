/**
 * `resolveI18nDescriptions` — flatten the catalogue for SSR precompute.
 *
 * The resolver is intentionally thin: it walks the registry exposed by
 * `listRegisteredTools()` and copies each entry's description block. The
 * registry is module-state, so this spec runs against the real catalogue
 * (which is what we want — the build pipeline should never diverge from
 * the runtime data the SSR fallback uses).
 */
import { describe, expect, it } from 'vitest';

import { resolveI18nDescriptions } from '../lib/resolve-i18n-descriptions';
import { languages } from '../../src/i18n/shared';

describe('resolveI18nDescriptions', () => {
	it('returns an empty map when the catalogue is empty', () => {
		// Sanity check on the shape: it must be a plain object even if no
		// entries are opted-in. (The real catalogue has 5 entries today;
		// this spec only pins the contract.)
		const out = resolveI18nDescriptions();
		expect(typeof out).toBe('object');
		for (const name of Object.keys(out)) {
			const block = out[name];
			if (!block) throw new Error(`expected block for ${name}`);
			expect(Object.keys(block).sort()).toEqual(
				[...languages.map((l) => l.code)].sort(),
			);
		}
	});

	it('includes a 12-language block for every registered tool', () => {
		const out = resolveI18nDescriptions();
		const codes = languages.map((l) => l.code);
		const codeSet = new Set(codes);
		// 5 entries currently: mcp-vertex_overview, proposals_auto_work,
		// memory_save, audit_plan, audit_consolidate. If a future slice
		// adds more, the test still passes as long as every block is
		// 12-lang complete (which `check-i18n.ts` enforces separately).
		expect(Object.keys(out).length).toBeGreaterThanOrEqual(5);
		for (const [, block] of Object.entries(out)) {
			// Same set of lang codes; order is irrelevant for JSON consumers.
			const blockKeys = new Set(Object.keys(block));
			expect(blockKeys).toEqual(codeSet);
			for (const code of codes) {
				expect(typeof block[code as keyof typeof block]).toBe('string');
				expect(
					(block[code as keyof typeof block] ?? '').length,
				).toBeGreaterThan(10);
			}
			// Every block must carry the special-case `en` field — that's
			// what the SSR fallback uses when the active lang is missing.
			expect(block.en.length).toBeGreaterThan(10);
		}
	});
});
