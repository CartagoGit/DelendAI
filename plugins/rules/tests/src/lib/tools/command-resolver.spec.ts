import { describe, it, expect } from 'vitest';

import {
	fallbackCommandSetProvider,
	toAreaRulesLite,
} from '@mcp-vertex/rules/lib/tools/command-resolver';

/**
 * Single Responsibility: the `command-resolver` module exports
 * two helpers — a fallback `ICommandSetProvider` and a shape
 * adapter `toAreaRulesLite`. This spec pins each of them so a
 * future refactor of the legacy per-area shape cannot silently
 * change the registry's expectation.
 *
 * Interface Segregation: `toAreaRulesLite` is the *only* place
 * that knows the legacy `eslint` / `typecheck` field names. The
 * registry depends on the narrow `IAreaRulesLite`; this spec
 * proves the adapter still works.
 */
describe('command-resolver helpers (S, ISP)', () => {
	describe('fallbackCommandSetProvider', () => {
		it('emits a no-op command set (so check_rules can surface "missing linter")', () => {
			const out = fallbackCommandSetProvider.buildCommandSet('apps/foo', {
				linterConfigs: [],
				typecheckConfigs: [],
			});
			// The command is intentionally a no-op shell echo so
			// any agent that runs it gets a visible signal that
			// the plugin has no linter configured for this area.
			expect(out.checkCommand).toMatch(/^echo /);
			expect(out.fixCommand).toBeUndefined();
			expect(out.typecheckCommand).toBeUndefined();
		});
	});

	describe('toAreaRulesLite', () => {
		it('maps the legacy eslint / typecheck fields to the new shape', () => {
			const lite = toAreaRulesLite({
				eslint: [
					'apps/web/eslint.config.mjs',
					'.cache/.../react-ts.config.mjs',
				],
				typecheck: ['apps/web/tsconfig.json'],
			});
			expect(lite.linterConfigs).toEqual([
				'apps/web/eslint.config.mjs',
				'.cache/.../react-ts.config.mjs',
			]);
			expect(lite.typecheckConfigs).toEqual(['apps/web/tsconfig.json']);
		});

		it('handles an empty area (the `vanilla-js` fallback case)', () => {
			const lite = toAreaRulesLite({ eslint: [], typecheck: [] });
			expect(lite.linterConfigs).toEqual([]);
			expect(lite.typecheckConfigs).toEqual([]);
		});
	});
});
