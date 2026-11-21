/**
 * managed-plugin-environment.spec.ts — `init` reads a first-party plugin's
 * environment requirements from the generated catalog, and the three
 * answers it can get mean three different things.
 */
import { describe, expect, it } from 'vitest';

import { MANAGED_LAZY_PLUGIN_CATALOG } from '@delendai/core/lib/plugins/managed-lazy-catalog.generated';
import { managedPluginEnvironmentRequirements } from '@delendai/core/lib/plugins/managed-plugin-environment';

describe('managedPluginEnvironmentRequirements', () => {
	it("returns a catalogued plugin's declared variables without importing it", () => {
		// `database` is the one first-party plugin that declares an
		// `env:` marker; this is the requirement `init` used to import 37
		// runtimes to discover.
		expect(managedPluginEnvironmentRequirements('database')).toEqual([
			expect.objectContaining({
				var: 'DATABASE_URL',
				plugin: 'database',
				provider: 'database',
			}),
		]);
	});

	it('returns an empty list for a catalogued plugin that needs nothing', () => {
		const quiet = MANAGED_LAZY_PLUGIN_CATALOG.find(
			(entry) => entry.environmentRequirements === undefined,
		);
		expect(quiet).toBeDefined();
		expect(managedPluginEnvironmentRequirements(quiet?.id ?? '')).toEqual(
			[],
		);
	});

	it('returns undefined for a plugin the catalog does not know', () => {
		// Distinct from `[]` on purpose: a third-party plugin in an
		// adopter's workspace is not catalogued, so the caller must still
		// ask the plugin itself.
		expect(
			managedPluginEnvironmentRequirements('a-third-party-plugin'),
		).toBeUndefined();
	});
});
