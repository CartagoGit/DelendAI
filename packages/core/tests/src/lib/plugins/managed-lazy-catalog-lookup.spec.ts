/**
 * managed-lazy-catalog-lookup.spec.ts — what is derived from the generated
 * catalog is computed in authored code, so the generated module exports
 * the catalog alone and a stale copy of it cannot stop its own generator.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MANAGED_LAZY_PLUGIN_CATALOG } from '@delendai/core/lib/plugins/managed-lazy-catalog.generated';
import { managedLazyPluginEntry } from '@delendai/core/lib/plugins/managed-lazy-catalog-lookup';

describe('managedLazyPluginEntry', () => {
	it('finds every catalogued plugin by its id', () => {
		for (const entry of MANAGED_LAZY_PLUGIN_CATALOG) {
			expect(managedLazyPluginEntry(entry.id)).toBe(entry);
		}
	});

	it('answers undefined for a plugin the catalog does not hold', () => {
		expect(managedLazyPluginEntry('not-a-plugin')).toBeUndefined();
	});
});

describe('the generated catalog module', () => {
	it('exports one runtime value, the catalog itself', () => {
		// The generator imports the core that imports this module. Any export
		// added here is one a stale copy lacks, and its absence fails the
		// import chain of the generator that would bring it back.
		const source = readFileSync(
			join(
				import.meta.dirname,
				'../../../../src/lib/plugins/managed-lazy-catalog.generated.ts',
			),
			'utf8',
		);
		const runtimeExports = [
			...source.matchAll(/^export (?:const|let|function|class) (\w+)/gmu),
		].map((match) => match[1]);
		expect(runtimeExports).toEqual(['MANAGED_LAZY_PLUGIN_CATALOG']);
	});
});
