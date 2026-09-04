/**
 * plugin-add.spec.ts — x00161 S1: `buildPluginAddRecipe`'s "wire" step
 * must not describe monorepo-only work (tsconfig/vitest/preset-
 * catalog/publish-order/tool-outputs) to a caller that is an external
 * adopter project, not the `@delendai/core` monorepo itself.
 */
import { describe, expect, it } from 'vitest';

import { buildPluginAddRecipe } from '@delendai/core/public';

describe('buildPluginAddRecipe', () => {
	it('returns undefined for an unknown plugin id', () => {
		expect(buildPluginAddRecipe('not-a-real-plugin-id')).toBeUndefined();
	});

	it('defaults to adopter-safe wiring wording (monorepoDev unset)', () => {
		const recipe = buildPluginAddRecipe('audit');
		expect(recipe).toBeDefined();
		const wire = recipe?.steps.find((step) => step.kind === 'wire');
		expect(wire?.summary).not.toContain('six monorepo points');
		expect(wire?.summary).not.toContain('tsconfig');
		expect(wire?.summary).toContain('published dependency');
	});

	it('gives adopter-safe wiring wording when monorepoDev is explicitly false', () => {
		const recipe = buildPluginAddRecipe('audit', { monorepoDev: false });
		const wire = recipe?.steps.find((step) => step.kind === 'wire');
		expect(wire?.summary).not.toContain('tsconfig');
	});

	it('preserves the original six-monorepo-points wording when monorepoDev is true', () => {
		const recipe = buildPluginAddRecipe('audit', { monorepoDev: true });
		const wire = recipe?.steps.find((step) => step.kind === 'wire');
		expect(wire?.summary).toContain(
			'six monorepo points (tsconfig, vitest, plugin-defaults, preset-catalog, publish-order, regenerated tool-outputs)',
		);
	});

	it('still includes install and config steps unchanged regardless of monorepoDev', () => {
		const adopter = buildPluginAddRecipe('audit');
		const monorepo = buildPluginAddRecipe('audit', { monorepoDev: true });
		expect(adopter?.steps.map((s) => s.kind)).toEqual([
			'install',
			'wire',
			'config',
		]);
		expect(monorepo?.steps.map((s) => s.kind)).toEqual([
			'install',
			'wire',
			'config',
		]);
		const adopterInstall = adopter?.steps.find((s) => s.kind === 'install');
		const monorepoInstall = monorepo?.steps.find(
			(s) => s.kind === 'install',
		);
		expect(adopterInstall?.summary).toBe(monorepoInstall?.summary);
	});
});
