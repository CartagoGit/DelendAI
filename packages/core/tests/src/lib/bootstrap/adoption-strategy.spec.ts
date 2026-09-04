import { describe, expect, it } from 'vitest';

import { resolveAdoptionStrategy } from '@delendai/core/lib/bootstrap/adoption-strategy';

describe('resolveAdoptionStrategy', () => {
	it('defaults to replace for a new project', () => {
		const strategy = resolveAdoptionStrategy(
			{},
			{ hasExistingMcpProject: false },
		);
		expect(strategy.mode).toBe('replace');
		expect(
			strategy.operations.every(({ action }) => action === 'replace'),
		).toBe(true);
		expect(strategy.requiresExplicitReplacementConsent).toBe(false);
	});

	it('defaults to merge-only augmentation for an existing project', () => {
		const strategy = resolveAdoptionStrategy(
			{},
			{ hasExistingMcpProject: true },
		);
		expect(strategy.mode).toBe('augment');
		expect(
			strategy.operations.every(({ action }) => action === 'merge'),
		).toBe(true);
		expect(strategy.protectedCapabilities).toEqual([
			'skills',
			'agents',
			'mcp-config',
			'proposal-workflow',
		]);
	});

	it('preserves every capability outside a stable partial selection', () => {
		const strategy = resolveAdoptionStrategy(
			{
				mode: 'partial',
				selectedCapabilities: ['skills', 'tools', 'skills'],
			},
			{ hasExistingMcpProject: true },
		);
		expect(strategy.selectedCapabilities).toEqual(['tools', 'skills']);
		expect(strategy.operations).toEqual([
			{ capability: 'tools', action: 'merge' },
			{ capability: 'prompts', action: 'preserve' },
			{ capability: 'resources', action: 'preserve' },
			{ capability: 'knowledge', action: 'preserve' },
			{ capability: 'skills', action: 'merge' },
			{ capability: 'agents', action: 'preserve' },
			{ capability: 'mcp-config', action: 'preserve' },
			{ capability: 'proposal-workflow', action: 'preserve' },
		]);
	});

	it('requires an explicit selection for partial mode', () => {
		expect(() =>
			resolveAdoptionStrategy(
				{ mode: 'partial' },
				{ hasExistingMcpProject: true },
			),
		).toThrow('partial adoption requires at least one selected capability');
	});

	it('rejects selections on whole-project modes', () => {
		expect(() =>
			resolveAdoptionStrategy(
				{ mode: 'augment', selectedCapabilities: ['tools'] },
				{ hasExistingMcpProject: true },
			),
		).toThrow(
			'selectedCapabilities is only valid when adoption mode is partial',
		);
	});

	it('marks replacement of an existing project as consent-sensitive', () => {
		const strategy = resolveAdoptionStrategy(
			{ mode: 'replace' },
			{ hasExistingMcpProject: true },
		);
		expect(strategy.requiresExplicitReplacementConsent).toBe(true);
		expect(strategy.protectedCapabilities).toEqual([]);
	});
});
