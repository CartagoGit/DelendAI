/**
 * options.spec.ts
 *
 * x00183 (F7): `subscription.tool` used to be a closed union of 4
 * runtime-known hosts (`vscode-copilot`, `claude-code`, `codex`,
 * `cursor`) baked into `@delendai/core`'s provider-capabilities
 * contract — adding a 5th host meant editing core. The field now
 * accepts any non-empty string; orchestrator-runner (not core) owns
 * deciding which hosts it actually knows how to drive.
 */
import { describe, expect, it } from 'vitest';

import type { IProviderCapabilities } from '@delendai/core/public';
import { PROVIDER_ENTRY_SCHEMA } from '@delendai/core/contracts';
import { rosterFor } from '../../../src/lib/options';

const baseProvider = {
	id: 'a-new-host',
	kind: 'subscription' as const,
	modelId: 'some-model',
	contextWindow: 128_000,
	costTier: 1 as const,
	strengths: [] as const,
	weaknesses: [] as const,
};

describe('the roster entry schema — subscription.tool', () => {
	it('accepts a runtime-known host', () => {
		const result = PROVIDER_ENTRY_SCHEMA.safeParse({
			...baseProvider,
			invoke: { kind: 'subscription', tool: 'claude-code' },
		});
		expect(result.success).toBe(true);
	});

	it('accepts a brand-new host id core has never heard of', () => {
		const result = PROVIDER_ENTRY_SCHEMA.safeParse({
			...baseProvider,
			invoke: { kind: 'subscription', tool: 'some-future-ide' },
		});
		expect(result.success).toBe(true);
	});

	it('still rejects an empty tool id', () => {
		const result = PROVIDER_ENTRY_SCHEMA.safeParse({
			...baseProvider,
			invoke: { kind: 'subscription', tool: '' },
		});
		expect(result.success).toBe(false);
	});
});

describe('rosterFor', () => {
	const root: readonly IProviderCapabilities[] = [
		{
			id: 'root-provider',
			kind: 'cli',
			invoke: { kind: 'cli', command: 'root-provider' },
			modelId: 'root-model',
			contextWindow: 200_000,
			costTier: 3,
			strengths: [],
			weaknesses: [],
		},
	];
	it('routes over the root roster when the plugin declares none', () => {
		expect(rosterFor(undefined, root)).toBe(root);
		expect(rosterFor(undefined, undefined)).toEqual([]);
	});

	it("keeps the plugin's own roster, an empty one included", () => {
		expect(rosterFor([{ id: 'own' }], root)).toEqual([{ id: 'own' }]);
		expect(rosterFor([], root)).toEqual([]);
	});
});
